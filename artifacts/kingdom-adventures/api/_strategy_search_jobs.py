"""Local strategy-search job manager (transport only).

The search engine itself is `KA-Website/tools/recovery/strategy_search.py`, owned by a different
worker. This module never re-implements search, scoring or game defaults: it loads that module by
path, asks it for `default_request()`, validates the documented request bounds independently,
runs `run_search()` on one background thread at a time, and keeps a small bounded history of job
snapshots for the local UI to poll.

Design constraints (local-only, 2026-09-20):
  * max ONE active simulation job (CPU bound);
  * bounded body size and bounded job history;
  * cooperative cancellation only (`cancelled` callable polled by the engine);
  * no processes are spawned here - the engine runs in this thread;
  * while the module is missing the endpoints report a precise temporary unavailability instead of
    inventing dummy scores.
"""
import importlib.util
import inspect
import json
import sys
import threading
import time
import uuid
from collections import OrderedDict
from pathlib import Path

REQUEST_SCHEMA = "ka-strategy-search-1"
RESULT_SCHEMA = "ka-strategy-search-result-1"
UNAVAILABLE_SCHEMA = "ka-strategy-search-unavailable-1"

# Documented contract bounds. `default_request()` from the module supplies the *defaults*; these
# are the request limits this transport enforces independently of the engine.
MAX_BODY_BYTES = 256 * 1024
MAX_CANDIDATES = 64
MAX_SEEDS = 8
MAX_TICK_LIMIT = 20000
MAX_SEARCH_SEED = 2 ** 32 - 1
OBJECTIVES = ("generated-boxes", "battle-outcome")
SEARCH_AXES = ("both", "formation", "skill-order")
# The engine's own documented defaults, needed only to size a request that omits these fields. It
# enforces `(1 + candidateCount) * seeds <= MAX_PLANNED_RUNS`; the transport must reject the same
# request up front with a 422 instead of accepting a job that can only fail at run start.
DEFAULT_CANDIDATE_COUNT = 4
DEFAULT_SEED_COUNT = 1
MAX_PLANNED_RUNS = 64
MAX_JOBS_REMEMBERED = 12

HERE = Path(__file__).resolve().parent
# .../KA-Website/artifacts/kingdom-adventures/api -> .../KA-Website/tools/recovery/strategy_search.py
SEARCH_MODULE_PATH = HERE.parents[2] / "tools" / "recovery" / "strategy_search.py"
SOURCE_DIR = SEARCH_MODULE_PATH.parent
_MODULE_NAME = "ka_strategy_search_engine"


class SearchUnavailable(RuntimeError):
    """The search engine module is absent or does not expose the agreed contract."""

    def __init__(self, code, message, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def payload(self):
        return dict(schema=UNAVAILABLE_SCHEMA, status=503, code=self.code, message=self.message,
                    **self.extra)


def _ensure_source_path():
    """Append (never prepend) the source dir so the packaged runtime keeps import priority."""
    entry = str(SOURCE_DIR)
    if entry not in sys.path:
        sys.path.append(entry)


def load_search_module():
    """Import the engine module by path; a successful import is cached in `sys.modules`."""
    cached = sys.modules.get(_MODULE_NAME)
    if cached is not None:
        return cached
    if not SEARCH_MODULE_PATH.is_file():
        raise SearchUnavailable(
            "search-module-unavailable",
            "strategy_search.py is not present in this checkout yet",
            expectedPath=str(SEARCH_MODULE_PATH),
        )
    _ensure_source_path()
    try:
        spec = importlib.util.spec_from_file_location(_MODULE_NAME, SEARCH_MODULE_PATH)
        if spec is None or spec.loader is None:
            raise SearchUnavailable("search-module-unloadable",
                                     "strategy_search.py could not be loaded by path")
        module = importlib.util.module_from_spec(spec)
        sys.modules[_MODULE_NAME] = module
        spec.loader.exec_module(module)
    except SearchUnavailable:
        raise
    except Exception as error:  # import-time failure of the engine or its dependencies
        sys.modules.pop(_MODULE_NAME, None)
        raise SearchUnavailable("search-module-failed",
                                 f"strategy_search.py failed to import: {type(error).__name__}: {error}")
    missing = [name for name in ("default_request", "run_search") if not callable(getattr(module, name, None))]
    if missing:
        raise SearchUnavailable("search-module-incomplete",
                                 f"strategy_search.py does not expose {', '.join(missing)}()")
    return module


def defaults():
    """The engine's own default request - the only source of game defaults for the UI."""
    module = load_search_module()
    try:
        request = module.default_request()
    except Exception as error:
        raise SearchUnavailable("search-defaults-failed",
                                 f"default_request() raised {type(error).__name__}: {error}")
    if not isinstance(request, dict):
        raise SearchUnavailable("search-defaults-failed", "default_request() did not return an object")
    return request


def _int_problem(value, low, high):
    if isinstance(value, bool) or not isinstance(value, int):
        return f"must be an integer between {low} and {high}"
    if not low <= value <= high:
        return f"must be between {low} and {high}"
    return None


def validate_request(raw):
    """Independent transport validation. Returns `(request, problems)`; both may be non-empty."""
    if not isinstance(raw, dict):
        return {}, ["request must be a JSON object"]
    problems = []
    request = dict(raw)
    if "schema" not in request:
        request["schema"] = REQUEST_SCHEMA
    if request.get("schema") != REQUEST_SCHEMA:
        problems.append(f"schema must be {REQUEST_SCHEMA!r}")

    if "candidateCount" in request:
        problem = _int_problem(request["candidateCount"], 1, MAX_CANDIDATES)
        if problem:
            problems.append(f"candidateCount {problem}")
    if "searchSeed" in request:
        problem = _int_problem(request["searchSeed"], 0, MAX_SEARCH_SEED)
        if problem:
            problems.append(f"searchSeed {problem}")
    if "tickLimit" in request:
        problem = _int_problem(request["tickLimit"], 1, MAX_TICK_LIMIT)
        if problem:
            problems.append(f"tickLimit {problem}")
    if "objective" in request:
        if request["objective"] not in OBJECTIVES:
            problems.append(f"objective must be one of {list(OBJECTIVES)}")
    if "searchAxis" in request:
        if request["searchAxis"] not in SEARCH_AXES:
            problems.append(f"searchAxis must be one of {list(SEARCH_AXES)}")
    if "baseScenario" in request:
        # `null` is the engine's own default ("use the frozen UREF scenario"); only a non-null
        # non-object value is a transport problem.
        if request["baseScenario"] is not None and not isinstance(request["baseScenario"], dict):
            problems.append("baseScenario must be a JSON object or null")
    if "seeds" in request:
        seeds = request["seeds"]
        if not isinstance(seeds, list):
            problems.append("seeds must be an array")
        elif len(seeds) > MAX_SEEDS:
            problems.append(f"seeds must contain at most {MAX_SEEDS} entries")
        else:
            for index, seed in enumerate(seeds):
                if not isinstance(seed, dict):
                    problems.append(f"seeds[{index}] must be an object")
                    continue
                for field in ("mathSeed", "libSeed"):
                    if field not in seed:
                        problems.append(f"seeds[{index}].{field} is required")
                        continue
                    problem = _int_problem(seed[field], 0, MAX_SEARCH_SEED)
                    if problem:
                        problems.append(f"seeds[{index}].{field} {problem}")
    # The engine caps total planned runs; enforce the same product here so an impossible request is
    # rejected with 422 instead of being accepted and then failing at run start.
    if not problems:
        candidates = request.get("candidateCount", DEFAULT_CANDIDATE_COUNT)
        seeds = request.get("seeds")
        if isinstance(seeds, list):
            unique = {(seed["mathSeed"], seed["libSeed"]) for seed in seeds
                      if isinstance(seed, dict) and "mathSeed" in seed and "libSeed" in seed}
            seed_count = len(unique) or DEFAULT_SEED_COUNT
        else:
            seed_count = DEFAULT_SEED_COUNT
        planned = (1 + candidates) * seed_count
        if planned > MAX_PLANNED_RUNS:
            problems.append(
                f"planned runs (1 + candidateCount) * seeds = {planned} exceeds the engine cap of "
                f"{MAX_PLANNED_RUNS}; lower candidateCount or the seed count")
    return request, problems


def parse_body(raw_body):
    """Shared body parse for the strategy endpoints. Returns `(request, (status, payload))`."""
    if len(raw_body) > MAX_BODY_BYTES:
        return None, (413, dict(schema=UNAVAILABLE_SCHEMA, status=413, code="body-too-large",
                                message=f"request body exceeds {MAX_BODY_BYTES} bytes"))
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, (400, dict(schema=UNAVAILABLE_SCHEMA, status=400, code="invalid-json",
                                message=f"request body is not JSON: {error}"))
    if not isinstance(payload, dict):
        return None, (400, dict(schema=UNAVAILABLE_SCHEMA, status=400, code="invalid-request",
                                message="request body must be a JSON object"))
    request = payload.get("request", payload) if "request" in payload else payload
    return request, None


class SearchJob:
    def __init__(self, job_id, request):
        self.id = job_id
        self.request = request
        self.status = "queued"
        self.progress = None
        self.result = None
        self.error = None
        self.created_at = time.time()
        self.started_at = None
        self.finished_at = None
        self.cancel_event = threading.Event()
        self._lock = threading.Lock()
        self.thread = None

    def snapshot(self):
        with self._lock:
            return dict(
                jobId=self.id,
                status=self.status,
                request=self.request,
                progress=self.progress,
                result=self.result,
                error=self.error,
                createdAt=self.created_at,
                startedAt=self.started_at,
                finishedAt=self.finished_at,
                cancellable=self.status in ("queued", "running"),
            )


class SearchJobManager:
    """One active simulation job, bounded history, cooperative cancel."""

    def __init__(self):
        self._lock = threading.Lock()
        self._jobs = OrderedDict()
        self._active_id = None

    def create(self, request):
        """Returns `(job, error)`; `error` is a ready-to-send `(status, payload)` tuple."""
        with self._lock:
            active = self._jobs.get(self._active_id) if self._active_id else None
            if active is not None and active.status in ("queued", "running"):
                return None, (409, dict(schema=UNAVAILABLE_SCHEMA, status=409, code="search-busy",
                                        message="one strategy search is already running; "
                                                "cancel it or wait for it to finish",
                                        activeJobId=active.id))
            job = SearchJob(uuid.uuid4().hex, request)
            self._jobs[job.id] = job
            self._active_id = job.id
            self._trim()
        job.thread = threading.Thread(target=self._run, args=(job,), name=f"ka-search-{job.id[:8]}",
                                      daemon=True)
        job.thread.start()
        return job, None

    def get(self, job_id):
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id):
        job = self.get(job_id)
        if job is None:
            return None, (404, dict(schema=UNAVAILABLE_SCHEMA, status=404, code="unknown-job",
                                    message=f"no strategy search job {job_id!r}"))
        job.cancel_event.set()
        with job._lock:
            if job.status == "queued":
                job.status = "cancelling"
        return job, None

    def _trim(self):
        """Keep the newest `MAX_JOBS_REMEMBERED` entries; never drop the active job."""
        while len(self._jobs) > MAX_JOBS_REMEMBERED:
            for job_id in list(self._jobs):
                if job_id == self._active_id:
                    continue
                self._jobs.pop(job_id, None)
                break
            else:
                return

    def _run(self, job):
        with job._lock:
            job.started_at = time.time()
            if job.cancel_event.is_set():
                job.status = "cancelled"
                job.finished_at = time.time()
                return
            job.status = "running"

        def on_progress(update):
            with job._lock:
                job.progress = update

        def cancelled():
            return job.cancel_event.is_set()

        try:
            module = load_search_module()
            result = _call_run_search(module, job.request, on_progress, cancelled)
        except SearchUnavailable as error:
            with job._lock:
                job.status = "failed"
                job.error = dict(code=error.code, message=error.message)
                job.finished_at = time.time()
            return
        except Exception as error:  # engine failure (or cancellation raised by the engine)
            with job._lock:
                job.finished_at = time.time()
                if job.cancel_event.is_set():
                    job.status = "cancelled"
                else:
                    job.status = "failed"
                    job.error = dict(code="search-failed",
                                     message=f"run_search raised {type(error).__name__}: {error}")
            return

        with job._lock:
            job.finished_at = time.time()
            if not isinstance(result, dict):
                job.status = "failed"
                job.error = dict(code="search-contract",
                                 message="run_search did not return a result object")
                return
            job.result = result
            if job.cancel_event.is_set() or result.get("status") == "cancelled":
                job.status = "cancelled"
            else:
                job.status = "completed"


def _call_run_search(module, request, on_progress, cancelled):
    """Only pass the callbacks the engine actually declares."""
    function = module.run_search
    try:
        parameters = inspect.signature(function).parameters
    except (TypeError, ValueError):
        parameters = {}
    kwargs = {}
    if "on_progress" in parameters:
        kwargs["on_progress"] = on_progress
    if "cancelled" in parameters:
        kwargs["cancelled"] = cancelled
    return function(request, **kwargs)


MANAGER = SearchJobManager()
