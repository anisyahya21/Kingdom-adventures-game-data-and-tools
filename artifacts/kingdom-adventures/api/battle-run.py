"""POST /api/battle-run - the portable authoritative combat runner (PASS 16 COMMAND 16.8/16.9).

Transport only: the runner is the verified package under `api/_battle_runtime/` (39 modules plus
`combat_runtime_data/`), imported directly - no subprocess, no JavaScript combat logic, no scenario
rewriting here. One endpoint, three discriminated request envelopes, all preserved under the same
transport limits:

  * `ka-special-combat-research-1` -> one `ka-battle-replay-1` replay (the original 16.8 contract);
  * `ka-battle-eval-1`             -> multi-seed evaluation of supplied candidate teams
                                      (`combat_evaluation.evaluate`);
  * `ka-battle-search-1`           -> bounded enumeration search over supplied candidates and
                                      variants (`combat_search.search`);
  * `ka-battle-preview-1`          -> formation preview of one supplied scenario, prepared with
                                      `combat_scenario.load_scenario` + `combat_setup.prepare_setup`
                                      only (`api/_battle_preview.py`). It never runs a battle.
  * `ka-battle-interaction-1`      -> one interactive consumable command replayed as a branch: the
                                      supplied scenario with that one command inserted into its own
                                      input schedule, re-run through `combat_replay_export.export_replay`
                                      (`combat_interaction.run_interaction`). The candidate payload is the
                                      runner's own replay plus the acceptance/stock/prefix report.
  * `ka-battle-interaction-1` + `windowTicks` -> the same command answered as a LIVE WINDOW (the true
                                      branch through command.tick plus a short playback window), with the
                                      rest of the branch computed by one bounded branch job.
  * `ka-battle-interaction-poll-1` -> one poll of that branch job (`combat_interaction.poll_branch`):
                                      the events at or after `fromTick`, the branch's current finalState
                                      and whether the branch is complete. No simulation runs here.

Both new envelopes return compact per-candidate summaries and a ranking, plus the replay of the
selected winner only - never one trace per run. The selection/ranking/budget rules live in the
packaged modules, not here.

GET answers a health payload and never runs a battle. Every other method is 405.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNTIME_DIR = HERE / "_battle_runtime"
for _directory in (str(RUNTIME_DIR), str(HERE)):
    if _directory not in sys.path:
        sys.path.insert(0, _directory)

# Transport hardening only; the scenario/eval/search contracts keep their own validation.
MAX_BODY_BYTES = 256 * 1024
MAX_TICK_LIMIT = 10000
MAX_OWN_UNITS = 64
SCENARIO_SCHEMA = "ka-special-combat-research-1"
EVAL_SCHEMA = "ka-battle-eval-1"
SEARCH_SCHEMA = "ka-battle-search-1"
PREVIEW_SCHEMA = "ka-battle-preview-1"
INTERACTION_SCHEMA = "ka-battle-interaction-1"
INTERACTION_POLL_SCHEMA = "ka-battle-interaction-poll-1"
# The health payload's envelope list stays the original 16.8/16.9 contract; the preview envelope is
# advertised separately (`previewSchema`), and the interactive-command envelope as `interactionSchema`;
# both are accepted as additive discriminated schemas.
ENVELOPES = (SCENARIO_SCHEMA, EVAL_SCHEMA, SEARCH_SCHEMA)
ACCEPTED_SCHEMAS = ENVELOPES + (PREVIEW_SCHEMA, INTERACTION_SCHEMA, INTERACTION_POLL_SCHEMA)

_RUNTIME = None
_RUNTIME_ERROR = None


def _runtime():
    """Import the packaged runner once; remember a failure so it can be reported as 500."""
    global _RUNTIME, _RUNTIME_ERROR
    if _RUNTIME is None and _RUNTIME_ERROR is None:
        try:
            import combat_evaluation  # noqa: PLC0415  (packaged module)
            import combat_search  # noqa: PLC0415
            from combat_replay_export import export_replay  # noqa: PLC0415
            from combat_scenario import ScenarioError  # noqa: PLC0415
            try:
                # Transport helper; a packaging failure must only disable the preview envelope, not
                # the three existing ones. It never imports the combat runtime itself.
                import _battle_preview  # noqa: PLC0415
                preview, preview_schema = _battle_preview.build_preview, _battle_preview.PREVIEW_SCHEMA
            except Exception as error:  # pragma: no cover - only if the helper does not ship
                _log("error", event="preview-helper-unavailable", error_type=type(error).__name__,
                     error=_scrub(error))
                preview, preview_schema = None, PREVIEW_SCHEMA
            try:
                # The interactive-command helper lives in the packaged runtime (it drives
                # export_replay). A missing module must only disable that envelope.
                import combat_interaction  # noqa: PLC0415
                interaction, interaction_error = (combat_interaction.run_interaction,
                                                  combat_interaction.InteractionError)
                interaction_schema = combat_interaction.INTERACTION_SCHEMA
                # The branch-job poll: the same helper, a separate discriminated schema.
                interaction_poll = getattr(combat_interaction, 'poll_branch', None)
                interaction_poll_schema = getattr(combat_interaction, 'POLL_SCHEMA', INTERACTION_POLL_SCHEMA)
                # Best-effort session priming: the displayed-fight envelope captures the bounded
                # engine checkpoints a later consumable click resumes from. It runs the SAME
                # `export_replay` pipeline, so the response is unchanged; if the helper is absent or
                # another simulation holds the lock, the plain path below is used.
                prime_session = combat_interaction.prime_session
            except Exception as error:  # pragma: no cover - only if the helper does not ship
                _log("error", event="interaction-helper-unavailable", error_type=type(error).__name__,
                     error=_scrub(error))
                interaction, interaction_error, interaction_schema = None, None, INTERACTION_SCHEMA
                interaction_poll, interaction_poll_schema = None, INTERACTION_POLL_SCHEMA
                prime_session = None
            _RUNTIME = dict(
                preview=preview, preview_schema=preview_schema,
                interaction=interaction, interaction_error=interaction_error,
                interaction_schema=interaction_schema, prime_session=prime_session,
                interaction_poll=interaction_poll, interaction_poll_schema=interaction_poll_schema,
                export_replay=export_replay, scenario_error=ScenarioError,
                evaluate=combat_evaluation.evaluate, evaluation_error=combat_evaluation.EvaluationError,
                search=combat_search.search, eval_schema=combat_evaluation.EVAL_SCHEMA,
                search_schema=combat_search.SEARCH_SCHEMA)
        except Exception as error:  # pragma: no cover - only on a broken package
            _RUNTIME_ERROR = error
    return _RUNTIME


def _scrub(message):
    """Keep server logs useful without leaking absolute workspace paths."""
    return re.sub(r"[A-Za-z]:\\[^\s'\"]+|/[^\s'\"]*/[^\s'\"]*", "<path>", str(message))


def _log(level, **fields):
    print(json.dumps(dict(level=level, **fields)), file=sys.stderr, flush=True)


def _error(status, code, message):
    return status, dict(schema="ka-battle-run-error-1", status=status, code=code, message=message)


def _parse_body(raw_body):
    """Transport validation shared by all three envelopes: size, JSON, object."""
    if len(raw_body) > MAX_BODY_BYTES:
        return None, _error(413, "body-too-large", f"request body exceeds {MAX_BODY_BYTES} bytes")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, _error(400, "invalid-json", f"request body is not valid JSON: {error}")
    if not isinstance(payload, dict):
        return None, _error(400, "invalid-request", "the request must be a JSON object")
    return payload, None


def _unavailable(runtime):
    if runtime is None:
        _log("error", event="runner-import-failed", error_type=type(_RUNTIME_ERROR).__name__,
             error=_scrub(_RUNTIME_ERROR))
        return _error(500, "runner-unavailable", "the packaged combat runner could not be loaded")
    return None


def handle_scenario(payload, runtime):
    """The original 16.8 scenario contract, unchanged."""
    if payload.get("schema") != SCENARIO_SCHEMA:
        return _error(400, "invalid-scenario", f"schema must be {SCENARIO_SCHEMA}")
    tick_limit = payload.get("tickLimit")
    if isinstance(tick_limit, int) and tick_limit > MAX_TICK_LIMIT:
        return _error(422, "tick-limit-too-large", f"tickLimit must be <= {MAX_TICK_LIMIT}")
    own_units = payload.get("ownUnits")
    if isinstance(own_units, list) and len(own_units) > MAX_OWN_UNITS:
        return _error(422, "too-many-units", f"ownUnits must contain at most {MAX_OWN_UNITS} units")
    try:
        prime = runtime["prime_session"]
        replay = prime(payload) if prime is not None else None
        if replay is None:
            replay = runtime["export_replay"](payload, include_events=True)
    except runtime["scenario_error"] as error:
        return _error(422, "scenario-rejected", _scrub(error))
    except (KeyError, TypeError, ValueError) as error:
        _log("warn", event="scenario-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "scenario-rejected", _scrub(error))
    except Exception as error:  # unexpected runner failure
        _log("error", event="runner-failed", error_type=type(error).__name__, error=_scrub(error))
        return _error(500, "runner-failed", "the combat runner failed while executing the scenario")
    return 200, replay


def _handle_envelope(payload, runtime, schema):
    """The `ka-battle-eval-1` / `ka-battle-search-1` envelopes: compact ranking + winner replay."""
    is_search = schema == SEARCH_SCHEMA
    run = runtime["search"] if is_search else runtime["evaluate"]
    rejected = "search-rejected" if is_search else "evaluation-rejected"
    try:
        return 200, run(payload)
    except runtime["evaluation_error"] as error:
        return _error(422, rejected, _scrub(error))
    except (KeyError, TypeError, ValueError) as error:
        _log("warn", event=rejected, error_type=type(error).__name__, error=_scrub(error))
        return _error(422, rejected, _scrub(error))
    except Exception as error:
        _log("error", event="runner-failed", error_type=type(error).__name__, error=_scrub(error))
        return _error(500, "runner-failed", "the combat runner failed while executing the request")


def handle_preview(payload, runtime):
    """`ka-battle-preview-1`: formation preview of one nested research scenario. Never fights."""
    if runtime["preview"] is None:
        return _error(500, "runner-unavailable", "the formation preview helper could not be loaded")
    scenario = payload.get("scenario")
    if not isinstance(scenario, dict):
        return _error(400, "invalid-request",
                      f"{PREVIEW_SCHEMA} requires a nested {SCENARIO_SCHEMA} 'scenario' object")
    # Same transport limits as the scenario envelope; the nested scenario owns its own validation.
    tick_limit = scenario.get("tickLimit")
    if isinstance(tick_limit, int) and tick_limit > MAX_TICK_LIMIT:
        return _error(422, "tick-limit-too-large", f"tickLimit must be <= {MAX_TICK_LIMIT}")
    own_units = scenario.get("ownUnits")
    if isinstance(own_units, list) and len(own_units) > MAX_OWN_UNITS:
        return _error(422, "too-many-units", f"ownUnits must contain at most {MAX_OWN_UNITS} units")
    try:
        return 200, runtime["preview"](scenario)
    except runtime["scenario_error"] as error:
        _log("warn", event="preview-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "preview-rejected", _scrub(error))
    except (KeyError, TypeError, ValueError) as error:
        _log("warn", event="preview-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "preview-rejected", _scrub(error))
    except Exception as error:
        _log("error", event="runner-failed", error_type=type(error).__name__, error=_scrub(error))
        return _error(500, "runner-failed", "the battle runtime failed while preparing the preview")


def handle_interaction(payload, runtime):
    """`ka-battle-interaction-1`: one consumable command replayed as a deterministic branch.

    Transport duties only: the same size/tick/unit limits as the other scenario envelopes, the
    refusal codes the interaction helper reports (422/409/429) and the honest 500 when the helper or
    the runner is unavailable. The runner's own refusals carry their acceptance report through.
    """
    if runtime["interaction"] is None:
        return _error(500, "runner-unavailable", "the interaction helper could not be loaded")
    scenario = payload.get("scenario")
    if not isinstance(scenario, dict):
        return _error(400, "invalid-request",
                      f"{INTERACTION_SCHEMA} requires a nested {SCENARIO_SCHEMA} 'scenario' object")
    tick_limit = scenario.get("tickLimit")
    if isinstance(tick_limit, int) and tick_limit > MAX_TICK_LIMIT:
        return _error(422, "tick-limit-too-large", f"tickLimit must be <= {MAX_TICK_LIMIT}")
    own_units = scenario.get("ownUnits")
    if isinstance(own_units, list) and len(own_units) > MAX_OWN_UNITS:
        return _error(422, "too-many-units", f"ownUnits must contain at most {MAX_OWN_UNITS} units")
    try:
        return 200, runtime["interaction"](payload)
    except runtime["interaction_error"] as error:
        _log("warn", event="interaction-rejected", code=error.code, error_type=type(error).__name__,
             error=_scrub(error))
        status, body = _error(error.status, error.code, _scrub(error))
        if error.acceptance is not None:
            body["acceptance"] = error.acceptance
        return status, body
    except runtime["scenario_error"] as error:
        _log("warn", event="scenario-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "scenario-rejected", _scrub(error))
    except (KeyError, TypeError, ValueError) as error:
        _log("warn", event="interaction-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "interaction-rejected", _scrub(error))
    except Exception as error:
        _log("error", event="runner-failed", error_type=type(error).__name__, error=_scrub(error))
        return _error(500, "runner-failed", "the battle runtime failed while running the interaction")


def handle_request(raw_body):
    """Validate transport limits, then dispatch on the request envelope's own schema."""
    payload, error = _parse_body(raw_body)
    if error is not None:
        return error
    runtime = _runtime()
    unavailable = _unavailable(runtime)
    if unavailable is not None:
        return unavailable
    schema = payload.get("schema")
    if schema == SCENARIO_SCHEMA:
        return handle_scenario(payload, runtime)
    if schema == runtime["eval_schema"]:
        return _handle_envelope(payload, runtime, runtime["eval_schema"])
    if schema == runtime["search_schema"]:
        return _handle_envelope(payload, runtime, runtime["search_schema"])
    if schema == runtime["preview_schema"]:
        return handle_preview(payload, runtime)
    if schema == runtime["interaction_schema"]:
        return handle_interaction(payload, runtime)
    if schema == runtime["interaction_poll_schema"]:
        return handle_interaction_poll(payload, runtime)
    return _error(400, "invalid-request", f"schema must be one of {list(ACCEPTED_SCHEMAS)}")


def handle_interaction_poll(payload, runtime):
    """`ka-battle-interaction-poll-1`: read one branch job's newest replay. Never runs a simulation."""
    if runtime["interaction_poll"] is None:
        return _error(500, "runner-unavailable", "the interaction helper could not be loaded")
    try:
        return 200, runtime["interaction_poll"](payload)
    except runtime["interaction_error"] as error:
        _log("warn", event="interaction-poll-rejected", code=error.code, error_type=type(error).__name__,
             error=_scrub(error))
        return _error(error.status, error.code, _scrub(error))
    except (KeyError, TypeError, ValueError) as error:
        _log("warn", event="interaction-poll-rejected", error_type=type(error).__name__, error=_scrub(error))
        return _error(422, "interaction-poll-rejected", _scrub(error))
    except Exception as error:
        _log("error", event="runner-failed", error_type=type(error).__name__, error=_scrub(error))
        return _error(500, "runner-failed", "the battle runtime failed while polling the branch job")


class handler(BaseHTTPRequestHandler):
    server_version = "ka-battle-run"

    def _drain(self):
        """Consume any request body so a rejection cannot reset the connection mid-response."""
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        remaining = min(max(length, 0), MAX_BODY_BYTES + 1)
        while remaining > 0:
            chunk = self.rfile.read(min(65536, remaining))
            if not chunk:
                break
            remaining -= len(chunk)

    def _respond(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.send_header("connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # health only - never runs a battle
        import combat_runtime_data

        runtime = _runtime()
        self._respond(200, dict(status="ok", endpoint="battle-run",
                                scenarioSchema=SCENARIO_SCHEMA,
                                evalSchema=EVAL_SCHEMA, searchSchema=SEARCH_SCHEMA,
                                previewSchema=PREVIEW_SCHEMA,
                                interactionSchema=runtime["interaction_schema"],
                                interactionPollSchema=runtime["interaction_poll_schema"],
                                envelopes=list(ENVELOPES),
                                runtimeSchema=combat_runtime_data.RUNNER_SCHEMA,
                                runtimeMode=combat_runtime_data.mode(),
                                runnerAvailable=runtime is not None))

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            return self._respond(*_error(400, "invalid-content-length", "content-length is not a number"))
        if length < 0:
            return self._respond(*_error(400, "invalid-content-length", "content-length must be positive"))
        if length > MAX_BODY_BYTES:
            self._drain()
            return self._respond(*_error(413, "body-too-large",
                                         f"request body exceeds {MAX_BODY_BYTES} bytes"))
        body = self.rfile.read(length) if length else b""
        status, payload = handle_request(body)
        self._respond(status, payload)

    def do_OPTIONS(self):
        self._drain()
        self._respond(*_error(405, "method-not-allowed", "POST only (GET for health)"))

    def do_PUT(self):
        self.do_OPTIONS()

    def do_PATCH(self):
        self.do_OPTIONS()

    def do_DELETE(self):
        self.do_OPTIONS()

    def log_message(self, fmt, *args):  # keep Vercel's log clean and path-free
        _log("info", event="request", message=_scrub(fmt % args))
