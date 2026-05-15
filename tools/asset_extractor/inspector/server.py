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
import socketserver
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
        self.send_header("Access-Control-Allow-Origin", "*")
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
        # Pre-import everything that is referenced anywhere in this function so
        # Python does not create hidden "local variable" scoping conflicts.
        from parsers.inf_parser import parse_img_inf  # noqa: F401
        from PIL import Image                          # noqa: F401
        import io as _io                               # noqa: F401
        import csv as _csv_mod                         # noqa: F401
        import struct as _struct                       # noqa: F401
        KA = config.KA_ASSETS_DIR

        # ------------------------------------------------------------------
        # Sequential OPT decoder for icon sheets (v11 spec).
        # Variable-length format: flag byte per slot in row-major order.
        # 0x00 = empty (1 byte), 0x01 = filled (15 bytes total).
        # ------------------------------------------------------------------
        def _decode_opt_sequential(opt_path, cell_width, cell_height, src_img_size=None):
            """Parse .opt with sequential variable-length slot records.
            Returns dict keyed by (v, u) → {dest_x, dest_y, src_x, src_y, w, h, status}.
            Status: 'filled', 'empty', 'implicit_empty', 'short_recovered'.

            Two-pass decode (v5 fix): pass 1 collects all src_x boundaries from complete
            records so that truncated records use the next src_x as right bound instead of
            img_w, preventing double-face crops on packed shield sheets."""
            data = Path(opt_path).read_bytes()
            if len(data) < 4:
                return {}

            _cw, _ch, cols, rows = data[0], data[1], data[2], data[3]

            # ------------------------------------------------------------------
            # Pass 1: collect src_x values from all decodable filled records
            # ------------------------------------------------------------------
            all_src_x = set()
            pos = 4
            _done = False
            for _v in range(rows):
                if _done:
                    break
                for _u in range(cols):
                    if pos >= len(data):
                        _done = True
                        break
                    flag = data[pos]
                    if flag == 0x00:
                        pos += 1
                    elif flag == 0x01:
                        if pos + 15 <= len(data):
                            _sx = _struct.unpack_from("<H", data, pos + 8)[0]
                            all_src_x.add(_sx)
                            pos += 15
                        elif pos + 12 <= len(data):
                            _sx = _struct.unpack_from("<H", data, pos + 8)[0]
                            all_src_x.add(_sx)
                            _done = True
                            break
                        else:
                            _done = True
                            break
                    else:
                        pos += 1
            _sorted_src_x = sorted(all_src_x)

            def _right_bound(src_x, img_w):
                """Next src_x boundary > src_x, or img_w if none."""
                for _x in _sorted_src_x:
                    if _x > src_x:
                        return _x
                return img_w

            # ------------------------------------------------------------------
            # Pass 2: full decode using boundary-bounded width recovery
            # ------------------------------------------------------------------
            slots = {}
            pos = 4

            for v in range(rows):
                for u in range(cols):
                    if pos >= len(data):
                        slots[(v, u)] = {"status": "implicit_empty"}
                        continue

                    flag = data[pos]

                    if flag == 0x00:
                        slots[(v, u)] = {"status": "empty"}
                        pos += 1
                    elif flag == 0x01:
                        if pos + 15 <= len(data):
                            # Complete filled record
                            dest_x, dest_y, src_x, src_y, width = _struct.unpack_from("<HHHHH", data, pos + 4)
                            height = data[pos + 14]
                            slots[(v, u)] = {
                                "dest_x": dest_x,
                                "dest_y": dest_y,
                                "src_x": src_x,
                                "src_y": src_y,
                                "w": width,
                                "h": height,
                                "cell_w": cell_width,
                                "cell_h": cell_height,
                                "status": "filled"
                            }
                            pos += 15
                        elif pos + 12 <= len(data):
                            # Short filled record: has all 4 coordinates but no w/h
                            dest_x, dest_y, src_x, src_y = _struct.unpack_from("<HHHH", data, pos + 4)
                            img_w = src_img_size[0] if src_img_size else cell_width
                            img_h = src_img_size[1] if src_img_size else cell_height
                            rb = _right_bound(src_x, img_w)
                            w = min(rb - src_x, img_w - src_x)
                            h = min(cell_height - dest_y, img_h - src_y)
                            slots[(v, u)] = {
                                "dest_x": dest_x,
                                "dest_y": dest_y,
                                "src_x": src_x,
                                "src_y": src_y,
                                "w": max(0, w),
                                "h": max(0, h),
                                "cell_w": cell_width,
                                "cell_h": cell_height,
                                "status": "short_recovered",
                                "recovered": True,
                                "right_bound": rb,
                            }
                            pos = len(data)
                        elif pos + 11 <= len(data):
                            # Very short record: only 3 coordinates readable
                            dest_x, dest_y, src_x = _struct.unpack_from("<HHH", data, pos + 4)
                            src_y = data[pos + 10] if pos + 10 < len(data) else 0
                            img_w = src_img_size[0] if src_img_size else cell_width
                            img_h = src_img_size[1] if src_img_size else cell_height
                            rb = _right_bound(src_x, img_w)
                            w = min(rb - src_x, img_w - src_x)
                            h = min(cell_height - dest_y, img_h - src_y)
                            slots[(v, u)] = {
                                "dest_x": dest_x,
                                "dest_y": dest_y,
                                "src_x": src_x,
                                "src_y": src_y,
                                "w": max(0, w),
                                "h": max(0, h),
                                "cell_w": cell_width,
                                "cell_h": cell_height,
                                "status": "short_recovered",
                                "recovered": True,
                                "right_bound": rb,
                            }
                            pos = len(data)
                        else:
                            slots[(v, u)] = {"status": "corrupt"}
                            pos = len(data)
                    else:
                        slots[(v, u)] = {"status": "unknown_flag"}
                        pos += 1

            return slots

        def _decode_opt(opt_path, src_img_size=None):
            """Wrapper for _decode_opt_sequential that reads cell dimensions from .opt header.
            Provides backward-compatible signature for legacy calls.
            Returns dict keyed by (v, u) → {dest_x, dest_y, src_x, src_y, w, h, status}."""
            data = Path(opt_path).read_bytes()
            if len(data) < 4:
                return {}
            cell_width, cell_height = data[0], data[1]
            return _decode_opt_sequential(opt_path, cell_width, cell_height, src_img_size)

        def _extract_packed_icon(sheet_path, opt_path, icon_u, icon_v):
            """Extract a single 16x16 icon using .opt packed sprite data if available.
            Returns PIL Image (RGBA, 16x16) or None on error.
            Falls back to fixed-grid crop if .opt doesn't exist."""
            from PIL import Image
            
            sheet_file = Path(sheet_path)
            opt_file = Path(opt_path)
            
            if not sheet_file.exists():
                return None
            
            source_img = Image.open(sheet_file).convert("RGBA")
            
            # Check if .opt file exists for packed sprite decoding
            if opt_file.exists():
                try:
                    # Read cell dimensions from .opt header
                    opt_data = opt_file.read_bytes()
                    if len(opt_data) < 4:
                        # Invalid .opt, fall through to fixed grid
                        pass
                    else:
                        cell_width, cell_height = opt_data[0], opt_data[1]
                        slots = _decode_opt_sequential(opt_file, cell_width, cell_height, source_img.size)
                        slot_key = (icon_v, icon_u)  # .opt uses (v, u) as key
                        
                        if slot_key not in slots:
                            # Icon coord not in .opt: return blank canvas
                            return Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                        
                        slot = slots[slot_key]
                        status = slot.get("status")
                        
                        if status in ("empty", "implicit_empty", "unknown_flag", "corrupt"):
                            # Empty or invalid slot: return blank canvas
                            return Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                        
                        # Filled or short_recovered slot
                        src_x = slot["src_x"]
                        src_y = slot["src_y"]
                        w = slot["w"]
                        h = slot["h"]
                        dest_x = slot["dest_x"]
                        dest_y = slot["dest_y"]
                        
                        # Create blank canvas
                        canvas = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                        
                        # Crop source region and paste onto canvas at dest offset
                        if w > 0 and h > 0:
                            cropped = source_img.crop((src_x, src_y, src_x + w, src_y + h))
                            canvas.paste(cropped, (dest_x, dest_y), cropped)
                        
                        return canvas
                except Exception as e:
                    print(f"[icon-extract] .opt decode failed for ({icon_u},{icon_v}): {e}", flush=True)
                    # Fall through to fixed-grid fallback
            
            # Fallback: fixed-grid crop (for icon_body, icon_accessory, or .opt decode failure)
            x, y = icon_u * 16, icon_v * 16
            icon = source_img.crop((x, y, x + 16, y + 16))
            return icon

        def _extract_packed_icon_with_status(sheet_path, opt_path, icon_u, icon_v):
            """Extract icon and return (image, status_dict) tuple.
            Status dict: {"method": str, "status": str, "opt_exists": bool}
            where method = "opt" | "grid", status = "filled" | "empty" | "implicit_empty" | "short_recovered" | "fallback"
            Returns (None, {...}) on error."""
            from PIL import Image
            
            sheet_file = Path(sheet_path)
            opt_file = Path(opt_path)
            
            if not sheet_file.exists():
                return None, {"method": "error", "status": "sheet_missing", "opt_exists": opt_file.exists()}
            
            source_img = Image.open(sheet_file).convert("RGBA")
            
            # Check if .opt file exists for packed sprite decoding
            if opt_file.exists():
                try:
                    # Read cell dimensions from .opt header
                    opt_data = opt_file.read_bytes()
                    if len(opt_data) < 4:
                        # Invalid .opt, fall through to fixed grid
                        pass
                    else:
                        cell_width, cell_height = opt_data[0], opt_data[1]
                        slots = _decode_opt_sequential(opt_file, cell_width, cell_height, source_img.size)
                        slot_key = (icon_v, icon_u)  # .opt uses (v, u) as key
                        
                        if slot_key not in slots:
                            # Icon coord not in .opt: return blank canvas
                            canvas = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                            return canvas, {"method": "opt", "status": "not_in_grid", "opt_exists": True}
                        
                        slot = slots[slot_key]
                        status = slot.get("status")
                        
                        if status in ("empty", "implicit_empty", "unknown_flag", "corrupt"):
                            # Empty or invalid slot: return blank canvas
                            canvas = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                            return canvas, {"method": "opt", "status": status, "opt_exists": True}
                        
                        # Filled or short_recovered slot
                        src_x = slot["src_x"]
                        src_y = slot["src_y"]
                        w = slot["w"]
                        h = slot["h"]
                        dest_x = slot["dest_x"]
                        dest_y = slot["dest_y"]
                        
                        # Create blank canvas
                        canvas = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
                        
                        # Crop source region and paste onto canvas at dest offset
                        if w > 0 and h > 0:
                            cropped = source_img.crop((src_x, src_y, src_x + w, src_y + h))
                            canvas.paste(cropped, (dest_x, dest_y), cropped)
                        
                        return canvas, {"method": "opt", "status": status, "opt_exists": True}
                except Exception as e:
                    print(f"[icon-extract] .opt decode failed for ({icon_u},{icon_v}): {e}", flush=True)
                    # Fall through to fixed-grid fallback
            
            # Fallback: fixed-grid crop (for icon_body, icon_accessory, or .opt decode failure)
            x, y = icon_u * 16, icon_v * 16
            icon = source_img.crop((x, y, x + 16, y + 16))
            return icon, {"method": "grid", "status": "fallback", "opt_exists": opt_file.exists()}

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

        # /api/sprite?path=<category>/<assetId>.png — serve pre-rendered sprite from generated/sprites
        elif route == "sprite":
            rel = query.get("path", [None])[0]
            if not rel:
                self._send_error_json(400, "missing path parameter")
                return
            try:
                target = (config.SPRITES_DIR / rel).resolve()
                target.relative_to(config.SPRITES_DIR.resolve())
            except (ValueError, Exception):
                self._send_error_json(403, "path traversal not allowed")
                return
            if not target.exists() or not target.is_file():
                self._send_error_json(404, f"sprite not found: {rel}")
                return
            data = target.read_bytes()
            self._send(200, "image/png", data)

        # /api/jobs — flat list of all jobs for the char assembler dropdown
        elif route == "jobs":
            try:
                from parsers.csv_parser import load_jobs
                jobs = load_jobs(config.CSV_JOB)
                self._send_json([{"id": j["id"], "name": j["name"]} for j in jobs])
            except Exception as exc:
                self._send_error_json(500, f"jobs load failed: {exc}")

        # /api/job-preview-by-name — same as job-preview but resolves job/weapon/shield by name
        # params: jobName, variant(1/2), equipState(right/up), weaponName?, shieldName?, scale?
        elif route == "job-preview-by-name":
            try:
                from parsers.csv_parser import load_jobs as _lj, load_equip as _le_n
                import urllib.parse as _urllib_parse
                job_name   = query.get("jobName",  [None])[0]
                rank       = query.get("rank",     [None])[0]   # e.g. "D", "C", "B", "A", "S"
                variant    = query.get("variant",  ["1"])[0]
                equip_state = query.get("equipState", ["right"])[0]
                weapon_name = query.get("weaponName", [None])[0]
                shield_name = query.get("shieldName", [None])[0]
                shield_cell = query.get("shieldCell", ["auto"])[0]
                pose_frame  = query.get("poseFrame", ["0"])[0]
                scale_str   = query.get("scale",   ["4"])[0]
                scale       = max(1, min(16, int(scale_str)))

                if not job_name:
                    self._send_error_json(400, "jobName is required")
                else:
                    jobs_list  = _lj(config.CSV_JOB)
                    job_row = None
                    # 1. Exact match (handles already-qualified names like "D Rank Beast Tamer")
                    job_row = next((j for j in jobs_list if j.get("name") == job_name), None)
                    # 2. Rank + name: try "X Rank JobName" then "X Grade JobName"
                    if job_row is None and rank:
                        for fmt in (f"{rank} Rank {job_name}", f"{rank} Grade {job_name}"):
                            job_row = next((j for j in jobs_list if j.get("name") == fmt), None)
                            if job_row:
                                break
                    # 3. Suffix fallback — lowest rank match when no rank given
                    if job_row is None:
                        suffix = " " + job_name.lower()
                        job_row = next((j for j in jobs_list if j.get("name", "").lower().endswith(suffix)), None)
                    if job_row is None:
                        self._send_error_json(404, f"job not found: {job_name} (rank={rank})")
                    else:
                        job_id = job_row["id"]
                        equip_list = _le_n(config.CSV_EQUIP)
                        weapon_id = -1
                        shield_id = -1
                        if weapon_name:
                            w = next((e for e in equip_list if e.get("name") == weapon_name), None)
                            if w: weapon_id = w["id"]
                        if shield_name:
                            s = next((e for e in equip_list if e.get("name") == shield_name), None)
                            if s: shield_id = s["id"]
                        url = (f"http://localhost:8765/api/job-preview"
                               f"?jobId={job_id}&variant={variant}&equipState={equip_state}"
                               f"&weaponId={weapon_id}&shieldId={shield_id}"
                               f"&shieldCell={_urllib_parse.quote(shield_cell)}"
                               f"&poseFrame={_urllib_parse.quote(pose_frame)}&scale={scale}")
                        import urllib.request as _urllib_req
                        with _urllib_req.urlopen(url, timeout=8) as resp:
                            self._send(200, "image/png", resp.read())
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"job-preview-by-name: {exc}\n{traceback.format_exc()}")

        # /api/job-parts?jobId=X&variant=V — resolve sprites for a single job
        # variant: 0=special/battle (imgXXXs[0]=2 for all jobs), 1=male, 2=female
        elif route == "job-parts":
            try:
                from parsers.csv_parser import load_jobs
                from parsers.inf_parser import parse_img_inf
                job_id_raw = query.get("jobId", [None])[0]
                variant_raw = query.get("variant", ["1"])[0]
                if job_id_raw is None:
                    self._send_error_json(400, "missing jobId")
                    return
                job_id = int(job_id_raw)
                variant = max(0, min(2, int(variant_raw)))

                jobs = load_jobs(config.CSV_JOB)
                job = next((j for j in jobs if j["id"] == job_id), None)
                if job is None:
                    self._send_error_json(404, f"jobId {job_id} not found")
                    return

                # Load asset registry for lookups
                reg_path = config.MAPPINGS_DIR / "asset_registry.json"
                if not reg_path.exists():
                    self._send_error_json(404, "registry not found — run extract first")
                    return
                import json as _json
                registry = _json.loads(reg_path.read_bytes())
                # Build index: sourcePng -> list[assetRef]
                png_index: dict[str, list] = {}
                for r in registry:
                    key = r.get("sourcePng", "")
                    png_index.setdefault(key, []).append(r)

                RES_SEEDS: dict[int, str] = {
                    9: "chip", 21: "building", 22: "monster",
                    # res=14 uses face/ (not head/; head/ has only 1 placeholder PNG)
                    14: "face",
                    # 4-col csv_parser values (verified: resBody=12, resHand=16, resFoot=15)
                    12: "body", 16: "hand", 15: "foot",
                    # 5-col values kept for forward compat
                    2: "body", 0: "hand", 4: "hand",
                    1: "shoes", 5: "shoes",
                    # res=18/19 seen on Blacksmith and other craft jobs
                    18: "hand", 19: "foot",
                }

                def _resolve_part(part_name: str, res: int, img_indices: list, var: int) -> dict:
                    steps = []
                    idx = img_indices[var] if var < len(img_indices) else None
                    dir_name = RES_SEEDS.get(res)
                    steps.append(f"res={res} -> dir={'(' + dir_name + ')' if dir_name else '(unknown)'}")
                    if dir_name is None:
                        return {"layer": part_name, "res": res, "dirName": None,
                                "imgIdx": idx, "filename": None, "sourcePng": None,
                                "assetRefs": [], "resolution": "missing_res", "steps": steps}
                    if idx is None or idx < 0:
                        steps.append(f"img index {idx} -> skip (negative/none)")
                        return {"layer": part_name, "res": res, "dirName": dir_name,
                                "imgIdx": idx, "filename": None, "sourcePng": None,
                                "assetRefs": [], "resolution": "no_index", "steps": steps}

                    inf_path = config.KA_ASSETS_DIR / dir_name / "img.inf"
                    inf = parse_img_inf(inf_path)
                    steps.append(f"img.inf [{idx}] -> {inf.get(idx, '(not found)')}")
                    filename = inf.get(idx)
                    if not filename:
                        return {"layer": part_name, "res": res, "dirName": dir_name,
                                "imgIdx": idx, "filename": None, "sourcePng": None,
                                "assetRefs": [], "resolution": "missing_inf", "steps": steps}

                    source_png = f"{dir_name}/{filename}"
                    refs = png_index.get(source_png, [])
                    steps.append(f"sourcePng={source_png} -> {len(refs)} registry entries")
                    resolution = "ok" if refs else "missing_registry"
                    return {"layer": part_name, "res": res, "dirName": dir_name,
                            "imgIdx": idx, "filename": filename, "sourcePng": source_png,
                            "assetRefs": refs, "resolution": resolution, "steps": steps}

                layers = []
                layers.append(_resolve_part("body",  job["resBody"], job["imgBodys"], variant))
                layers.append(_resolve_part("hand",  job["resHand"], job["imgHands"], variant))
                layers.append(_resolve_part("feet",  job["resFoot"], job["imgFoots"], variant))
                layers.append(_resolve_part("head",  job["resHead"], job["imgHeads"], variant))

                # Weapon and shield: job["weapon"] / job["shield"] are Equip item IDs.
                # Resolve: equip_id -> Equip CSV col[8] (img) -> sprite index -> weapon/img.inf filename.
                from parsers.csv_parser import load_equip
                equip_list = load_equip(config.CSV_EQUIP)
                equip_map = {e["id"]: e for e in equip_list}
                weapon_inf_path = config.KA_ASSETS_DIR / "weapon" / "img.inf"
                weapon_inf = parse_img_inf(weapon_inf_path)
                for w_part, equip_id in [("weapon", job["weapon"]), ("shield", job["shield"])]:
                    steps = []
                    if equip_id is None or equip_id < 0:
                        layers.append({"layer": w_part, "res": None, "dirName": "weapon",
                                       "imgIdx": equip_id, "filename": None, "sourcePng": None,
                                       "assetRefs": [], "resolution": "no_index",
                                       "steps": [f"equipId={equip_id} -> skip"]})
                        continue
                    equip = equip_map.get(equip_id)
                    steps.append(f"equipId={equip_id} -> {equip['name'] if equip else '(not found)'}")
                    if not equip or equip["img"] is None or equip["img"] < 0:
                        layers.append({"layer": w_part, "res": None, "dirName": "weapon",
                                       "imgIdx": equip_id, "filename": None, "sourcePng": None,
                                       "assetRefs": [], "resolution": "missing_inf", "steps": steps})
                        continue
                    sprite_idx = equip["img"]
                    filename = weapon_inf.get(sprite_idx)
                    steps.append(f"equip.img={sprite_idx} -> weapon/img.inf -> {filename or '(not found)'}")
                    if not filename:
                        layers.append({"layer": w_part, "res": None, "dirName": "weapon",
                                       "imgIdx": sprite_idx, "filename": None, "sourcePng": None,
                                       "assetRefs": [], "resolution": "missing_inf", "steps": steps})
                        continue
                    source_png = f"weapon/{filename}"
                    refs = png_index.get(source_png, [])
                    steps.append(f"sourcePng={source_png} -> {len(refs)} registry entries")
                    layers.append({"layer": w_part, "res": None, "dirName": "weapon",
                                   "imgIdx": sprite_idx, "filename": filename, "sourcePng": source_png,
                                   "assetRefs": refs, "resolution": "ok" if refs else "missing_registry",
                                   "steps": steps, "equipId": equip_id, "equipName": equip["name"]})

                self._send_json({
                    "jobId": job_id,
                    "jobName": job["name"],
                    "variant": variant,
                    "weapon": job["weapon"],
                    "shield": job["shield"],
                    "layers": layers,
                })
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"job-parts failed: {exc}\n{traceback.format_exc()}")

        # /api/job-preview?jobId=X&variant=V&scale=S
        # Returns a composited character PNG (PIL server-side rendering).
        # Layer order (bottom→top per IMG_* enum from global-metadata):
        #   shadow(0) → body(1) → foot(2) → shoes(3) → face(4) →
        #   mouth(5) → eye(6) → hair(7) → hat(8) → hand(10)
        # variant: 0=special/alternate, 1=standard male (default), 2=female
        elif route == "job-preview":
            try:
                import re as _re
                from parsers.csv_parser import load_jobs
                from parsers.inf_parser import parse_img_inf

                job_id  = int(query.get("jobId",  [None])[0] or 0)
                variant = max(0, min(2, int(query.get("variant", ["1"])[0])))
                scale   = max(1, min(16, int(query.get("scale",   ["8"])[0])))

                jobs = load_jobs(config.CSV_JOB)
                job  = next((j for j in jobs if j["id"] == job_id), None)
                if job is None:
                    self._send_error_json(404, f"jobId {job_id} not found")
                    return

                # Weapon / shield overrides from query params
                weapon_ov = query.get("weaponId", [None])[0]
                shield_ov = query.get("shieldId", [None])[0]
                if weapon_ov is not None or shield_ov is not None:
                    job = dict(job)
                    if weapon_ov is not None:
                        job["weapon"] = int(weapon_ov)
                    if shield_ov is not None:
                        job["shield"] = int(shield_ov)

                # ------------------------------------------------------------------
                def _blit(canvas, src_path, opt_path, v_state=0, u_frame=0, y_offset=0, x_offset=0, layer_type=None, mirror_x=False):
                    """Decode opt, pick slot (v_state, u_frame), blit onto canvas.
                    y_offset: add to dest_y. x_offset: add to dest_x.
                    layer_type: SEB layer type; shields (12) use no v=0 fallback so the
                    correct cell is always used even when the OPT slot was truncated."""
                    src_path, opt_path = Path(src_path), Path(opt_path)
                    if not src_path.exists() or not opt_path.exists():
                        return False
                    try:
                        src   = Image.open(src_path).convert("RGBA")
                        slots = _decode_opt(opt_path, src_img_size=src.size)
                        slot  = slots.get((v_state, u_frame))
                        # For non-shield layers: fallback to v=0 when requested state absent.
                        # For shields (type 12): never fallback; the truncated slot is now
                        # decoded, so a missing slot is a genuine miss, not a decode gap.
                        if slot is None and v_state != 0 and layer_type != 12:
                            slot = slots.get((0, u_frame))
                        if slot is None:
                            return False
                        if slot.get("recovered"):
                            print(f"[shield-opt] recovered truncated slot "
                                  f"type={layer_type} ({v_state},{u_frame}) "
                                  f"dest=({slot['dest_x']},{slot['dest_y']}) "
                                  f"src=({slot['src_x']},{slot['src_y']}) "
                                  f"size={slot['w']}x{slot['h']}", flush=True)
                        region = src.crop((slot["src_x"], slot["src_y"],
                                           slot["src_x"] + slot["w"],
                                           slot["src_y"] + slot["h"]))
                        paste_x = slot["dest_x"]
                        if mirror_x:
                            region = region.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                            paste_x = slot.get("cell_w", 24) - slot["dest_x"] - slot["w"]
                        canvas.paste(region, (paste_x + x_offset, slot["dest_y"] + y_offset), region)
                        return True
                    except Exception:
                        return False

                def _s16(value):
                    return value - 65536 if value > 32767 else value

                def _parse_seb_blocks(seb_name, rec_idx=0):
                    """Block-scan a .seb file; return draw ops in order.
                    Each op: {type, u, v, w, h, ox, oy}. type 65535 / >13 skipped."""
                    raw = (config.KA_ASSETS_DIR / "chara" / seb_name).read_bytes()
                    def _u16(o): return _struct.unpack_from('>H', raw, o)[0]
                    frame_count = _u16(4)
                    marker2     = _u16(6)
                    ops = []
                    off = 4
                    while off + 20 <= len(raw):
                        if _u16(off) == frame_count and _u16(off + 2) == marker2:
                            idx = min(rec_idx, max(0, frame_count - 1))
                            roff = off + idx * 20
                            if roff + 20 <= len(raw):
                                r = _struct.unpack_from('>10H', raw, roff)
                                layer_type = r[3]
                                if layer_type != 65535 and layer_type <= 13:
                                    w = _s16(r[6])
                                    h = _s16(r[7])
                                    if w > 0 and h > 0:
                                        opt_x = _s16(r[4])
                                        opt_y = _s16(r[5])
                                        ops.append({
                                            'type': layer_type,
                                            'u': opt_x // w,
                                            'v': opt_y // h,
                                            'w': w, 'h': h,
                                            'ox': _s16(r[8]),
                                            'oy': _s16(r[9]),
                                        })
                            off += max(20, frame_count * 20)
                        else:
                            off += 2
                    return ops

                def _qoff(layer, axis):
                    key = f"{axis}_{layer}"
                    v = query.get(key)
                    return int(v[0]) if v else 0

                def _qoff_t(layer_type, axis):
                    name = {0: 'shadow', 1: 'body', 2: 'feet', 3: 'shoes', 4: 'head',
                            5: 'head', 6: 'head', 7: 'head', 8: 'head',
                            10: 'hand', 11: 'weapon', 12: 'shield'}.get(layer_type)
                    return _qoff(name, axis) if name else 0

                _RES = {
                    14: "face",
                    2: "body",
                    0: "hand", 4: "hand", 18: "hand",
                    1: "shoes", 5: "shoes",
                    15: "foot", 19: "foot",
                    12: "body", 16: "hand",
                }

                def _resolve(res, img_indices, var):
                    d = _RES.get(res)
                    if not d:
                        return None, None
                    idx = img_indices[var] if var < len(img_indices) else None
                    if idx is None or idx < 0:
                        return d, None
                    inf = parse_img_inf(config.KA_ASSETS_DIR / d / "img.inf")
                    return d, inf.get(idx)

                _HAT_FOR_FACE_TYPE: dict[int, int] = {}

                KA = config.KA_ASSETS_DIR
                from parsers.csv_parser import load_equip as _le
                _equip_map = {e["id"]: e for e in _le(config.CSV_EQUIP)}
                _w_inf = parse_img_inf(KA / "weapon" / "img.inf")

                def _resolve_weapon_sprite(equip_id):
                    if equip_id is None or equip_id < 0:
                        return None, None
                    eq = _equip_map.get(equip_id)
                    if not eq or eq.get("img") is None or eq["img"] < 0:
                        return None, None
                    fname = _w_inf.get(eq["img"])
                    if not fname:
                        return None, None
                    png = KA / "weapon" / fname
                    opt = KA / "weapon" / (Path(fname).stem + ".opt")
                    return (png if png.exists() else None), (opt if opt.exists() else None)

                def _resolve_layer_asset(op):
                    """Return (png_path, opt_path, is_strip).
                    is_strip=True: crop a raw cell from a strip image; no .opt needed."""
                    t = op['type']
                    if t == 0:
                        p = KA / "shadow" / "shadow.png"
                        o = KA / "shadow" / "shadow.opt"
                        return (p if p.exists() else None), (o if o.exists() else None), False
                    elif t == 1:
                        d, f = _resolve(job["resBody"], job["imgBodys"], variant)
                        if d and f:
                            return KA / d / f, KA / d / (Path(f).stem + ".opt"), False
                    elif t == 2:
                        d, f = _resolve(job["resFoot"], job["imgFoots"], variant)
                        if d and f:
                            return KA / d / f, KA / d / (Path(f).stem + ".opt"), False
                    elif t == 3:
                        pass  # shoes/terrain overlay — not rendered in standalone job preview
                    elif t == 4:
                        # Face sprites always live in face/ regardless of resHead res value.
                        # resHead res=2 maps to "body" in _RES which is wrong for head lookup.
                        idx = job["imgHeads"][variant] if variant < len(job["imgHeads"]) else None
                        if idx is not None and idx >= 0:
                            _face_inf = parse_img_inf(KA / "face" / "img.inf")
                            fname = _face_inf.get(idx)
                            if fname:
                                return KA / "face" / fname, KA / "face" / (Path(fname).stem + ".opt"), False
                    elif t == 5:
                        p = KA / "mouth" / "mouth_00.png"
                        o = KA / "mouth" / "mouth_00.opt"
                        if p.exists() and o.exists():
                            return p, o, False
                    elif t == 6:
                        p = KA / "eye" / "eye_00.png"
                        o = KA / "eye" / "eye_00.opt"
                        if p.exists() and o.exists():
                            return p, o, False
                    elif t == 7:
                        _, bf = _resolve(job["resBody"], job["imgBodys"], variant)
                        gender = "w" if bf and bf.startswith("w_") else "m"
                        p = KA / "hair" / f"hair_{gender}_00.png"
                        if p.exists():
                            return p, None, True
                    elif t == 8:
                        _, f = _resolve(job["resHead"], job["imgHeads"], variant)
                        if f:
                            _m = _re.match(r'[mw]_face_(\d+)', Path(f).stem)
                            if _m:
                                hat_idx = _HAT_FOR_FACE_TYPE.get(int(_m.group(1)))
                                if hat_idx is not None:
                                    hat_inf = parse_img_inf(KA / "hat" / "img.inf")
                                    hf = hat_inf.get(hat_idx)
                                    if hf:
                                        hp = KA / "hat" / hf
                                        if hp.exists():
                                            return hp, None, True
                    elif t == 10:
                        d, f = _resolve(job["resHand"], job["imgHands"], variant)
                        if d and f:
                            return KA / d / f, KA / d / (Path(f).stem + ".opt"), False
                    elif t == 11:
                        p, o = _resolve_weapon_sprite(job["weapon"])
                        if p and o:
                            return p, o, False
                        elif p:  # no .opt: crop cell from sheet PNG using SEB canvas dims
                            return p, None, True
                    elif t == 12:
                        p, o = _resolve_weapon_sprite(job["shield"])
                        if p and o:
                            return p, o, False
                        elif p:
                            return p, None, True
                    return None, None, False

                # ------------------------------------------------------------------
                pose_frame = max(0, min(3, int(query.get("poseFrame", ["0"])[0] or 0)))
                has_equipment = (
                    (job.get("weapon") is not None and job["weapon"] >= 0) or
                    (job.get("shield") is not None and job["shield"] >= 0)
                )
                equip_state_raw = query.get("equipState", ["front-right"])[0]
                equip_state = {
                    "front": "right",
                    "front-right": "right",
                    "menu": "right",
                    "back": "up",
                    "back-facing": "up",
                }.get(equip_state_raw, equip_state_raw)
                if equip_state == "up":
                    seb_name = "equip_wait_up.seb"
                elif has_equipment:
                    seb_name = "equip_wait_right.seb"
                else:
                    seb_name = "wait_right.seb"
                # shieldCell=auto uses SEB v directly; 0 or 1 forces that OPT row
                shield_cell_param = query.get("shieldCell", ["auto"])[0]
                draw_ops   = _parse_seb_blocks(seb_name, pose_frame)
                body_op    = next((op for op in draw_ops if op['type'] == 1), None)
                if body_op is None:
                    draw_ops = _parse_seb_blocks("wait_right.seb", pose_frame)
                    body_op  = next((op for op in draw_ops if op['type'] == 1), None)
                body_ox = body_op['ox'] if body_op else 0
                body_oy = body_op['oy'] if body_op else 0

                def _pose_refs(ops):
                    pose_body = next((op for op in ops if op['type'] == 1), None)
                    pose_body_ox = pose_body['ox'] if pose_body else 0
                    pose_body_oy = pose_body['oy'] if pose_body else 0
                    pose_shadow = next((op for op in ops if op['type'] == 0), None)
                    pose_ref_oy = pose_shadow['oy'] if pose_shadow else pose_body_oy
                    return pose_body_ox, pose_body_oy, pose_ref_oy

                def _pose_extents(ops, pose_body_ox, pose_ref_oy):
                    pose_min_x, pose_min_y =  0,  0
                    pose_max_x, pose_max_y = 24, 30
                    for pose_op in ops:
                        dx = pose_op['ox'] - pose_body_ox
                        dy = pose_op['oy'] - pose_ref_oy
                        pose_min_x = min(pose_min_x, dx)
                        pose_min_y = min(pose_min_y, dy)
                        pose_max_x = max(pose_max_x, dx + pose_op['w'])
                        pose_max_y = max(pose_max_y, dy + pose_op['h'])
                    return pose_min_x, pose_min_y, pose_max_x, pose_max_y

                # Use the shadow layer as the stable ground-level y-anchor so that
                # feet/shadow stay fixed in the canvas while the body rises or falls
                # between tall and short pose frames.  Falls back to body_oy if no shadow.
                body_ox, body_oy, ref_oy = _pose_refs(draw_ops)

                # Compute a canonical canvas envelope across all idle pose frames.
                # A frame-local top extent can otherwise change origin_y and move the
                # floor line even when the feet/shadow SEB anchors are unchanged.
                pose_extent_values = []
                for extent_frame in range(4):
                    extent_ops = _parse_seb_blocks(seb_name, extent_frame)
                    if not any(op['type'] == 1 for op in extent_ops):
                        extent_ops = _parse_seb_blocks("wait_right.seb", extent_frame)
                    extent_body_ox, _extent_body_oy, extent_ref_oy = _pose_refs(extent_ops)
                    pose_extent_values.append(
                        _pose_extents(extent_ops, extent_body_ox, extent_ref_oy))

                min_x = min(extent[0] for extent in pose_extent_values)
                min_y = min(extent[1] for extent in pose_extent_values)
                max_x = max(extent[2] for extent in pose_extent_values)
                max_y = max(extent[3] for extent in pose_extent_values)

                origin_x   = -min_x
                origin_y   = -min_y
                COMBINED_W = max_x - min_x
                COMBINED_H = max_y - min_y
                canvas = Image.new("RGBA", (COMBINED_W, COMBINED_H), (0, 0, 0, 0))

                # ------------------------------------------------------------------
                # Shield anchor correction: for right-facing shields, compute the
                # offset needed to match the front/up paired anchor.
                # ------------------------------------------------------------------
                def _get_shield_anchor_correction(opt_path, right_v, right_rel_x, right_rel_y, frame_idx=0):
                    """Compute (dx, dy) needed to anchor right-facing shield to front/up anchor.
                    Returns (0, 0) if correction cannot be determined."""
                    try:
                        # Parse front/up SEB to get front shield rel
                        up_seb_raw = (KA / "chara" / "equip_wait_up.seb").read_bytes()
                        def _u16a(o): return _struct.unpack_from('>H', up_seb_raw, o)[0]
                        def _s16a(v): return v - 65536 if v > 32767 else v
                        up_frame_count = _u16a(4)
                        up_marker2     = _u16a(6)
                        up_shield_rel_x = up_shield_rel_y = None
                        off = 4
                        while off + 20 <= len(up_seb_raw):
                            if _u16a(off) == up_frame_count and _u16a(off + 2) == up_marker2:
                                up_idx = min(frame_idx, max(0, up_frame_count - 1))
                                roff = off + up_idx * 20
                                if roff + 20 <= len(up_seb_raw):
                                    r = _struct.unpack_from('>10H', up_seb_raw, roff)
                                    if r[3] == 12:  # shield layer
                                        up_body_ox = 0
                                        up_body_oy = 0
                                        # Also need body to compute rel
                                        off2 = 4
                                        while off2 + 20 <= len(up_seb_raw):
                                            if _u16a(off2) == up_frame_count and _u16a(off2 + 2) == up_marker2:
                                                roff2 = off2 + up_idx * 20
                                                if roff2 + 20 <= len(up_seb_raw):
                                                    r2 = _struct.unpack_from('>10H', up_seb_raw, roff2)
                                                    if r2[3] == 1:  # body
                                                        up_body_ox = _s16a(r2[8])
                                                        up_body_oy = _s16a(r2[9])
                                                        break
                                                off2 += max(20, up_frame_count * 20)
                                            else:
                                                off2 += 2
                                        up_shield_ox = _s16a(r[8])
                                        up_shield_oy = _s16a(r[9])
                                        up_shield_rel_x = up_shield_ox - up_body_ox
                                        up_shield_rel_y = up_shield_oy - up_body_oy
                                        break
                                off += max(20, up_frame_count * 20)
                            else:
                                off += 2
                        if up_shield_rel_x is None:
                            return 0, 0
                        # Decode OPT to get right slot and front/up slot
                        src_img = Image.open(opt_path.with_suffix('.png')).convert("RGBA")
                        slots   = _decode_opt(opt_path, src_img_size=src_img.size)
                        right_slot = slots.get((right_v, 0))
                        front_slot = slots.get((0, 0))
                        if right_slot is None or front_slot is None:
                            return 0, 0
                        # Match the paired visible right edge horizontally; side cells
                        # can be wider than their front/up partner.
                        front_x = up_shield_rel_x + front_slot['dest_x'] + front_slot['w']
                        front_y = up_shield_rel_y + front_slot['dest_y']
                        right_x = right_rel_x + right_slot['dest_x'] + right_slot['w']
                        right_y = right_rel_y + right_slot['dest_y']
                        return (front_x - right_x, front_y - right_y)
                    except Exception:
                        return 0, 0

                # Draw each .seb layer in block order
                # For shields, filter to only draw the first shield operation (front-facing)
                shield_drawn = False
                for op in draw_ops:
                    png, opt, is_strip = _resolve_layer_asset(op)
                    if png is None or not png.exists():
                        continue
                    
                    # Skip additional shield layers - only draw the first shield
                    if op['type'] == 12:
                        if shield_drawn:
                            continue
                        shield_drawn = True
                    
                    layer_x = (op['ox'] - body_ox) + origin_x + _qoff_t(op['type'], 'dx')
                    layer_y = (op['oy'] - ref_oy) + origin_y + _qoff_t(op['type'], 'dy')
                    if is_strip:
                        strip = Image.open(png).convert("RGBA")
                        cell_w, cell_h = op['w'], op['h']
                        crop = strip.crop((op['u'] * cell_w, op['v'] * cell_h,
                                           (op['u'] + 1) * cell_w, (op['v'] + 1) * cell_h))
                        canvas.paste(crop, (layer_x, layer_y), crop)
                    else:
                        v_use = op['v']
                        auto_anchor_dx = auto_anchor_dy = 0
                        if op['type'] == 12:
                            if shield_cell_param != "auto":
                                try:
                                    v_use = int(shield_cell_param)
                                except ValueError:
                                    pass
                            print(f"[shield-cell] state={equip_state} seb_v={op['v']} "
                                  f"selected={v_use} "
                                  f"{'(override)' if shield_cell_param != 'auto' else '(auto)'}",
                                  flush=True)
                            # Right-facing shields use mirrored OPT dest_x in _blit;
                            # no additional front/up edge correction is needed.
                        _blit(canvas, png, opt,
                              v_state=v_use, u_frame=op['u'],
                              x_offset=layer_x + auto_anchor_dx, y_offset=layer_y + auto_anchor_dy,
                            layer_type=op['type'],
                            mirror_x=(op['type'] == 12 and equip_state == "right"))

                # Scale up for crisp pixel display
                if scale > 1:
                    canvas = canvas.resize((canvas.width * scale, canvas.height * scale),
                                           Image.Resampling.NEAREST)

                buf = _io.BytesIO()
                canvas.save(buf, format="PNG")
                self._send(200, "image/png", buf.getvalue())

            except Exception as exc:
                import traceback
                self._send_error_json(500,
                    f"job-preview: {exc}\n{traceback.format_exc()}")

        # /api/equip?category=N — list equip items with renderable sprites
        # category: 0=weapon, 1=shield, 2=accessory
        elif route == "equip":
            try:
                from parsers.csv_parser import load_equip
                cat_raw = query.get("category", [None])[0]
                items = load_equip(config.CSV_EQUIP)
                if cat_raw is not None:
                    items = [e for e in items if e["category"] == int(cat_raw)]
                items = [e for e in items if e.get("img") is not None and e["img"] >= 0]
                self._send_json([
                    {"id": e["id"], "name": e["name"], "rank": e["rank"]}
                    for e in items
                ])
            except Exception as exc:
                self._send_error_json(500, f"equip load failed: {exc}")

        # /api/shield-raw?shieldId=N&cell=V&scale=S — raw decoded single shield cell PNG
        elif route == "shield-raw":
            try:
                from parsers.csv_parser import load_equip
                shield_id = int(query.get("shieldId", ["-1"])[0])
                cell_v    = max(0, int(query.get("cell",    ["0"])[0]))
                sc_scale  = max(1, min(16, int(query.get("scale", ["8"])[0])))
                items = load_equip(config.CSV_EQUIP)
                item  = next((i for i in items if i["id"] == shield_id), None)
                if item is None or item.get("img", -2) < 0:
                    self._send_error_json(404, f"shield {shield_id} not found or no sprite")
                    return
                w_inf = parse_img_inf(KA / "weapon" / "img.inf")
                fname = w_inf.get(item["img"])
                if not fname:
                    self._send_error_json(404, f"img {item['img']} not in weapon/img.inf")
                    return
                png_path = KA / "weapon" / fname
                opt_path = KA / "weapon" / (Path(fname).stem + ".opt")
                if not png_path.exists() or not opt_path.exists():
                    self._send_error_json(404, f"sprite files not found: {fname}")
                    return
                src  = Image.open(png_path).convert("RGBA")
                slots = _decode_opt(opt_path, src_img_size=src.size)
                slot  = slots.get((cell_v, 0))
                if slot is None:
                    self._send_error_json(404, f"no decoded slot for cell={cell_v}")
                    return
                cell_img = src.crop((
                    slot["src_x"], slot["src_y"],
                    slot["src_x"] + slot["w"],
                    slot["src_y"] + slot["h"],
                ))
                if sc_scale > 1:
                    cell_img = cell_img.resize(
                        (cell_img.width * sc_scale, cell_img.height * sc_scale),
                        Image.Resampling.NEAREST)
                buf = _io.BytesIO()
                cell_img.save(buf, format="PNG")
                self._send(200, "image/png", buf.getvalue())
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"shield-raw: {exc}\n{traceback.format_exc()}")

        # /api/shield-anchor-debug?jobId=N&variant=V&shieldId=S&equipState=E&shieldCell=C
        #   &poseFrame=P&dx_shield=X&dy_shield=Y
        # Returns JSON with shield/hand anchor math for debugging final paste position.
        elif route == "shield-anchor-debug":
            try:
                from parsers.csv_parser import load_equip, load_jobs
                job_id      = int(query.get("jobId",    ["1"])[0])
                variant     = max(0, min(2, int(query.get("variant",   ["1"])[0])))
                shield_id   = int(query.get("shieldId", ["-1"])[0])
                equip_state_raw = query.get("equipState", ["front-right"])[0]
                equip_state = {
                    "front": "right",
                    "front-right": "right",
                    "menu": "right",
                    "back": "up",
                    "back-facing": "up",
                }.get(equip_state_raw, equip_state_raw)
                sc_param    = query.get("shieldCell",  ["auto"])[0]
                pose_frame  = max(0, min(3, int(query.get("poseFrame", ["0"])[0])))
                dx_shield   = int(query.get("dx_shield", ["0"])[0])
                dy_shield   = int(query.get("dy_shield", ["0"])[0])

                seb_name = "equip_wait_up.seb" if equip_state == "up" else "equip_wait_right.seb"
                raw_seb  = (KA / "chara" / seb_name).read_bytes()

                def _u16d(o): return _struct.unpack_from('>H', raw_seb, o)[0]
                def _s16d(v): return v - 65536 if v > 32767 else v

                frame_count = _u16d(4)
                marker2     = _u16d(6)
                all_ops: list = []
                off = 4
                while off + 20 <= len(raw_seb):
                    if _u16d(off) == frame_count and _u16d(off + 2) == marker2:
                        idx  = min(pose_frame, max(0, frame_count - 1))
                        roff = off + idx * 20
                        if roff + 20 <= len(raw_seb):
                            r  = _struct.unpack_from('>10H', raw_seb, roff)
                            lt = r[3]
                            if lt != 65535 and lt <= 13:
                                w, h = _s16d(r[6]), _s16d(r[7])
                                if w > 0 and h > 0:
                                    all_ops.append({
                                        'type': lt, 'w': w, 'h': h,
                                        'u': _s16d(r[4]) // w,
                                        'v': _s16d(r[5]) // h,
                                        'ox': _s16d(r[8]), 'oy': _s16d(r[9]),
                                    })
                        off += max(20, frame_count * 20)
                    else:
                        off += 2

                body_op   = next((o for o in all_ops if o['type'] == 1),  None)
                shield_op = next((o for o in all_ops if o['type'] == 12), None)
                hand_op   = next((o for o in all_ops if o['type'] == 10), None)
                body_ox   = body_op['ox'] if body_op else 0
                body_oy   = body_op['oy'] if body_op else 0

                result: dict = {
                    "seb":        seb_name,
                    "facing":     "Front facing, looking right" if equip_state == "right" else "Back facing",
                    "equip_state": equip_state,
                    "pose_frame":  pose_frame,
                    "dx_shield":  dx_shield,
                    "dy_shield":  dy_shield,
                }

                # --- Shield anchor math ---
                if shield_op:
                    shield_rel_x = shield_op['ox'] - body_ox
                    shield_rel_y = shield_op['oy'] - body_oy
                    result["shield_seb_rel"] = {"x": shield_rel_x, "y": shield_rel_y}
                    result["shield_seb_v"]   = shield_op['v']
                    items = load_equip(config.CSV_EQUIP)
                    item  = next((i for i in items if i["id"] == shield_id), None)
                    if item and item.get("img", -2) >= 0:
                        w_inf = parse_img_inf(KA / "weapon" / "img.inf")
                        fname = w_inf.get(item["img"])
                        if fname:
                            png_path = KA / "weapon" / fname
                            opt_path = KA / "weapon" / (Path(fname).stem + ".opt")
                            if png_path.exists() and opt_path.exists():
                                src_img = Image.open(png_path).convert("RGBA")
                                slots   = _decode_opt(opt_path, src_img_size=src_img.size)
                                v_use   = shield_op['v']
                                if sc_param != "auto":
                                    try: v_use = int(sc_param)
                                    except ValueError: pass
                                slot = slots.get((v_use, 0))
                                if slot:
                                    raw_dest_x, dest_y = slot['dest_x'], slot['dest_y']
                                    sw, sh = slot['w'], slot['h']
                                    dest_x = raw_dest_x
                                    mirrored_dest_x = None
                                    if equip_state == "right":
                                        mirrored_dest_x = slot.get("cell_w", 24) - raw_dest_x - sw
                                        dest_x = mirrored_dest_x
                                    # Base position (SEB rel + effective slot dest)
                                    base_x = shield_rel_x + dest_x
                                    base_y = shield_rel_y + dest_y
                                    # Mirrored shields use mirrored OPT dest_x directly.
                                    auto_dx = auto_dy = 0
                                    if equip_state == "right":
                                        result["shield_anchor"] = {
                                            "mode": "mirrored OPT dest_x, SEB right-facing anchor",
                                            "raw_dest_x": raw_dest_x,
                                            "mirrored_dest_x": mirrored_dest_x,
                                            "cell_w": slot.get("cell_w", 24),
                                            "mirror_x": True,
                                            "visual_dx": 0,
                                        }
                                    # Final position (base + auto + manual dx/dy)
                                    final_x = base_x + auto_dx + dx_shield
                                    final_y = base_y + auto_dy + dy_shield
                                    result["shield_png"]  = fname
                                    result["shield_slot"] = {
                                        "v": v_use,
                                        "dest_x": dest_x, "dest_y": dest_y,
                                        "raw_dest_x": raw_dest_x,
                                        "mirrored_dest_x": mirrored_dest_x,
                                        "cell_w": slot.get("cell_w", 24),
                                        "w": sw, "h": sh,
                                        "recovered": slot.get("recovered", False),
                                    }
                                    result["base_shield_bbox"] = {
                                        "x0": base_x,       "y0": base_y,
                                        "x1": base_x + sw,  "y1": base_y + sh,
                                    }
                                    result["auto_anchor_correction"] = {"dx": auto_dx, "dy": auto_dy}
                                    result["final_shield_bbox"] = {
                                        "x0": final_x,       "y0": final_y,
                                        "x1": final_x + sw,  "y1": final_y + sh,
                                    }

                # --- Hand anchor math ---
                if hand_op:
                    hand_rel_x = hand_op['ox'] - body_ox
                    hand_rel_y = hand_op['oy'] - body_oy
                    result["hand_seb_rel"] = {"x": hand_rel_x, "y": hand_rel_y}
                    jobs = load_jobs(config.CSV_JOB)
                    job  = next((j for j in jobs if j["id"] == job_id), None)
                    if job:
                        _HAND_RES = {0: "hand", 4: "hand", 18: "hand", 16: "hand"}
                        hand_dir  = _HAND_RES.get(job.get("resHand"), "hand")
                        hand_imgs = job.get("imgHands", [])
                        hand_idx  = hand_imgs[variant] if variant < len(hand_imgs) else None
                        if hand_idx is not None and hand_idx >= 0:
                            h_inf = parse_img_inf(KA / hand_dir / "img.inf")
                            hf    = h_inf.get(hand_idx)
                            if hf:
                                h_opt = KA / hand_dir / (Path(hf).stem + ".opt")
                                if h_opt.exists():
                                    h_slots = _decode_opt(h_opt)
                                    h_slot  = h_slots.get((hand_op['v'], 0))
                                    if h_slot is None and hand_op['v'] != 0:
                                        h_slot = h_slots.get((0, 0))
                                    if h_slot:
                                        hx = hand_rel_x + h_slot['dest_x']
                                        hy = hand_rel_y + h_slot['dest_y']
                                        result["hand_slot"] = {
                                            "v":      hand_op['v'],
                                            "dest_x": h_slot['dest_x'],
                                            "dest_y": h_slot['dest_y'],
                                            "w":      h_slot['w'],
                                            "h":      h_slot['h'],
                                        }
                                        result["hand_bbox_body_rel"] = {
                                            "x0": hx,               "y0": hy,
                                            "x1": hx + h_slot['w'], "y1": hy + h_slot['h'],
                                        }

                self._send_json(result)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"shield-anchor-debug: {exc}\n{traceback.format_exc()}")

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

        # /api/facilities — list all facilities with their sprite info
        # Returns: [{id, name, chips: [{idx, file, exists}]}]
        elif route == "facilities":
            try:
                from parsers.inf_parser import parse_img_inf
                from parsers.csv_parser import load_facilities as _load_fac
                import csv as _csv_mod
                KA = config.KA_ASSETS_DIR

                # Parse chips from facility CSV:
                # col 23 = parentChipId, col 24 = child count, cols 25-27 = child chip IDs
                def _load_fac_chips(path):
                    with open(path, newline="", encoding="utf-8") as fh:
                        rows = list(_csv_mod.reader(fh))
                    result = []
                    for r in rows[3:]:
                        if not r or not r[0].strip() or not r[0].strip().lstrip("-").isdigit():
                            continue
                        fid = int(r[0])
                        if fid < 0:
                            continue
                        name = r[1] if len(r) > 1 else ""
                        
                        # Build chip list: parent chip + child chips
                        chips = []
                        parent_chip = r[23].strip() if len(r) > 23 else ""
                        if parent_chip and parent_chip not in ("", "-1"):
                            chips.append(int(parent_chip))
                        
                        # Read child count and child chips
                        child_count_str = r[24].strip() if len(r) > 24 else ""
                        if child_count_str and child_count_str not in ("", "-1"):
                            child_count = int(child_count_str)
                            for i in range(min(child_count, 3)):
                                c = 25 + i
                                v = r[c].strip() if c < len(r) else ""
                                if v and v not in ("", "-1"):
                                    chips.append(int(v))
                        
                        result.append({"id": fid, "name": name, "chips": chips})
                    return result

                b_inf = parse_img_inf(KA / "building" / "img.inf")
                fac_list = _load_fac_chips(config.CSV_FACILITY)
                out = []
                for fac in fac_list:
                    chip_info = []
                    for chip_idx in fac["chips"]:
                        fname = b_inf.get(chip_idx)
                        chip_info.append({
                            "idx":    chip_idx,
                            "file":   fname,
                            "exists": bool(fname and (KA / "building" / fname).exists()),
                        })
                    out.append({
                        "id":    fac["id"],
                        "name":  fac["name"],
                        "chips": chip_info,
                    })
                self._send_json(out)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"facilities: {exc}\n{traceback.format_exc()}")

        # /api/facility-preview?id=N[&scale=N] — composite PNG of all building chips for facility N
        elif route == "facility-preview":
            try:
                from parsers.inf_parser import parse_img_inf
                from PIL import Image
                import io as _io
                import csv as _csv_mod
                KA = config.KA_ASSETS_DIR

                fac_id   = int(query.get("id", ["0"])[0])
                scale    = min(int(query.get("scale", ["4"])[0]), 8)

                # Parse facility chips: col 23 = parentChipId, col 24 = child count, cols 25-27 = child chips
                with open(config.CSV_FACILITY, newline="", encoding="utf-8") as fh:
                    fac_rows = list(_csv_mod.reader(fh))
                fac_row = None
                for r in fac_rows[3:]:
                    if r and r[0].strip() == str(fac_id):
                        fac_row = r
                        break
                if fac_row is None:
                    self._send_error_json(404, f"facility {fac_id} not found")
                    return

                b_inf = parse_img_inf(KA / "building" / "img.inf")
                
                # Build chip list: parent chip + child chips
                chip_indices = []
                parent_chip = fac_row[23].strip() if len(fac_row) > 23 else ""
                if parent_chip and parent_chip not in ("", "-1"):
                    chip_indices.append(int(parent_chip))
                
                # Read child count and child chips
                child_count_str = fac_row[24].strip() if len(fac_row) > 24 else ""
                if child_count_str and child_count_str not in ("", "-1"):
                    child_count = int(child_count_str)
                    for i in range(min(child_count, 3)):
                        c = 25 + i
                        v = fac_row[c].strip() if c < len(fac_row) else ""
                        if v and v not in ("", "-1"):
                            chip_indices.append(int(v))
                
                chip_imgs = []
                for chip_idx in chip_indices:
                    fname = b_inf.get(chip_idx)
                    if fname:
                        p = KA / "building" / fname
                        if p.exists():
                            chip_imgs.append(Image.open(p).convert("RGBA"))

                if not chip_imgs:
                    # No specific sprite — return 1×1 transparent
                    placeholder = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
                    buf = _io.BytesIO()
                    placeholder.save(buf, format="PNG")
                    self._send(200, "image/png", buf.getvalue())
                    return

                # Lay out all chip images side-by-side with 2px gap
                GAP = 2
                total_w = sum(img.width for img in chip_imgs) + GAP * (len(chip_imgs) - 1)
                max_h   = max(img.height for img in chip_imgs)
                canvas  = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
                x = 0
                for img in chip_imgs:
                    canvas.paste(img, (x, max_h - img.height), img)
                    x += img.width + GAP

                if scale > 1:
                    canvas = canvas.resize(
                        (canvas.width * scale, canvas.height * scale), Image.Resampling.NEAREST)

                buf = _io.BytesIO()
                canvas.save(buf, format="PNG")
                self._send(200, "image/png", buf.getvalue())

            except Exception as exc:
                import traceback
                self._send_error_json(500, f"facility-preview: {exc}\n{traceback.format_exc()}")

        # /api/building-preview?idx=N[&scale=N] — render a building/img.inf sprite directly
        elif route == "building-preview":
            try:
                from parsers.inf_parser import parse_img_inf
                from PIL import Image
                import io as _io
                KA = config.KA_ASSETS_DIR
                b_idx   = int(query.get("idx", ["0"])[0])
                scale   = min(int(query.get("scale", ["4"])[0]), 8)
                b_inf   = parse_img_inf(KA / "building" / "img.inf")
                fname   = b_inf.get(b_idx)
                if not fname:
                    self._send_error_json(404, f"building index {b_idx} not in img.inf")
                    return
                p = KA / "building" / fname
                if not p.exists():
                    self._send_error_json(404, f"building PNG not found: {fname}")
                    return
                img = Image.open(p).convert("RGBA")
                if scale > 1:
                    img = img.resize((img.width * scale, img.height * scale), Image.Resampling.NEAREST)
                buf = _io.BytesIO()
                img.save(buf, format="PNG")
                self._send(200, "image/png", buf.getvalue())
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"building-preview: {exc}\n{traceback.format_exc()}")

        # /api/item-icon?id=N[&scale=S] — extract item icon with semantic routing (v13)
        # IDs 0-6: material_icon.png (resources)
        # IDs 15-70: English.lproj/icon_item2.png (localized usable items, shop items, trophies)
        # IDs 71+: icon_item.png (goods/materials)
        elif route == "item-icon":
            try:
                from parsers.csv_parser import load_items
                from PIL import Image
                import io as _io
                import struct as _struct_local
                KA = config.KA_ASSETS_DIR
                item_id = int(query.get("id", ["0"])[0])
                scale = min(int(query.get("scale", ["4"])[0]), 8)
                
                items = load_items(config.CSV_ITEM)
                item = next((i for i in items if i["id"] == item_id), None)
                if not item:
                    self._send_error_json(404, f"item {item_id} not found in CSV")
                    return
                
                icon_u = item.get("iconU")
                icon_v = item.get("iconV")
                if icon_u is None or icon_v is None or icon_u < 0 or icon_v < 0:
                    self._send_error_json(404, f"item {item_id} has no valid icon coordinates")
                    return
                
                # Semantic routing based on item ID
                icon = None
                status_info = {}
                
                # IDs 0-6: Resources (Diamonds, Grass, Wood, Food, Ore, Mystic Ore, Energy)
                # v14: Direct top-row cropping from material_icon.png (14×14 grid, y=0)
                if 0 <= item_id <= 6:
                    mat_png = KA / "com" / "material_icon.png"
                    
                    if not mat_png.exists():
                        self._send_error_json(404, f"material_icon.png not found")
                        return
                    
                    source_img = Image.open(mat_png).convert("RGBA")
                    
                    # Direct top-row grid cropping (no .seb parsing)
                    # Top row: y=0, each icon is 14×14, indexed by item_id
                    resource_index = item_id
                    src_x = resource_index * 14
                    src_y = 0
                    src_w = 14
                    src_h = 14
                    
                    # Crop and center on 16×16 canvas
                    canvas = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
                    if src_x + src_w <= source_img.width and src_y + src_h <= source_img.height:
                        cropped = source_img.crop((src_x, src_y, src_x + src_w, src_y + src_h))
                        # Center on canvas (14×14 → 16×16, paste at (1,1))
                        canvas.paste(cropped, (1, 1), cropped)
                    icon = canvas
                    status_info = {
                        "method": "material_top_row",
                        "status": "filled",
                        "sheet": "com/material_icon.png",
                        "opt_exists": False,
                        "source_rect": f"{src_x},{src_y},{src_w},{src_h}"
                    }
                
                # IDs 15-70: Localized usable items (v13 - use English.lproj for English inspector)
                # Includes: diamond packs (15-18), shop/social items (19-25), usable items (26-70)
                elif 15 <= item_id <= 70:
                    sheet_path = KA / "com_2" / "English.lproj" / "icon_item2.png"
                    opt_path = KA / "com_2" / "English.lproj" / "icon_item2.opt"
                    icon, status_info = _extract_packed_icon_with_status(sheet_path, opt_path, icon_u, icon_v)
                    status_info["sheet"] = "com_2/English.lproj/icon_item2.png"
                    
                    if icon is None:
                        self._send_error_json(404, f"English.lproj/icon_item2.png not found")
                        return
                
                # IDs 71+: Goods and materials
                else:
                    sheet_path = KA / "com" / "icon_item.png"
                    opt_path = KA / "com" / "icon_item.opt"
                    icon, status_info = _extract_packed_icon_with_status(sheet_path, opt_path, icon_u, icon_v)
                    status_info["sheet"] = "com/icon_item.png"
                    
                    if icon is None:
                        self._send_error_json(404, f"icon_item.png not found")
                        return
                
                if scale > 1:
                    icon = icon.resize((icon.width * scale, icon.height * scale), Image.Resampling.NEAREST)
                
                buf = _io.BytesIO()
                icon.save(buf, format="PNG")
                
                # Add status headers for UI display
                extra_headers = {
                    "X-Icon-Method": status_info.get("method", "unknown"),
                    "X-Icon-Status": status_info.get("status", "unknown"),
                    "X-Icon-Sheet": status_info.get("sheet", "unknown"),
                    "X-Icon-Opt-Exists": str(status_info.get("opt_exists", False))
                }
                # Add source rect for material_top_row method
                if "source_rect" in status_info:
                    extra_headers["X-Icon-Source-Rect"] = status_info["source_rect"]
                self._send(200, "image/png", buf.getvalue(), extra_headers)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"item-icon: {exc}\n{traceback.format_exc()}")

        # /api/egg-icon?id=N[&scale=S] — extract egg icon from material/egg_NN.png (UNHATCHED version)
        # v15: Uses Egg.csv and material/img.inf to resolve image_id→filename
        # Egg PNGs are 28×55 with two states: unhatched (top 28×33) and hatched (bottom)
        elif route == "egg-icon":
            try:
                from parsers.csv_parser import load_eggs
                from parsers.inf_parser import parse_img_inf
                from parsers.opt_parser import parse_opt
                from PIL import Image
                import io as _io
                KA = config.KA_ASSETS_DIR
                egg_id = int(query.get("id", ["0"])[0])
                scale = min(int(query.get("scale", ["4"])[0]), 8)
                
                eggs = load_eggs(config.CSV_EGG)
                egg = next((e for e in eggs if e["id"] == egg_id), None)
                if not egg:
                    self._send_error_json(404, f"egg {egg_id} not found in Egg.csv")
                    return
                
                # Join through material/img.inf to get PNG filename
                img_inf_path = KA / "material" / "img.inf"
                if not img_inf_path.exists():
                    self._send_error_json(404, f"material/img.inf not found")
                    return
                
                img_inf = parse_img_inf(img_inf_path)
                image_id = egg.get("image_id")
                if image_id is None or image_id not in img_inf:
                    self._send_error_json(404, f"egg {egg_id} image_id {image_id} not in img.inf")
                    return
                
                egg_filename = img_inf[image_id]
                egg_png = KA / "material" / egg_filename
                egg_opt = KA / "material" / egg_filename.replace('.png', '.opt')
                
                if not egg_png.exists():
                    self._send_error_json(404, f"egg PNG not found: {egg_filename}")
                    return
                
                # Extract UNHATCHED version using .opt coordinates
                if egg_opt.exists():
                    opt_data = parse_opt(egg_opt)
                    png = Image.open(egg_png).convert("RGBA")
                    
                    # Get unhatched sprite (u=0, v=0) - this crops just the egg portion (28×33)
                    sprite = next((s for s in opt_data['sprites'] if s['u'] == 0 and s['v'] == 0 and s['status'] == 'filled'), None)
                    
                    if sprite:
                        icon = png.crop((sprite['src_x'], sprite['src_y'], 
                                       sprite['src_x'] + sprite['w'], 
                                       sprite['src_y'] + sprite['h']))
                        method = "egg_unhatched_opt"
                        dimensions = f"{sprite['w']}x{sprite['h']}"
                    else:
                        # Fallback: crop top portion manually
                        icon = png.crop((0, 0, 28, 33))
                        method = "egg_unhatched_manual"
                        dimensions = "28x33"
                else:
                    # No .opt file: crop top portion manually (unhatched = top 28×33)
                    icon = Image.open(egg_png).convert("RGBA").crop((0, 0, 28, 33))
                    method = "egg_unhatched_manual"
                    dimensions = "28x33"
                
                # Scale if requested
                if scale > 1:
                    icon = icon.resize((icon.width * scale, icon.height * scale), Image.Resampling.NEAREST)
                
                buf = _io.BytesIO()
                icon.save(buf, format="PNG")
                
                # Add headers for UI display
                extra_headers = {
                    "X-Icon-Method": method,
                    "X-Icon-Status": "filled",
                    "X-Icon-Sheet": f"material/{egg_filename}",
                    "X-Icon-Image-Id": str(image_id),
                    "X-Icon-Dimensions": dimensions,
                    "X-Egg-State": "unhatched"
                }
                self._send(200, "image/png", buf.getvalue(), extra_headers)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"egg-icon: {exc}\n{traceback.format_exc()}")

        # /api/attribute-icon?id=N[&scale=S] — extract field attribute icon (1-7)
        # field_attribute_icon.png is 112×28 with two rows (top=transparent, bottom=colored)
        # Crop only top 16×14 portion (transparent version)
        # 1=Ground, 2=Grass, 3=Sand, 4=Rock, 5=Volcano, 6=Snow, 7=Swamp
        elif route == "attribute-icon":
            try:
                from PIL import Image
                import io as _io
                KA = config.KA_ASSETS_DIR
                attr_id = int(query.get("id", ["1"])[0])
                scale = min(int(query.get("scale", ["4"])[0]), 8)
                
                if attr_id < 1 or attr_id > 7:
                    self._send_error_json(404, f"attribute {attr_id} out of range (1-7)")
                    return
                
                attr_png = KA / "com" / "field_attribute_icon.png"
                if not attr_png.exists():
                    self._send_error_json(404, f"field_attribute_icon.png not found")
                    return
                
                source_img = Image.open(attr_png).convert("RGBA")
                
                # Crop only top transparent portion
                ATTRIBUTE_ICON_W = 16
                ATTRIBUTE_ICON_H = 14  # Top half only
                src_x = (attr_id - 1) * ATTRIBUTE_ICON_W
                src_y = 0
                
                if src_x + ATTRIBUTE_ICON_W > source_img.width:
                    self._send_error_json(500, f"attribute {attr_id} crop out of bounds")
                    return
                
                # Crop only top 14px (transparent version)
                icon = source_img.crop((src_x, src_y, src_x + ATTRIBUTE_ICON_W, src_y + ATTRIBUTE_ICON_H))
                
                if scale > 1:
                    icon = icon.resize((icon.width * scale, icon.height * scale), Image.Resampling.NEAREST)
                
                buf = _io.BytesIO()
                icon.save(buf, format="PNG")
                
                attr_names = ["", "Ground", "Grass", "Sand", "Rock", "Volcano", "Snow", "Swamp"]
                extra_headers = {
                    "X-Icon-Method": "attribute_transparent_only",
                    "X-Icon-Status": "filled",
                    "X-Icon-Sheet": "com/field_attribute_icon.png",
                    "X-Icon-Attribute": attr_names[attr_id],
                    "X-Icon-Source-Rect": f"{src_x},{src_y},{ATTRIBUTE_ICON_W},{ATTRIBUTE_ICON_H}"
                }
                self._send(200, "image/png", buf.getvalue(), extra_headers)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"attribute-icon: {exc}\n{traceback.format_exc()}")

        # /api/equip-icon?id=N[&scale=S] — extract equipment icon using CSV iconU/iconV and type-based sheet routing
        elif route == "equip-icon":
            try:
                from parsers.csv_parser import load_equip
                from PIL import Image
                import io as _io
                KA = config.KA_ASSETS_DIR
                equip_id = int(query.get("id", ["0"])[0])
                scale = min(int(query.get("scale", ["4"])[0]), 8)
                
                equips = load_equip(config.CSV_EQUIP)
                equip = next((e for e in equips if e["id"] == equip_id), None)
                if not equip:
                    self._send_error_json(404, f"equip {equip_id} not found in CSV")
                    return
                
                icon_u = equip.get("iconU")
                icon_v = equip.get("iconV")
                equip_type = equip.get("type")
                if icon_u is None or icon_v is None or icon_u < 0 or icon_v < 0:
                    self._send_error_json(404, f"equip {equip_id} has no valid icon coordinates")
                    return
                
                # Route to correct icon sheet by type
                # types 1-10: icon_weapon, 11: icon_sheild, 12: icon_body, 13: icon_head, 14: icon_accessory
                if equip_type in range(1, 11):
                    sheet_name = "icon_weapon"
                elif equip_type == 11:
                    sheet_name = "icon_sheild"
                elif equip_type == 12:
                    sheet_name = "icon_body"
                elif equip_type == 13:
                    sheet_name = "icon_head"
                elif equip_type == 14:
                    sheet_name = "icon_accessory"
                else:
                    self._send_error_json(404, f"equip type {equip_type} has no known icon sheet")
                    return
                
                # Extract using packed .opt if available
                sheet_path = KA / "com" / f"{sheet_name}.png"
                opt_path = KA / "com" / f"{sheet_name}.opt"
                icon, status_info = _extract_packed_icon_with_status(sheet_path, opt_path, icon_u, icon_v)
                
                if icon is None:
                    self._send_error_json(404, f"{sheet_name}.png not found")
                    return
                
                if scale > 1:
                    icon = icon.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
                
                buf = _io.BytesIO()
                icon.save(buf, format="PNG")
                
                # Add status headers for UI display
                extra_headers = {
                    "X-Icon-Method": status_info.get("method", "unknown"),
                    "X-Icon-Status": status_info.get("status", "unknown"),
                    "X-Icon-Opt-Exists": str(status_info.get("opt_exists", False)),
                    "X-Icon-Sheet": sheet_name
                }
                self._send(200, "image/png", buf.getvalue(), extra_headers)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"equip-icon: {exc}\n{traceback.format_exc()}")

        # /api/facility-icon?id=N[&scale=S] — extract facility/mapchip icon using MapChip iconU/iconV
        elif route == "facility-icon":
            try:
                from parsers.csv_parser import load_mapchips
                from PIL import Image
                import io as _io
                KA = config.KA_ASSETS_DIR
                chip_id = int(query.get("id", ["0"])[0])
                scale = min(int(query.get("scale", ["4"])[0]), 8)
                
                mapchips = load_mapchips(config.CSV_MAPCHIP)
                chip = next((c for c in mapchips if c["id"] == chip_id), None)
                if not chip:
                    self._send_error_json(404, f"mapchip {chip_id} not found in CSV")
                    return
                
                icon_u = chip.get("iconU")
                icon_v = chip.get("iconV")
                if icon_u is None or icon_v is None or icon_u < 0 or icon_v < 0:
                    self._send_error_json(404, f"mapchip {chip_id} has no valid icon coordinates")
                    return
                
                # Extract using packed .opt if available
                sheet_path = KA / "com" / "icon_item.png"
                opt_path = KA / "com" / "icon_item.opt"
                icon, status_info = _extract_packed_icon_with_status(sheet_path, opt_path, icon_u, icon_v)
                
                if icon is None:
                    self._send_error_json(404, f"icon_item.png not found")
                    return
                
                if scale > 1:
                    icon = icon.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
                
                buf = _io.BytesIO()
                icon.save(buf, format="PNG")
                
                # Add status headers for UI display
                extra_headers = {
                    "X-Icon-Method": status_info.get("method", "unknown"),
                    "X-Icon-Status": status_info.get("status", "unknown"),
                    "X-Icon-Opt-Exists": str(status_info.get("opt_exists", False))
                }
                self._send(200, "image/png", buf.getvalue(), extra_headers)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"facility-icon: {exc}\n{traceback.format_exc()}")

        # /api/icon-entities — list all entities (items, equipment, facilities) with icon coordinates
        elif route == "icon-entities":
            try:
                from parsers.csv_parser import load_items, load_equip, load_mapchips, load_facilities
                
                entities = {
                    "items": [],
                    "equipment": [],
                    "facilities": [],
                }
                
                # Items
                items = load_items(config.CSV_ITEM)
                for item in items:
                    if item.get("iconU") is not None and item.get("iconV") is not None:
                        if item["iconU"] >= 0 and item["iconV"] >= 0:
                            entities["items"].append({
                                "id": item["id"],
                                "name": item.get("name", ""),
                                "category": item.get("category"),
                                "iconU": item["iconU"],
                                "iconV": item["iconV"],
                            })
                
                # Equipment
                equips = load_equip(config.CSV_EQUIP)
                for equip in equips:
                    if equip.get("iconU") is not None and equip.get("iconV") is not None:
                        if equip["iconU"] >= 0 and equip["iconV"] >= 0:
                            equip_type = equip.get("type")
                            # Determine sheet name
                            if equip_type in range(1, 11):
                                sheet = "icon_weapon"
                            elif equip_type == 11:
                                sheet = "icon_sheild"
                            elif equip_type == 12:
                                sheet = "icon_body"
                            elif equip_type == 13:
                                sheet = "icon_head"
                            elif equip_type == 14:
                                sheet = "icon_accessory"
                            else:
                                sheet = "unknown"
                            
                            entities["equipment"].append({
                                "id": equip["id"],
                                "name": equip.get("name", ""),
                                "category": equip.get("category"),
                                "type": equip_type,
                                "iconU": equip["iconU"],
                                "iconV": equip["iconV"],
                                "sheet": sheet,
                            })
                
                # Facilities/MapChips
                mapchips = load_mapchips(config.CSV_MAPCHIP)
                facilities = load_facilities(config.CSV_FACILITY)
                fac_by_id = {f["id"]: f for f in facilities}
                
                for chip in mapchips:
                    if chip.get("iconU") is not None and chip.get("iconV") is not None:
                        if chip["iconU"] >= 0 and chip["iconV"] >= 0:
                            # Include chips with facility relations or res=23 (building)
                            if chip.get("relatedDataType") == 1 or chip.get("res") == 23:
                                fac_id = chip.get("relatedDataId")
                                fac = fac_by_id.get(fac_id) if fac_id else None
                                fac_name = fac.get("name") if fac else None
                                
                                entities["facilities"].append({
                                    "chipId": chip["id"],
                                    "chipName": chip.get("name", ""),
                                    "facilityId": fac_id,
                                    "facilityName": fac_name,
                                    "res": chip.get("res"),
                                    "iconU": chip["iconU"],
                                    "iconV": chip["iconV"],
                                })
                
                self._send_json(entities)
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"icon-entities: {exc}\n{traceback.format_exc()}")

        # /api/batch-export-jobs?output_dir=path&scale=N — batch export all job/gender/state BASE characters (no weapons/shields)
        elif route == "batch-export-jobs":
            try:
                import re as _re
                from parsers.csv_parser import load_jobs
                from parsers.inf_parser import parse_img_inf
                from PIL import Image
                import io as _io
                import urllib.request
                
                output_dir_str = query.get("output_dir", [None])[0]
                if not output_dir_str:
                    self._send_error_json(400, "Missing output_dir parameter")
                    return
                    
                # Parse and validate export scale (default 8x to match inspector preview)
                scale_str = query.get("scale", ["8"])[0]
                try:
                    scale = int(scale_str)
                    scale = max(1, min(16, scale))  # Clamp 1..16
                except ValueError:
                    scale = 8
                    
                output_dir = Path(output_dir_str).resolve()
                output_dir.mkdir(parents=True, exist_ok=True)
                
                jobs = load_jobs(config.CSV_JOB)
                results = []
                states = ["right", "up"]
                variants = [1, 2]  # 1=male, 2=female (variant 0 is shared special, not exported)
                gender_names = {1: "male", 2: "female"}
                
                # Use internal requests to job-preview endpoint with weapon/shield=-1
                for job in jobs:
                    job_id = job.get("id")
                    if job_id is None:
                        continue
                    
                    for variant in variants:
                        for state in states:
                            try:
                                # Call job-preview internally with equipment disabled
                                url = f"http://localhost:8765/api/job-preview?jobId={job_id}&variant={variant}&equipState={state}&weaponId=-1&shieldId=-1&scale={scale}"
                                req = urllib.request.Request(url)
                                with urllib.request.urlopen(req, timeout=5) as response:
                                    img_data = response.read()
                                    
                                # Save PNG with scale suffix if not 1x
                                scale_suffix = f"_{scale}x" if scale > 1 else ""
                                filename = f"job_{job_id:03d}_{gender_names[variant]}_{state}{scale_suffix}.png"
                                output_path = output_dir / filename
                                output_path.write_bytes(img_data)
                                results.append({"job_id": job_id, "gender": gender_names[variant], 
                                              "state": state, "file": filename})
                            except Exception as e:
                                results.append({"job_id": job_id, "gender": gender_names[variant], 
                                              "state": state, "error": str(e)})
                
                self._send(200, "application/json", 
                          json.dumps({"success": True, "exported": len([r for r in results if "error" not in r]),
                                    "failed": len([r for r in results if "error" in r]),
                                    "output_dir": str(output_dir)}).encode())
            except Exception as exc:
                import traceback
                self._send_error_json(500, f"batch-export-jobs: {exc}\n{traceback.format_exc()}")

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


class _ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Handle each request in its own thread so concurrent fetches don't block."""
    daemon_threads = True


def serve(port: int = 8765) -> None:
    addr = ("127.0.0.1", port)
    url = f"http://localhost:{port}/"
    print(f"\n[inspector] Serving at {url}")
    print(f"[inspector] Press Ctrl+C to stop\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    with _ThreadedHTTPServer(addr, InspectorHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[inspector] stopped")
