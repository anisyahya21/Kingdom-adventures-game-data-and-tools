"""Bounded, deterministic browser-side bridge for one Kingdom Adventures player battle.

The web worker (Pyodide) drives a fight as a sequence of short LIVE WINDOWS instead of one
full-simulation request. This module owns only the orchestration; every tick is still produced by
the unchanged authoritative pipeline:

    combat_scenario.load_scenario -> combat_setup.prepare_setup -> combat_sandbox.run_scenario
                                  == combat_replay_export.export_replay

What it adds on top of `combat_replay_export`:

  * a live window (`stop_tick`) per advance, so a single call simulates a bounded number of ticks
    and returns the runner's own `ka-battle-replay-1` dictionary for that window;
  * replay from the runtime's own engine checkpoint seam (`run_scenario(checkpoints=/resume=)`)
    instead of ticking the whole fight again, so advancing and using a consumable are cheap;
  * a consumable command resolved and inserted with `combat_interaction.resolve_command` /
    `insert_command` (the recovered item rules and the deterministic schedule order are reused,
    never re-implemented), applied at a tick the client has already displayed;
  * a fail-closed prefix guard: the events strictly before the next boundary must be byte-identical
    to the ones already returned, otherwise the operation raises instead of silently rewinding.

This module deliberately keeps NO server job/session globals: every checkpoint, retained event
prefix and command lives on the session instance. The runtime's module-level stores
(`combat_interaction._SESSIONS`, `_JOBS`, `_RUN_LOCK`) are neither read nor written here, so many
browser sessions can coexist in one interpreter.

Bounded by construction:

  * at most `checkpoint_limit` engine checkpoints are retained per session, spread evenly across the
    simulated range (thinned, never grown) and the newest checkpoint is always kept, so
    `advance()` is bounded by `window_ticks` and a consumable re-simulates at most one checkpoint
    spacing plus one window;
  * a window is clamped to `max_window_ticks`; checkpoints at or after an inserted command are
    dropped, because their state already contains the old schedule for that tick.

Nothing here invents a combat fact: no event is fabricated, no effect is painted, no timestamp or
path is emitted, and two identical session sequences produce byte-identical replay dictionaries.
"""
import hashlib
import json
from copy import deepcopy

from combat_interaction import (HOLY_HERB, PHASES, WINDOW_TICKS, WINDOW_TICKS_MAX,
                                InteractionError, acceptance_report, dispatch_event,
                                dispatch_rank, insert_command, prefix_evidence, resolve_command)
from combat_replay_export import export_replay
from combat_scenario import ScenarioError, load_scenario

SCHEMA = 'ka-battle-browser-session-1'
COMMAND_SCHEMA = 'ka-battle-browser-command-1'
COMMAND_KIND = 'use-item'
DEFAULT_CHECKPOINT_LIMIT = 40

WINDOW_ORDER_NOTE = ('windowTicks bounds ONE advance; the fight is never simulated to the horizon '
                     'in a single call. finalState.windowed marks a live window that is not a final '
                     'battle.')
PREFIX_NOTE = ('Prefix guard: the events strictly before the operation boundary are compared with '
               'the previously returned replay; a mismatch raises browser-battle-prefix-mismatch '
               'instead of returning a rewound stream.')


class BrowserBattleSessionError(ValueError):
    """A refused browser-battle operation (invalid input or a lost replay prefix)."""

    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = dict(details or {})


def _events_digest(events):
    """The prefix digest `combat_interaction.prefix_evidence` uses, over an explicit event list."""
    return hashlib.sha256(json.dumps(events, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False).encode('utf-8')).hexdigest()


def _is_int(value):
    return type(value) is int


class BrowserBattleSession:
    """One bounded player fight, advanced window by window and steered with consumables.

    Usage (inside the Pyodide worker):

        session = BrowserBattleSession(scenario, window_ticks=120)
        replay = session.start()                       # ka-battle-replay-1 (windowed)
        replay = session.advance()                     # next bounded window
        result = session.use_consumable('holy_herb', tick=90)
        result['replay']                               # the branched replay, same schema

    All returned dictionaries are JSON-serializable and deterministic for identical call sequences.
    """

    def __init__(self, scenario, window_ticks=WINDOW_TICKS, max_window_ticks=WINDOW_TICKS_MAX,
                 checkpoint_limit=DEFAULT_CHECKPOINT_LIMIT):
        if not isinstance(scenario, dict):
            raise BrowserBattleSessionError('browser-battle-invalid-scenario',
                                            'scenario must be a JSON object')
        if not _is_int(max_window_ticks) or max_window_ticks < 1:
            raise BrowserBattleSessionError('browser-battle-invalid-window',
                                            'max_window_ticks must be a positive integer')
        if not _is_int(checkpoint_limit) or checkpoint_limit < 2:
            raise BrowserBattleSessionError('browser-battle-invalid-limit',
                                            'checkpoint_limit must be an integer >= 2')
        self.max_window_ticks = max_window_ticks
        self.window_ticks = self._window(window_ticks)
        self.checkpoint_limit = checkpoint_limit
        # Normalizing keeps the recovered loader's own household-pet expansion and validation; the
        # branch schedule is built on the normalized copy, exactly as combat_interaction does.
        try:
            self.normalized = load_scenario(scenario)
        except ScenarioError as error:
            raise BrowserBattleSessionError('browser-battle-invalid-scenario', str(error)) from error
        self.working = deepcopy(self.normalized)
        self.horizon = self.working['tickLimit'] - 1
        self.stop_tick = -1
        self.commands = []
        self._checkpoints = []
        self._wanted = set()
        self._pending = []
        self._started = False
        self._replay = None
        self._displayed_events = None

    # -- combat_sandbox collector protocol (checkpoints=) -------------------------------------

    def wanted(self, tick):
        return tick in self._wanted

    def store(self, record):
        # Buffered for the run and merged (bounded + thinned) once the replay is built.
        self._pending.append(record)

    # -- public API ---------------------------------------------------------------------------

    def start(self, window_ticks=None):
        """Simulate the first short window from tick 0 and return its replay dictionary."""
        if self._started:
            raise BrowserBattleSessionError('browser-battle-already-started',
                                            'this session already started')
        self._started = True
        if window_ticks is not None:
            self.window_ticks = self._window(window_ticks)
        stop = min(self.horizon, self.window_ticks)
        return self._run_window(start_tick=-1, stop_tick=stop, resume=None, boundary=None)

    def advance(self, window_ticks=None):
        """Simulate the next bounded window from the newest checkpoint and return its replay."""
        self._require_started()
        if self.stop_tick >= self.horizon:
            return self._replay
        if window_ticks is not None:
            self.window_ticks = self._window(window_ticks)
        resume = self._resume_below(self.stop_tick + 1)
        start_tick = -1 if resume is None else resume['tick']
        stop = min(self.horizon, self.stop_tick + self.window_ticks)
        # Everything already displayed (ticks <= stop_tick) must reappear unchanged.
        return self._run_window(start_tick=start_tick, stop_tick=stop, resume=resume,
                                boundary=self.stop_tick + 1)

    def use_consumable(self, item, tick, phase=None, displayed_tick=None, window_ticks=None):
        """Dispatch one consumable at a displayed tick without re-simulating the whole fight.

        The command is validated/inserted with the recovered interaction rules
        (`combat_interaction.resolve_command` + `insert_command`). The branch is replayed from the
        newest checkpoint strictly below `tick` (at most one checkpoint spacing, never tick 0 unless
        nothing earlier was retained) and only a bounded window past `tick` is simulated.

        Returns a compact result dict with `replay` (the branch's `ka-battle-replay-1` window),
        `command`, `acceptance`, `prefix` and `window`. `status` is one of accepted / no-effect /
        blocked / not-dispatched, mirroring the runner's own `battle_item`/`resource_change` record.
        """
        self._require_started()
        if not _is_int(tick) or tick < 0:
            raise BrowserBattleSessionError('browser-battle-invalid-tick',
                                            'tick must be a nonnegative integer')
        if tick > self.stop_tick:
            raise BrowserBattleSessionError(
                'browser-battle-tick-not-displayed',
                f'tick {tick} is beyond the simulated window edge {self.stop_tick}; advance first',
                status=409)
        if window_ticks is not None:
            self.window_ticks = self._window(window_ticks)
        command = dict(kind=COMMAND_KIND, tick=tick, phase=phase if phase is not None else PHASES[0],
                       item=item)
        try:
            entry, description = resolve_command(command, self.working)
        except InteractionError as error:
            raise BrowserBattleSessionError(error.code, str(error), status=error.status) from error
        # A checkpoint at or after the command tick already holds that tick's OLD dispatch, so it can
        # never be reused for the branched schedule.
        resume = self._resume_below(entry['tick'])
        self._drop_at_or_after(entry['tick'])
        index = insert_command(self.working['inputs'], entry)
        start_tick = -1 if resume is None else resume['tick']
        stop = min(self.horizon, entry['tick'] + self.window_ticks)
        # The branch differs from the displayed stream only at/after the command tick, so the prefix
        # below it must be untouched; the extra tick-1 checkpoint makes a repeat click at the same
        # tick cheap.
        try:
            replay = self._run_window(start_tick=start_tick, stop_tick=stop, resume=resume,
                                      boundary=entry['tick'],
                                      extra_ticks=(entry['tick'] - 1 if entry['tick'] > 0 else None,
                                                   entry['tick']))
        except BrowserBattleSessionError:
            # Fail closed without leaving the branch schedule half-inserted.
            self.working['inputs'].pop(index)
            raise
        self.commands.append(dict(description, scheduleIndex=index))
        event = dispatch_event(replay, description['item'], entry['tick'],
                               dispatch_rank(self.working['inputs'], index, description['item']))
        acceptance = None if event is None else acceptance_report(
            replay, event, description['item'], description['resolved']['declaredStock'], entry['tick'])
        prefix = prefix_evidence(replay['events'], entry['tick'], displayed_tick)
        status = ('not-dispatched' if event is None else
                  'blocked' if acceptance['blocked'] else
                  'accepted' if acceptance['used'] else 'no-effect')
        return dict(
            schema=COMMAND_SCHEMA, status=status,
            command=dict(description, scheduleIndex=index),
            acceptance=acceptance, prefix=prefix,
            window=self.window_status(),
            commands=list(self.commands),
            scenario=deepcopy(self.working),
            replay=replay,
            notes=[WINDOW_ORDER_NOTE, PREFIX_NOTE])

    # -- views --------------------------------------------------------------------------------

    @property
    def replay(self):
        return self._replay

    def window_status(self):
        """Compact, engine-free view of where the session is (safe to postMessage)."""
        return dict(
            started=self._started, complete=self.stop_tick >= self.horizon,
            stopTick=self.stop_tick, horizonTick=self.horizon,
            remainingTicks=max(0, self.horizon - self.stop_tick),
            windowTicks=self.window_ticks, maxWindowTicks=self.max_window_ticks,
            checkpoints=len(self._checkpoints), checkpointLimit=self.checkpoint_limit,
            commands=len(self.commands),
            commandTicks=[command['tick'] for command in self.commands],
            note=WINDOW_ORDER_NOTE)

    # -- internals ----------------------------------------------------------------------------

    def _require_started(self):
        if not self._started:
            raise BrowserBattleSessionError('browser-battle-not-started',
                                            'call start() before advancing or dispatching')

    def _window(self, window_ticks):
        if not _is_int(window_ticks) or window_ticks < 1:
            raise BrowserBattleSessionError('browser-battle-invalid-window',
                                            'windowTicks must be a positive integer')
        return min(window_ticks, self.max_window_ticks)

    def _run_wanted(self, start_tick, stop_tick, extra_ticks=()):
        """Precompute the ticks this run captures; the newest edge is always included."""
        self._pending = []
        span = stop_tick - start_tick
        stride = 1 if span <= 0 else max(1, (span + self.checkpoint_limit - 1) // self.checkpoint_limit)
        wanted = set()
        tick = start_tick + stride
        while tick < stop_tick:
            wanted.add(tick)
            tick += stride
        if start_tick < 0 <= stop_tick:
            wanted.add(0)
        wanted.add(stop_tick)
        wanted.update(value for value in extra_ticks if value is not None)
        self._wanted = {tick for tick in wanted if start_tick < tick <= stop_tick and tick >= 0}

    def _run_window(self, start_tick, stop_tick, resume, boundary, extra_ticks=()):
        previous = self._displayed_events
        self._run_wanted(start_tick, stop_tick, extra_ticks)
        replay = export_replay(self.working, include_events=True, resume=resume,
                               stop_tick=stop_tick, checkpoints=self)
        records, self._pending = self._pending, []
        events = replay['events']
        if boundary is not None and previous is not None:
            old_prefix = [event for event in previous if event['tick'] < boundary]
            new_prefix = [event for event in events if event['tick'] < boundary]
            if _events_digest(old_prefix) != _events_digest(new_prefix):
                raise BrowserBattleSessionError(
                    'browser-battle-prefix-mismatch',
                    f'the replay branch rewrote events before tick {boundary}; refusing to return a '
                    'stream that no longer matches what was displayed', status=409,
                    details=dict(boundary=boundary, previousEvents=len(old_prefix),
                                 branchEvents=len(new_prefix)))
        self.stop_tick = min(self.horizon, stop_tick)
        self._merge(records)
        self._replay = replay
        self._displayed_events = events
        return replay

    def _resume_below(self, tick):
        candidates = [record for record in self._checkpoints if record['tick'] < tick]
        return max(candidates, key=lambda record: record['tick']) if candidates else None

    def _drop_at_or_after(self, tick):
        self._checkpoints = [record for record in self._checkpoints if record['tick'] < tick]

    def _merge(self, records):
        """Keep the current playback window dense and thin older seek points."""
        if not records:
            return
        by_tick = {record['tick']: record for record in self._checkpoints}
        for record in records:
            by_tick[record['tick']] = record
        kept = [by_tick[tick] for tick in sorted(by_tick) if by_tick[tick]['tick'] <= self.stop_tick]
        if not kept:
            return
        limit = self.checkpoint_limit
        if len(kept) > limit:
            recent_count = min(len(kept), max(2, limit - 4))
            recent = kept[-recent_count:]
            older = kept[:-recent_count]
            older_slots = limit - recent_count
            if len(older) > older_slots:
                if older_slots == 1:
                    older = [older[-1]]
                else:
                    older = [older[round(index * (len(older) - 1) / (older_slots - 1))]
                             for index in range(older_slots)]
            kept = older + recent
        self._checkpoints = kept
