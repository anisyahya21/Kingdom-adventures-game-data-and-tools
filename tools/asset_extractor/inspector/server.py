"""
server.py — lightweight localhost HTTP server for the visual inspector.

Serves static files from inspector/ and provides /api/ routes that stream
generated JSON and images from KA_assets.

Usage: python main.py inspector [--port 8765]
"""

from __future__ import annotations
import http.server
import json
import mimetypes
import os
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Optional

import sys
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import config

INSPECTOR_DIR = Path(__file__).resolve().parent

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")


class InspectorHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Suppress default access log; show only on errors
        if args and str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)

    def _send(self, code: int, content_type: str, body: bytes, extra_headers: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "http://localhost")
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, data, code: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._send(code, "application/json", body)

    def _send_error_json(self, code: int, message: str) -> None:
        self._send_json({"error": message}, code=code)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path.startswith("/api/"):
                self._handle_api(path[5:], query)
            else:
                self._serve_static(path)
        except BrokenPipeError:
            pass
        except Exception as e:
            try:
                self._send_error_json(500, str(e))
            except Exception:
                pass

    def _handle_api(self, route: str, query: dict) -> None:
        # /api/registry — full asset registry JSON
        if route == "registry":
            path = config.MAPPINGS_DIR / "asset_registry.json"
            self._serve_json_file(path)

        # /api/manifests/<name> — named manifest JSON
        elif route.startswith("manifests/"):
            name = route[len("manifests/"):]
            # Sanitise: allow only alphanumeric + underscore
            if not all(c.isalnum() or c == "_" for c in name):
                self._send_error_json(400, "invalid manifest name")
                return
            path = config.MAPPINGS_DIR / f"{name}.json"
            self._serve_json_file(path)

        # /api/discovery/<name> — discovery JSON
        elif route.startswith("discovery/"):
            name = route[len("discovery/"):]
            if not all(c.isalnum() or c in ("_", "-") for c in name):
                self._send_error_json(400, "invalid discovery name")
                return
            path = config.DISCOVERY_DIR / f"{name}.json"
            self._serve_json_file(path)

        # /api/image?path=chip/tochi00.png — stream PNG from KA_assets
        elif route == "image":
            rel = query.get("path", [None])[0]
            if not rel:
                self._send_error_json(400, "missing path parameter")
                return
            # Security: prevent path traversal
            try:
                target = (config.KA_ASSETS_DIR / rel).resolve()
                target.relative_to(config.KA_ASSETS_DIR.resolve())
            except (ValueError, Exception):
                self._send_error_json(403, "path traversal not allowed")
                return
            if not target.exists() or not target.is_file():
                self._send_error_json(404, f"not found: {rel}")
                return
            data = target.read_bytes()
            content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            self._send(200, content_type, data)

        # /api/preview-image?path=... — stream PNG from previews dir
        elif route == "preview-image":
            rel = query.get("path", [None])[0]
            if not rel:
                self._send_error_json(400, "missing path parameter")
                return
            try:
                target = (config.PREVIEWS_DIR / rel).resolve()
                target.relative_to(config.PREVIEWS_DIR.resolve())
            except (ValueError, Exception):
                self._send_error_json(403, "path traversal not allowed")
                return
            if not target.exists() or not target.is_file():
                self._send_error_json(404, f"not found: {rel}")
                return
            data = target.read_bytes()
            self._send(200, "image/png", data)

        # /api/categories — list all KA_assets subdirectories
        elif route == "categories":
            cats = sorted(
                d.name for d in config.KA_ASSETS_DIR.iterdir() if d.is_dir()
            )
            self._send_json(cats)

        # /api/list-previews?dir=<subdir> — list PNG filenames in a previews subdirectory
        elif route == "list-previews":
            subdir = query.get("dir", [None])[0]
            if not subdir or not all(c.isalnum() or c in ("_", "-") for c in subdir):
                self._send_error_json(400, "missing or invalid dir parameter")
                return
            target_dir = config.PREVIEWS_DIR / subdir
            if not target_dir.is_dir():
                self._send_json([])
                return
            files = sorted(f.name for f in target_dir.iterdir() if f.is_file() and f.suffix == ".png")
            self._send_json(files)

        # /api/stats — summary stats computed from registry or from validation report
        elif route == "stats":
            report_path = config.DISCOVERY_DIR / "manifest_validation_report.json"
            if report_path.exists():
                self._serve_json_file(report_path)
            else:
                # Compute on-the-fly from registry
                reg_path = config.MAPPINGS_DIR / "asset_registry.json"
                if not reg_path.exists():
                    self._send_error_json(404, "no registry — run python main.py extract")
                    return
                import json as _json
                refs = _json.loads(reg_path.read_text(encoding="utf-8"))
                status_counts: dict[str, int] = {}
                for r in refs:
                    s = r.get("reviewStatus", "auto")
                    status_counts[s] = status_counts.get(s, 0) + 1
                data = {
                    "total":         len(refs),
                    "auto":          status_counts.get("auto", 0),
                    "missingSource": status_counts.get("missing_source", 0),
                    "unresolvedRes": status_counts.get("unresolved_res", 0),
                    "source":        "registry (run validate for full report)",
                }
                self._send_json(data)

        else:
            self._send_error_json(404, f"unknown API route: {route}")

    def _serve_json_file(self, path: Path) -> None:
        if not path.exists():
            self._send_error_json(404, f"not generated yet: {path.name} — run the pipeline first")
            return
        data = path.read_bytes()
        self._send(200, "application/json", data)

    def _serve_static(self, url_path: str) -> None:
        # Default to index.html
        if url_path == "/" or url_path == "":
            url_path = "/index.html"

        # Map URL path to filesystem path inside inspector/
        rel = url_path.lstrip("/").replace("/", os.sep)
        file_path = (INSPECTOR_DIR / rel).resolve()

        # Security: only serve files inside inspector dir
        try:
            file_path.relative_to(INSPECTOR_DIR.resolve())
        except ValueError:
            self._send_error_json(403, "forbidden")
            return

        if not file_path.exists() or not file_path.is_file():
            self._send_error_json(404, f"static file not found: {url_path}")
            return

        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self._send(200, content_type, data)


def serve(port: int = 8765) -> None:
    addr = ("127.0.0.1", port)
    url = f"http://localhost:{port}/"
    print(f"\n[inspector] Serving at {url}")
    print(f"[inspector] Press Ctrl+C to stop\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    with http.server.HTTPServer(addr, InspectorHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[inspector] stopped")
