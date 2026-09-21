"""Local transport checks for api/battle-run.py across all three request envelopes.

Loads the deployed handler module by path, drives it over real HTTP on a loopback port against the
packaged runtime under `api/_battle_runtime/`, and checks:

  GET   health lists the scenario/eval/search envelopes and never runs a battle
  POST  ka-special-combat-research-1  -> ka-battle-replay-1 (unchanged 16.8 contract)
  POST  ka-battle-eval-1              -> ka-battle-eval-1 (compact ranking + winner replay)
  POST  ka-battle-search-1            -> ka-battle-search-1 (bounded enumeration + winner replay)
  POST  negatives                     -> 400 unknown schema, 422 rejected eval/search, 413 oversize
  PUT/DELETE                          -> 405

Usage: python api/check-battle-run.py
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
SCENARIO = (WORKSPACE / 'RE-evidence/20260919-configurable-battle-setup/run-battle-16.5'
                       '/scenarios/R.scenario.json')


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
    assert SCENARIO.is_file(), f'recorded scenario missing: {SCENARIO}'
    module = load_function()
    server = ThreadingHTTPServer(('127.0.0.1', 0), module.handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = []

    def check(name, actual, expected):
        checks.append(dict(name=name, actual=actual, expected=expected, passed=actual == expected))

    status, health = request(port, 'GET')
    check('GET health', (status, health.get('status')), (200, 'ok'))
    check('GET lists the eval schema', health.get('evalSchema'), 'ka-battle-eval-1')
    check('GET lists the search schema', health.get('searchSchema'), 'ka-battle-search-1')
    check('GET lists all envelopes', health.get('envelopes'),
          ['ka-special-combat-research-1', 'ka-battle-eval-1', 'ka-battle-search-1'])
    check('GET never returns a replay', 'events' in health, False)

    scenario = json.loads(SCENARIO.read_text(encoding='utf-8'))
    team = {key: value for key, value in scenario.items()
            if key not in ('schema', 'encounterId', 'defeatCount', 'mathSeed', 'libSeed', 'tickLimit')}
    status, replay = request(port, 'POST', dict(scenario, tickLimit=3000))
    check('POST scenario status', status, 200)
    check('POST scenario schema', replay.get('schema'), 'ka-battle-replay-1')
    check('POST scenario exports finish', isinstance(replay.get('finish'), dict), True)
    entitlement = replay.get('finalState', {}).get('rewardEntitlement', {})
    check('POST scenario exports reward entitlement', isinstance(entitlement.get('pendingChestCount'), int), True)
    check('POST scenario requires victory for rewards', entitlement.get('victoryRequired'), True)
    check('POST scenario keeps verdict independent of Finish',
          entitlement.get('battleVerdict'), replay.get('finalState', {}).get('verdict'))
    check('POST scenario discloses postFinish', replay.get('postFinish', {}).get('exp'), 'not modelled')

    # Regression: a possessed type-48 EQUIP_MASTER resistance row must not fail the run
    # (skill 89 "<Bow> Resistance", native SkillData.TYPE_EQUIP_MASTER 48). The row stays in the
    # possessed list and lifts only a matching equipment type's declared affinity 0 to 1
    # (JobData.GetAffinity 0x16208d0); a row for another weapon type leaves the contribution halved.
    def resisted(skill):
        units = json.loads(json.dumps(team['ownUnits']))
        archer = units[1]  # Archer C: D/ Bow (equipment type 8)
        bow = next(slot for slot in archer['equipment'] if slot['id'] == archer['weaponId'])
        bow['affinity'] = 0
        archer['skills'], archer['invocationLevels'] = [skill], [1]
        return dict(scenario, tickLimit=200, ownUnits=units)

    def archer_attack_gain(response):
        units = response.get('units') or []
        if len(units) < 2:
            return None
        raw = units[1]['parameters']['13']['raw']
        return units[1]['parameters']['13']['effectiveValue'] - raw['rawValue'] - raw['extraValue']

    status, replay = request(port, 'POST', resisted(89))  # Bow Resistance value 8 == bow type 8
    check('POST type48 resistance skill status', status, 200)
    check('POST type48 resistance skill schema', replay.get('schema'), 'ka-battle-replay-1')
    check('POST type48 resistance skill retained', [u.get('skillIds') for u in replay.get('units', [])][:2],
          [[37, 109], [89]])
    check('POST type48 matching resistance lifts affinity 1', archer_attack_gain(replay), 20)
    status, replay = request(port, 'POST', resisted(82))  # Sword Resistance value 1 != bow type 8
    check('POST type48 nonmatching resistance stays weak', archer_attack_gain(replay), 10)
    # A genuinely unsupported row is an actionable validation rejection (422), never a generic 500,
    # and the message names the row so the caller knows which skill to drop.
    status, payload = request(port, 'POST', resisted(44))  # Thief: type 3, category 2
    check('POST unsupported skill -> 422', status, 422)
    check('POST unsupported skill code', payload.get('code'), 'scenario-rejected')
    check('POST unsupported skill names the row',
          '44' in payload.get('message', '') and 'Thief' in payload.get('message', ''), True)
    check('POST unsupported skill leaks no traceback', 'Traceback' in json.dumps(payload), False)

    status, payload = request(port, 'POST', dict(schema='ka-battle-eval-1', tickLimit=3000,
                                                 limits=dict(maxRuns=2),
                                                 levels=[dict(encounterId=19, defeatCount=0)],
                                                 seeds=[[7, 8]],
                                                 candidates=[dict(id='R', scenario=team)]))
    check('POST eval status', status, 200)
    check('POST eval schema', payload.get('schema'), 'ka-battle-eval-1')
    check('POST eval withholds untrusted ranking', payload.get('ranking'), [])
    check('POST eval discloses the seed list', payload.get('request', {}).get('seeds'), [[7, 8]])
    check('POST eval has no untrusted winner', payload.get('selected'), None)
    check('POST eval has no winner replay', payload.get('replay'), None)
    check('POST eval names the excluded candidate', [row['id'] for row in payload.get('unranked', [])], ['R'])
    check('POST eval explains automatic Finish blocker',
          any('no automatic native producer' in reason
              for row in payload.get('unranked', []) for reason in row['reasons']), True)
    check('POST eval returns no run traces', 'events' in json.dumps(payload.get('candidates')), False)

    status, payload = request(port, 'POST', dict(schema='ka-battle-search-1', tickLimit=3000,
                                                 limits=dict(maxRuns=2),
                                                 levels=[dict(encounterId=19, defeatCount=0)],
                                                 seeds=[[7, 8]],
                                                 candidates=[dict(id='R', scenario=team)],
                                                 variants=[dict(id='A', patch=dict(holyHerbStock=2)),
                                                           dict(id='B', patch=dict(holyHerbStock=3))]))
    check('POST search status', status, 200)
    check('POST search schema', payload.get('schema'), 'ka-battle-search-1')
    check('POST search enumerates candidate x variant', payload.get('enumeration', {}).get('combinations'), 2)
    check('POST search claims bounded enumeration',
          'no global optimum is claimed' in payload.get('claim', ''), True)
    check('POST search withholds untrusted ranking', payload.get('ranking'), [])
    check('POST search has no winner replay', payload.get('replay'), None)
    check('POST search excludes both measured combinations', len(payload.get('unranked', [])), 2)
    check('POST search explains automatic Finish blocker',
          all(any('no automatic native producer' in reason for reason in row['reasons'])
              for row in payload.get('unranked', [])), True)

    status, payload = request(port, 'POST', dict(schema='ka-battle-eval-1', tickLimit=3000,
                                                 limits=dict(maxRuns=1),
                                                 levels=[dict(encounterId=19, defeatCount=0)],
                                                 seeds=[[7, 8], [9, 10]],
                                                 candidates=[dict(id='R', scenario=team)]))
    check('oversized eval budget -> 422', status, 422)
    check('oversized eval budget code', payload.get('code'), 'evaluation-rejected')

    status, payload = request(port, 'POST', dict(schema='ka-battle-search-1', tickLimit=3000,
                                                 levels=[dict(encounterId=19, defeatCount=0)],
                                                 seeds=[[7, 8]],
                                                 candidates=[dict(id='R', scenario=team)],
                                                 variants=[dict(id='A', patch=dict(encounterId=5))]))
    check('swept variant patch -> 422', status, 422)
    check('swept variant patch code', payload.get('code'), 'search-rejected')
    check('search rejection leaks no traceback', 'Traceback' in json.dumps(payload), False)

    status, payload = request(port, 'POST', {'schema': 'ka-battle-unknown-1'})
    check('unknown schema -> 400', (status, payload.get('code')), (400, 'invalid-request'))
    status, payload = request(port, 'POST', b'x' * (module.MAX_BODY_BYTES + 10))
    check('oversized body -> 413', status, 413)
    check('PUT -> 405', request(port, 'PUT', scenario)[0], 405)
    check('DELETE -> 405', request(port, 'DELETE')[0], 405)

    server.shutdown()
    failed = [entry['name'] for entry in checks if not entry['passed']]
    print(json.dumps(dict(passed=len(checks) - len(failed), total=len(checks), failed=failed)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
