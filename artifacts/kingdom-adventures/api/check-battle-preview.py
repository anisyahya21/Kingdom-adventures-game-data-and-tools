"""Focused local checks for the `ka-battle-preview-1` envelope of api/battle-run.py.

Drives the deployed handler over real HTTP on a loopback port and checks:

  GET   health still advertises the original three envelopes, plus previewSchema
  POST  ka-battle-preview-1 (R.scenario) -> allies + enemies, prepared cells/effective stats
  POST  ka-battle-preview-1 (G.scenario) -> owner-bound pet placement and unverified pet capacity
  POST  malformed preview requests       -> 400/413/422, path-scrubbed messages
  POST  preview while run_scenario/export_replay are tripwired -> still 200 (a preview never fights)
  POST  the original three envelopes     -> unchanged (delegated to api/check-battle-run.py)

Usage: python api/check-battle-preview.py
"""
import importlib.util
import json
import pathlib
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
FUNCTION = HERE / 'battle-run.py'
RUNTIME = HERE / '_battle_runtime'
WORKSPACE = HERE.parents[3]
SCENARIOS = (WORKSPACE / 'RE-evidence/20260919-configurable-battle-setup/run-battle-16.9/scenarios')


def load_function():
    spec = importlib.util.spec_from_file_location('battle_run_function', FUNCTION)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def request(port, method, body=None):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    req = urllib.request.Request(f'http://127.0.0.1:{port}/', data=data, method=method,
                                 headers={'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        raw = error.read().decode('utf-8', 'replace')
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {'code': 'non-json-error-body', 'raw': raw[:200]}


def main():
    assert RUNTIME.is_dir(), f'packaged runtime missing: {RUNTIME}'
    assert SCENARIOS.is_dir(), f'recorded scenarios missing: {SCENARIOS}'
    module = load_function()
    sys.path.insert(0, str(RUNTIME))
    from combat_scenario import load_scenario
    from combat_setup import prepare_setup

    def preview_body(name):
        scenario = json.loads((SCENARIOS / f'{name}.scenario.json').read_text(encoding='utf-8'))
        return scenario, dict(schema='ka-battle-preview-1', scenario=scenario)

    expected_units = {}
    for name in ('R', 'G'):
        scenario, _ = preview_body(name)
        normalized = load_scenario(scenario)
        setup = prepare_setup(scenario)
        expected_units[name] = (normalized, setup)

    server = ThreadingHTTPServer(('127.0.0.1', 0), module.handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = []

    def check(name, actual, expected):
        checks.append(dict(name=name, actual=actual, expected=expected, passed=actual == expected))

    status, health = request(port, 'GET')
    check('GET health', (status, health.get('status')), (200, 'ok'))
    check('GET advertises the preview schema', health.get('previewSchema'), 'ka-battle-preview-1')
    check('GET keeps the original envelope list', health.get('envelopes'),
          ['ka-special-combat-research-1', 'ka-battle-eval-1', 'ka-battle-search-1'])

    scenario, body = preview_body('R')
    status, preview = request(port, 'POST', body)
    normalized, setup = expected_units['R']
    check('POST preview status', status, 200)
    check('POST preview schema', preview.get('schema'), 'ka-battle-preview-1')
    check('POST preview returns no replay payload',
          sorted(key for key in preview if key not in ('schema', 'units', 'petLimits', 'diagnostics')),
          [])
    allies = [unit for unit in preview.get('units', []) if unit['side'] == 'ally']
    enemies = [unit for unit in preview.get('units', []) if unit['side'] == 'enemy']
    check('POST preview includes every selected ally', [u['name'] for u in allies],
          [u['name'] for u in normalized['ownUnits']])
    check('POST preview includes every encounter fighter', len(enemies),
          len(setup['encounter']['fighters']))
    check('POST preview ally cells match prepare_setup',
          [u['cell'] for u in allies], [list(row['cell']) for row in setup['ownUnits']])
    check('POST preview enemy cells match the encounter formation',
          [u['cell'] for u in enemies],
          [list(fighter['cell']) for fighter in setup['encounter']['fighters']])
    check('POST preview ally effective parameters match prepare_setup',
          [{pid: (row['effectiveValue'], row['effectiveMaximum']) for pid, row in u['parameters'].items()}
           for u in allies],
          [{str(pid): (row['value'], row['maximum'])
            for pid, row in prepared['effectiveParameters'].items()}
           for prepared in setup['ownUnits']])
    check('POST preview enemy effective parameters match the baseline',
          [{pid: (row['effectiveValue'], row['effectiveMaximum']) for pid, row in u['parameters'].items()}
           for u in enemies],
          [{pid: (row['rawValue'], row['rawMax']) for pid, row in fighter['parameters'].items()}
           for fighter in setup['encounter']['fighters']])
    check('POST preview exposes no entity ids or trace',
          any('entityId' in unit or 'events' in unit for unit in preview['units']), False)
    check('POST preview declares no unverified pet limit', [u['maxPets'] for u in preview['petLimits']],
          [None] if preview['petLimits'] else [])
    check('POST preview for a pet-free roster is diagnostic-free', preview.get('diagnostics'), [])
    status_again, preview_again = request(port, 'POST', body)
    check('POST preview is deterministic', json.dumps(preview_again, sort_keys=True),
          json.dumps(preview, sort_keys=True))

    scenario_g, body_g = preview_body('G')
    status, preview_g = request(port, 'POST', body_g)
    normalized_g, setup_g = expected_units['G']
    check('POST preview with pets status', (status, preview_g.get('schema')),
          (200, 'ka-battle-preview-1'))
    allies_g = [unit for unit in preview_g['units'] if unit['side'] == 'ally']
    pets = [unit for unit in allies_g if unit.get('petOwnerName')]
    check('POST preview places owner-bound pets after the selected members',
          [u['name'] for u in pets], ['House pet'])
    check('POST preview keeps the pet on its owner', [u['petOwnerName'] for u in pets], ['Guard D'])
    check('POST preview reports the pet cell from prepare_setup',
          [u['cell'] for u in pets], [list(row['cell']) for row in setup_g['ownUnits'][2:3]])
    check('POST preview keeps pets on the ally side',
          [u['side'] for u in pets], ['ally'])
    check('POST preview leaves pet capacity unset',
          [(row['owner'], row['maxPets'], row['attachedPets']) for row in preview_g['petLimits']],
          [('Guard D', None, 1)])
    check('POST preview discloses unverified pet capacity',
          [row['code'] for row in preview_g.get('diagnostics', [])], ['pet-capacity-unverified'])
    check('POST preview pet diagnostic mentions no invented cap',
          any('no count cap' in row['message'] for row in preview_g.get('diagnostics', [])), True)

    status, payload = request(port, 'POST', dict(schema='ka-battle-preview-1'))
    check('preview without a scenario -> 400', (status, payload.get('code')), (400, 'invalid-request'))
    status, payload = request(port, 'POST', dict(schema='ka-battle-preview-1', scenario=[]))
    check('preview with a non-object scenario -> 400', (status, payload.get('code')),
          (400, 'invalid-request'))
    status, payload = request(port, 'POST', dict(schema='ka-battle-preview-1',
                                                 scenario=dict(scenario, schema='ka-other-1')))
    check('preview with a foreign inner schema -> 422', (status, payload.get('code')),
          (422, 'preview-rejected'))
    check('preview rejection leaks no path or traceback',
          ('Traceback' in json.dumps(payload)) or ('C:\\' in json.dumps(payload)), False)
    status, payload = request(port, 'POST', dict(schema='ka-battle-preview-1',
                                                 scenario=dict(scenario, tickLimit=module.MAX_TICK_LIMIT + 1)))
    check('preview tick limit is enforced -> 422', (status, payload.get('code')),
          (422, 'tick-limit-too-large'))
    units = list(scenario['ownUnits']) * (module.MAX_OWN_UNITS + 1)
    status, payload = request(port, 'POST', dict(schema='ka-battle-preview-1',
                                                 scenario=dict(scenario, ownUnits=units)))
    check('preview unit limit is enforced -> 422', (status, payload.get('code')),
          (422, 'too-many-units'))
    status, payload = request(port, 'POST', b'x' * (module.MAX_BODY_BYTES + 10))
    check('preview oversized body -> 413', status, 413)
    status, payload = request(port, 'POST', {'schema': 'ka-battle-unknown-1'})
    check('unknown schema -> 400', (status, payload.get('code')), (400, 'invalid-request'))
    server.shutdown()

    import combat_replay_export
    import combat_sandbox

    def forbidden(*_args, **_kwargs):
        raise AssertionError('preview must not run combat')

    saved = (combat_sandbox.run_scenario, combat_replay_export.run_scenario,
             combat_replay_export.export_replay)
    combat_sandbox.run_scenario = forbidden
    combat_replay_export.run_scenario = forbidden
    combat_replay_export.export_replay = forbidden
    try:
        status, payload = module.handle_request(json.dumps(body).encode())
        check('preview still answers while run_scenario/export_replay are tripwired',
              (status, payload.get('schema')), (200, 'ka-battle-preview-1'))
        check('preview while tripwired keeps every prepared ally',
              len([u for u in payload['units'] if u['side'] == 'ally']),
              len(normalized['ownUnits']))
    finally:
        (combat_sandbox.run_scenario, combat_replay_export.run_scenario,
         combat_replay_export.export_replay) = saved

    failed = [entry['name'] for entry in checks if not entry['passed']]
    print(json.dumps(dict(passed=len(checks) - len(failed), total=len(checks), failed=failed)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
