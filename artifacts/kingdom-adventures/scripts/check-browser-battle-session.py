"""Targeted checks for api/_battle_runtime/browser_battle_session.py (Pyodide bridge).

Drives one recorded scenario through BrowserBattleSession and checks the bounded-window contract:

  * start() returns a windowed ka-battle-replay-1 at the declared horizon / window edge
  * advance() is bounded per call and preserves the already-displayed event prefix
  * every window is byte-identical to a fresh authoritative export_replay of the same schedule
    (the checkpoint resume is the runner's own output, not a re-implementation)
  * a consumable is applied at a displayed tick from a checkpoint strictly below it (no full re-run),
    keeps the prefix, and its branch equals a fresh authoritative export
  * retention stays within checkpoint_limit and the runtime's server job/session globals stay empty
  * the same call sequence is deterministic and a completed session stops windowing

Usage: python scripts/check-browser-battle-session.py
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent
RUNTIME = APP / 'api' / '_battle_runtime'
WORKSPACE = APP.parents[2]
SCENARIO = (WORKSPACE / 'RE-evidence/20260919-configurable-battle-setup/run-battle-16.5'
                       '/scenarios/S.scenario.json')
WINDOW = 40
HERB = 'holy_herb'

sys.path.insert(0, str(RUNTIME))

import browser_battle_session as bridge
import combat_interaction
from combat_replay_export import export_replay

CHECKS = []


def check(name, actual, expected):
    CHECKS.append(dict(name=name, passed=actual == expected, actual=actual, expected=expected))


def digest(events):
    return hashlib.sha256(json.dumps(events, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False).encode('utf-8')).hexdigest()


def canonical(payload):
    return json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def fresh(scenario, stop_tick):
    return export_replay(scenario, include_events=True, stop_tick=stop_tick)


def run():
    assert SCENARIO.is_file(), f'recorded scenario missing: {SCENARIO}'
    raw = json.loads(SCENARIO.read_text(encoding='utf-8'))

    session = bridge.BrowserBattleSession(raw, window_ticks=WINDOW)
    start = session.start()
    check('start returns the runner schema', start['schema'], 'ka-battle-replay-1')
    check('start is a live window at the window edge',
          [start['finalState']['windowed'], start['finalState']['windowStopTick'], session.stop_tick],
          [True, WINDOW, WINDOW])
    check('start keeps the declared tickLimit as ticks', start['ticks'], session.working['tickLimit'])
    check('start equals a fresh authoritative export of the same schedule',
          canonical(start), canonical(fresh(session.working, session.stop_tick)))
    check('retention is bounded after start',
          len(session._checkpoints) <= session.checkpoint_limit, True)

    advance = session.advance()
    check('advance is bounded by one window',
          [session.stop_tick > WINDOW, session.stop_tick <= WINDOW * 2], [True, True])
    old_prefix = [event for event in start['events'] if event['tick'] < WINDOW + 1]
    new_prefix = [event for event in advance['events'] if event['tick'] < WINDOW + 1]
    check('advance preserves the displayed event prefix', digest(old_prefix), digest(new_prefix))
    check('advance equals a fresh authoritative export',
          canonical(advance), canonical(fresh(session.working, session.stop_tick)))

    tick = max(event['tick'] for event in advance['events']) - 1
    below = [record['tick'] for record in session._checkpoints if record['tick'] < tick]
    check('a checkpoint strictly below the displayed tick is available',
          [bool(below), max(below) > 0 if below else False], [True, True])
    before_tick = [event for event in advance['events'] if event['tick'] < tick]
    result = session.use_consumable(HERB, tick=tick, displayed_tick=tick)
    check('the consumable is accepted by the runner', result['status'], 'accepted')
    stock = result['acceptance']['stock']
    check('the runner used the item and spent exactly one unit of the declared stock',
          [result['acceptance']['used'], stock['spent'], stock['after'], stock['before']],
          [True, True, stock['before'] - 1, stock['before']])
    check('the runner emitted its own battle_item at the displayed tick',
          any(event['tick'] == tick and event['kind'] == 'battle_item'
              and event.get('item') == HERB for event in result['replay']['events']), True)
    after_prefix = [event for event in result['replay']['events'] if event['tick'] < tick]
    check('the consumable preserves the prefix below its tick',
          digest(before_tick), digest(after_prefix))
    check('the branched window equals a fresh authoritative export',
          canonical(result['replay']), canonical(fresh(session.working, session.stop_tick)))
    check('the command is recorded on the session schedule',
          result['command']['tick'], tick)
    check('retention stays bounded after the consumable',
          len(session._checkpoints) <= session.checkpoint_limit, True)
    check('no server session/job globals were created',
          [len(combat_interaction._SESSIONS), len(combat_interaction._JOBS)], [0, 0])

    # Determinism: an identical call sequence yields byte-identical dictionaries.
    twin = bridge.BrowserBattleSession(json.loads(SCENARIO.read_text(encoding='utf-8')), window_ticks=WINDOW)
    twin_start = twin.start()
    twin_advance = twin.advance()
    twin_result = twin.use_consumable(HERB, tick=tick, displayed_tick=tick)
    check('start is deterministic', canonical(twin_start), canonical(start))
    check('advance is deterministic', canonical(twin_advance), canonical(advance))
    check('consumable is deterministic', canonical(twin_result['replay']), canonical(result['replay']))

    # A completed session stops windowing and refuses a tick beyond its edge.
    while not session.window_status()['complete']:
        session.advance(window_ticks=WINDOW)
    final = session.replay
    check('the fight completes with a full (non-windowed) replay',
          [session.window_status()['complete'], final['finalState']['windowed']], [True, False])
    try:
        session.use_consumable(HERB, tick=session.horizon + 5)
        refused = False
    except bridge.BrowserBattleSessionError as error:
        refused = error.code == 'browser-battle-tick-not-displayed'
    check('a tick beyond the simulated edge is refused', refused, True)

    failed = [entry['name'] for entry in CHECKS if not entry['passed']]
    print(json.dumps(dict(passed=len(CHECKS) - len(failed), total=len(CHECKS), failed=failed)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(run())
