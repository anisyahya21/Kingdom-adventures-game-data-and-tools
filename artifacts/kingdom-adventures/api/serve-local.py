"""Local development server for `/api/battle-run` and `/api/strategy-search/*`.

`vite.config.ts` forwards both prefixes to `http://127.0.0.1:${BATTLE_RUNNER_PORT || 8787}`. Run
this next to `npm run dev` so the same handlers the deployed Python function serves are reachable
from the browser without any environment-dependent URL in the app:

    npm run api:serve                 # 127.0.0.1:8787, the Vite proxy default
    BATTLE_RUNNER_PORT=9000 npm run api:serve

Routing:

  * `/api/battle-run` - served by the exact packaged runtime under `api/_battle_runtime/` (no
    scenario rewriting and no combat logic in the transport). The handler file is loaded by path
    because its name (`battle-run.py`) is the deployed route name and is not importable as a module.
  * `/api/strategy-search/defaults`, `POST /api/strategy-search/jobs`,
    `GET|DELETE /api/strategy-search/jobs/{id}` - local-only async jobs backed by
    `api/_strategy_search_jobs.py`, which loads the engine module
    `KA-Website/tools/recovery/strategy_search.py` when it is present. While that module is absent
    these routes answer a precise 503 instead of dummy scores.

The host defaults to loopback (`BATTLE_RUNNER_HOST=127.0.0.1`).
"""
import importlib.util
import json
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
HANDLER_MODULE = HERE / "battle-run.py"

SEARCH_PREFIX = "/api/strategy-search"
SEARCH_MAX_BODY_BYTES = 256 * 1024
SEARCH_DEFAULTS_SCHEMA = "ka-strategy-search-defaults-1"


def load_handler_module():
    spec = importlib.util.spec_from_file_location("ka_battle_run_handler", HANDLER_MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _search_jobs():
    """Import the job manager lazily so a broken search helper cannot break battle-run."""
    import _strategy_search_jobs  # noqa: PLC0415  (local transport helper)

    return _strategy_search_jobs


def build_local_handler(battle_module):
    """Subclass the battle-run handler and add only the strategy-search routes."""

    class LocalHandler(battle_module.handler):
        # -- routing helpers -------------------------------------------------

        def _path(self):
            return self.path.split("?", 1)[0].rstrip("/") or "/"

        def _send(self, status, payload):
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.send_header("cache-control", "no-store")
            self.send_header("connection", "close")
            self.end_headers()
            self.wfile.write(body)

        def _job_id(self, path):
            tail = path[len(SEARCH_PREFIX + "/jobs"):].strip("/")
            return tail or None

        def _read_body(self):
            try:
                length = int(self.headers.get("content-length") or 0)
            except ValueError:
                return None, (400, dict(schema="ka-strategy-search-unavailable-1", status=400,
                                        code="invalid-content-length",
                                        message="content-length is not a number"))
            if length < 0:
                return None, (400, dict(schema="ka-strategy-search-unavailable-1", status=400,
                                        code="invalid-content-length",
                                        message="content-length must be positive"))
            if length > SEARCH_MAX_BODY_BYTES:
                self._drain()
                return None, (413, dict(schema="ka-strategy-search-unavailable-1", status=413,
                                        code="body-too-large",
                                        message=f"request body exceeds {SEARCH_MAX_BODY_BYTES} bytes"))
            return (self.rfile.read(length) if length else b""), None

        # -- strategy-search surface ----------------------------------------

        def _strategy_defaults(self):
            jobs = _search_jobs()
            try:
                request = jobs.defaults()
            except jobs.SearchUnavailable as error:
                return self._send(503, error.payload())
            except Exception as error:  # pragma: no cover - defensive
                return self._send(503, dict(schema="ka-strategy-search-unavailable-1", status=503,
                                            code="search-module-failed",
                                            message=f"{type(error).__name__}: {error}"))
            return self._send(200, dict(schema=SEARCH_DEFAULTS_SCHEMA, status="ok", available=True,
                                        request=request, resultSchema=jobs.RESULT_SCHEMA,
                                        bounds=dict(candidateCount=jobs.MAX_CANDIDATES,
                                                    seeds=jobs.MAX_SEEDS,
                                                    tickLimit=jobs.MAX_TICK_LIMIT,
                                                    objectives=list(jobs.OBJECTIVES))))

        def _strategy_create(self):
            jobs = _search_jobs()
            raw_body, error = self._read_body()
            if error is not None:
                return self._send(*error)
            request, error = jobs.parse_body(raw_body)
            if error is not None:
                return self._send(*error)
            request, problems = jobs.validate_request(request)
            if problems:
                return self._send(422, dict(schema="ka-strategy-search-unavailable-1", status=422,
                                            code="invalid-request", message="request rejected",
                                            problems=problems))
            job, error = jobs.MANAGER.create(request)
            if error is not None:
                return self._send(*error)
            return self._send(202, job.snapshot())

        def _strategy_job_get(self, path):
            job_id = self._job_id(path)
            job = _search_jobs().MANAGER.get(job_id)
            if job is None:
                return self._send(404, dict(schema="ka-strategy-search-unavailable-1", status=404,
                                            code="unknown-job",
                                            message=f"no strategy search job {job_id!r}"))
            return self._send(200, job.snapshot())

        def _strategy_job_delete(self, path):
            job_id = self._job_id(path)
            job, error = _search_jobs().MANAGER.cancel(job_id)
            if error is not None:
                return self._send(*error)
            return self._send(202, job.snapshot())

        # -- HTTP verbs ------------------------------------------------------

        def do_GET(self):
            path = self._path()
            if path == SEARCH_PREFIX + "/defaults":
                return self._strategy_defaults()
            if path.startswith(SEARCH_PREFIX + "/jobs/"):
                return self._strategy_job_get(path)
            if path == SEARCH_PREFIX + "/jobs":
                return self._send(405, dict(schema="ka-strategy-search-unavailable-1", status=405,
                                            code="method-not-allowed",
                                            message="POST to create a job, GET /jobs/{id} to poll"))
            return super().do_GET()

        def do_POST(self):
            path = self._path()
            if path == SEARCH_PREFIX + "/jobs":
                return self._strategy_create()
            if path == SEARCH_PREFIX + "/defaults" or path.startswith(SEARCH_PREFIX):
                self._drain()
                return self._send(405, dict(schema="ka-strategy-search-unavailable-1", status=405,
                                            code="method-not-allowed",
                                            message="POST only to /api/strategy-search/jobs"))
            return super().do_POST()

        def do_DELETE(self):
            path = self._path()
            if path.startswith(SEARCH_PREFIX + "/jobs/"):
                return self._strategy_job_delete(path)
            return super().do_DELETE()

    return LocalHandler


def main():
    host = os.environ.get("BATTLE_RUNNER_HOST", "127.0.0.1")
    port = int(os.environ.get("BATTLE_RUNNER_PORT", "8787"))
    module = load_handler_module()
    server = ThreadingHTTPServer((host, port), build_local_handler(module))
    print(json.dumps(dict(status="listening", endpoint="battle-run", url=f"http://{host}:{port}",
                          envelopes=list(module.ENVELOPES),
                          strategySearch=dict(defaults=f"{SEARCH_PREFIX}/defaults",
                                              jobs=f"{SEARCH_PREFIX}/jobs",
                                              engine=str(_search_jobs().SEARCH_MODULE_PATH),
                                              enginePresent=str(_search_jobs().SEARCH_MODULE_PATH.is_file())),
                          note="Vite forwards /api/battle-run and /api/strategy-search here")),
          flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
