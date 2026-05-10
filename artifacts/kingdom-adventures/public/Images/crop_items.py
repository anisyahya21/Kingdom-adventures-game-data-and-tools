"""
Crop game inventory screenshots into individual item tile images.
Item names are read via Windows OCR, then matched against the equipment CSV
for clean canonical names (e.g. "A- Kairo Sword").

Usage:
  python crop_items.py              # crop all images, OCR + CSV match
  python crop_items.py --preview    # contact sheets only (no item files)
  python crop_items.py --image IMG_0660.png  # single image

Outputs go to: Images/cropped/<ItemName>.png
Contact sheets:  Images/cropped/preview_<filename>.png
"""

import asyncio
import csv
import statistics
import os
import re
import sys
from difflib import get_close_matches
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import winocr

# ── Name databases ────────────────────────────────────────────────────────────
_ROOT      = Path(__file__).parents[4]  # workspace root (KA-Website)
_EQUIP_CSV = _ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Equip.csv"
_ITEM_CSV  = _ROOT / "data" / "Sheet csv" / "KA GameData - Item.csv"


def _load_all_names() -> dict[str, str]:
    """Return lowercased-bare-name => display-name for all equipment + items."""
    mapping: dict[str, str] = {}

    # Equipment (ranked: "A/ Kairo Sword" => display "A- Kairo Sword")
    try:
        with open(_EQUIP_CSV, encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            ni = header.index("name")
            for row in reader:
                name = row[ni].strip() if ni < len(row) else ""
                if re.match(r"^[A-Z]/\s", name):
                    display = name.replace("/", "-")
                    bare = re.sub(r"^[A-Z]-\s*", "", display).strip().lower()
                    mapping[bare] = display
    except FileNotFoundError:
        print(f"  WARNING: Equipment CSV not found at {_EQUIP_CSV}")

    # Items (consumables, orbs, pouches, etc.)
    try:
        with open(_ITEM_CSV, encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)           # blank first row
            real_header = next(reader)
            ni = real_header.index("name")
            for row in reader:
                name = row[ni].strip() if ni < len(row) else ""
                name = re.sub(r"<[^>]+>", "", name).strip()  # strip <pic=...> tags
                if name:
                    mapping[name.lower()] = name
    except FileNotFoundError:
        print(f"  WARNING: Item CSV not found at {_ITEM_CSV}")

    return mapping


_NAME_LOOKUP: dict[str, str] = _load_all_names()


def _clean_ocr_bare(text: str) -> str:
    """Strip common OCR noise to get the bare item name."""
    s = re.sub(r"^[A-Z][-/]\s*", "", text).strip()         # strip rank prefix (OCR often misreads)
    s = re.sub(r"\s*[*x]\s*\d+\s*$", "", s).strip()        # strip quantity like * 158 or x35
    s = re.sub(r"\s+(?:Lv\w*|LV\w*|vl|vi)\s*$", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s*'\w+\s*$", "", s).strip()               # trailing 'G etc.
    s = re.sub(r"\s+[A-Za-z]$", "", s).strip()              # trailing single char
    s = re.sub(r"^[^A-Za-z]+", "", s).strip()               # leading junk ) > etc.
    return s


def match_to_name(ocr_text: str) -> str | None:
    """Strip OCR noise, fuzzy-match against equipment + item CSVs."""
    bare = _clean_ocr_bare(ocr_text)
    key = bare.lower()

    if key in _NAME_LOOKUP:
        return _NAME_LOOKUP[key]

    hits = get_close_matches(key, _NAME_LOOKUP.keys(), n=1, cutoff=0.55)
    if hits:
        return _NAME_LOOKUP[hits[0]]

    return None

# ── Grid detection / crop tuning ──────────────────────────────────────────────
DEFAULT_GRID = dict(
    x_start=38,
    y_start=555,
    cell_w=395,
    cell_h=420,
    gap_x=7,
    gap_y=17,
    cols=4,
)

# Fallback inner crop if contrast-based calibration cannot lock the border.
FALLBACK_INNER_CROP = dict(left=0, top=30, right=44, bottom=54)

# Color-agnostic edge detection.
EDGE_DIFF_THRESHOLD = 18

OCR_SCALE = 3

# ── OCR ───────────────────────────────────────────────────────────────────────

def ocr_item_name(cell: Image.Image) -> str | None:
    big = cell.resize((cell.width * OCR_SCALE, cell.height * OCR_SCALE), Image.NEAREST)

    async def _run():
        result = await winocr.recognize_pil(big, "en")
        return result.text

    raw = asyncio.run(_run()).strip()
    if os.environ.get("DEBUG_OCR"):
        print(f"      raw OCR: {repr(raw)}")

    first_line = raw.split("\n")[0].strip()

    # Try CSV match first (equipment + items)
    matched = match_to_name(first_line)
    if matched:
        return matched

    # Fallback: parse + title-case
    first_line = re.sub(r"\s+(?:Lv\w*|LV\w*|x\d+|vl|vi)\s*$", "", first_line, flags=re.IGNORECASE).strip()
    first_line = re.sub(r"\s*'\w+\s*$", "", first_line).strip()
    first_line = re.sub(r"\s+[A-Za-z]$", "", first_line).strip()
    m = re.match(r"^([A-Z])[/\-]\s*(.+)$", first_line)
    name = f"{m.group(1)}- {m.group(2).strip()}" if m else first_line
    if re.match(r"^[A-Z]-\s", name):
        name = name[:3] + re.sub(r"'[A-Z]", lambda x: x.group().lower(), name[3:].title())
    else:
        name = re.sub(r"'[A-Z]", lambda x: x.group().lower(), name.title())
    return name.replace("/", "-") if name and name.lower() not in ("back", "?") else None

# ── Grid helpers ──────────────────────────────────────────────────────────────

def _is_panel_pixel(r: int, g: int, b: int) -> bool:
    """Heuristic for the brown inventory-panel background color."""
    if not (45 <= r <= 200 and 30 <= g <= 165 and 15 <= b <= 140):
        return False
    if r < g or g < b - 6:
        return False
    return (r - b) >= 16


def _runs(mask: list[bool], min_len: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    s = None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= min_len:
                out.append((s, i - 1))
            s = None
    if s is not None and len(mask) - s >= min_len:
        out.append((s, len(mask) - 1))
    return out


def _pick_four_segments(segs: list[tuple[int, int]]) -> list[tuple[int, int]] | None:
    if len(segs) < 4:
        return None
    best = None
    best_score = -10**9
    for i in range(len(segs) - 3):
        cand = segs[i:i + 4]
        widths = [e - s + 1 for s, e in cand]
        gaps = [cand[j + 1][0] - cand[j][1] - 1 for j in range(3)]
        if min(widths) < 280 or max(widths) > 470:
            continue
        if min(gaps) < 2 or max(gaps) > 24:
            continue
        score = sum(widths) - (max(widths) - min(widths)) * 10 - (max(gaps) - min(gaps)) * 8
        if score > best_score:
            best_score = score
            best = cand
    return best


def detect_grid(img: Image.Image) -> tuple[dict[str, int | list[tuple[int, int]]], int]:
    """Auto-detect inventory grid geometry from panel-colored regions."""
    px = img.load()
    w, h = img.size
    cols = 4

    # 1) Find the horizontal 4-column panel bands.
    best_cols = None
    best_cols_score = -10**9
    y_min = max(200, DEFAULT_GRID["y_start"] - 180)
    y_max = min(h - 200, DEFAULT_GRID["y_start"] + DEFAULT_GRID["cell_h"] + 220)
    for y in range(y_min, y_max, 2):
        mask = []
        for x in range(0, w):
            r, g, b = px[x, y][:3]
            mask.append(_is_panel_pixel(r, g, b))
        segs = _runs(mask, min_len=180)
        pick = _pick_four_segments(segs)
        if not pick:
            continue
        if pick[0][0] > 120:
            continue
        widths = [e - s + 1 for s, e in pick]
        score = sum(widths) - (max(widths) - min(widths)) * 10 - abs(y - (DEFAULT_GRID["y_start"] + 120))
        if score > best_cols_score:
            best_cols_score = score
            best_cols = pick

    if not best_cols:
        return DEFAULT_GRID.copy(), detect_rows(img, DEFAULT_GRID)

    x_start = best_cols[0][0]
    col_widths = [e - s + 1 for s, e in best_cols]
    cell_w = int(round(statistics.median(col_widths)))
    gap_x = int(round(statistics.median(best_cols[i + 1][0] - best_cols[i][1] - 1 for i in range(cols - 1))))
    if not (0 <= x_start <= 120 and 280 <= cell_w <= 470 and 2 <= gap_x <= 24):
        return DEFAULT_GRID.copy(), detect_rows(img, DEFAULT_GRID)
    if abs(x_start - DEFAULT_GRID["x_start"]) > 20 or abs(cell_w - DEFAULT_GRID["cell_w"]) > 24:
        return DEFAULT_GRID.copy(), detect_rows(img, DEFAULT_GRID)

    # 2) Find row bands at a mostly-empty x inside col 0.
    x_probe = min(max(x_start + 12, 0), w - 1)
    vmask = []
    for y in range(0, h):
        r, g, b = px[x_probe, y][:3]
        vmask.append(_is_panel_pixel(r, g, b))
    vsegs = _runs(vmask, min_len=160)
    vsegs = [
        s for s in vsegs
        if 260 <= s[0] <= (h - 300) and 280 <= (s[1] - s[0] + 1) <= 520
    ]

    if not vsegs:
        g = DEFAULT_GRID.copy()
        g.update(dict(x_start=x_start, cell_w=cell_w, gap_x=gap_x, cols=cols))
        return g, detect_rows(img, g)

    # Keep contiguous item rows (small inter-row gaps).
    chain = [vsegs[0]]
    for s, e in vsegs[1:]:
        prev_s, prev_e = chain[-1]
        gap = s - prev_e - 1
        if 4 <= gap <= 44:
            chain.append((s, e))
            if len(chain) == 8:
                break
        elif len(chain) >= 2:
            break
        else:
            chain = [(s, e)]

    row_runs = chain if chain else [vsegs[0]]
    y_start = row_runs[0][0]
    row_heights = [e - s + 1 for s, e in row_runs]
    cell_h = int(round(statistics.median(row_heights)))
    if len(row_runs) > 1:
        gap_y = int(round(statistics.median(row_runs[i + 1][0] - row_runs[i][1] - 1 for i in range(len(row_runs) - 1))))
    else:
        gap_y = DEFAULT_GRID["gap_y"]

    grid: dict[str, int | list[tuple[int, int]]] = dict(
        x_start=x_start,
        y_start=y_start,
        cell_w=cell_w,
        cell_h=cell_h,
        gap_x=gap_x,
        gap_y=gap_y,
        cols=cols,
        col_bounds=best_cols,
        row_bounds=row_runs,
    )
    if not (300 <= y_start <= 760 and 280 <= cell_h <= 520 and 2 <= gap_y <= 50):
        return DEFAULT_GRID.copy(), detect_rows(img, DEFAULT_GRID)
    if abs(y_start - DEFAULT_GRID["y_start"]) > 90 or abs(cell_h - DEFAULT_GRID["cell_h"]) > 60:
        return DEFAULT_GRID.copy(), detect_rows(img, DEFAULT_GRID)
    return grid, len(row_runs)


def cell_box(row: int, col: int, grid: dict[str, int | list[tuple[int, int]]]) -> tuple[int, int, int, int]:
    g = grid
    col_bounds = g.get("col_bounds")
    row_bounds = g.get("row_bounds")

    if isinstance(col_bounds, list) and col < len(col_bounds):
        x1, x2 = col_bounds[col]
    else:
        x1 = int(g["x_start"]) + col * (int(g["cell_w"]) + int(g["gap_x"]))
        x2 = x1 + int(g["cell_w"]) - 1

    if isinstance(row_bounds, list) and row < len(row_bounds):
        y1, y2 = row_bounds[row]
    else:
        y1 = int(g["y_start"]) + row * (int(g["cell_h"]) + int(g["gap_y"]))
        y2 = y1 + int(g["cell_h"]) - 1

    return (x1, y1, x2 + 1, y2 + 1)


def _luma(rgb: tuple[int, int, int]) -> int:
    return (rgb[0] + rgb[1] + rgb[2]) // 3


def _vertical_edge_score(cell: Image.Image, x: int) -> float:
    px = cell.load()
    w, h = cell.size
    if x < 1 or x >= w - 2:
        return -10**9

    y0 = max(8, h // 16)
    y1 = min(h - 8, h - h // 16)
    diffs: list[int] = []
    for y in range(y0, y1):
        left = px[x, y][:3]
        right = px[x + 1, y][:3]
        diffs.append(abs(_luma(right) - _luma(left)))

    if not diffs:
        return -10**9
    diffs_sorted = sorted(diffs)
    q75 = diffs_sorted[int(0.75 * (len(diffs_sorted) - 1))]
    med = statistics.median(diffs_sorted)
    high_ratio = sum(1 for d in diffs_sorted if d >= EDGE_DIFF_THRESHOLD) / len(diffs_sorted)
    # Strong vertical border edges tend to be consistently high across much of the column.
    return float(med + q75 + high_ratio * 40.0)


def _horizontal_edge_score(cell: Image.Image, y: int) -> float:
    px = cell.load()
    w, h = cell.size
    if y < 1 or y >= h - 2:
        return -10**9

    x0 = max(8, w // 16)
    x1 = min(w - 8, w - w // 16)
    diffs: list[int] = []
    for x in range(x0, x1):
        top = px[x, y][:3]
        bot = px[x, y + 1][:3]
        diffs.append(abs(_luma(bot) - _luma(top)))

    if not diffs:
        return -10**9
    diffs_sorted = sorted(diffs)
    q75 = diffs_sorted[int(0.75 * (len(diffs_sorted) - 1))]
    med = statistics.median(diffs_sorted)
    high_ratio = sum(1 for d in diffs_sorted if d >= EDGE_DIFF_THRESHOLD) / len(diffs_sorted)
    return float(med + q75 + high_ratio * 40.0)


def _best_vertical_transition(cell: Image.Image, x0: int, x1: int) -> tuple[int, float]:
    w, _ = cell.size
    best_x, best_score = -1, -10**9
    for x in range(max(1, x0), min(w - 2, x1)):
        score = _vertical_edge_score(cell, x)
        if score > best_score:
            best_x, best_score = x, score
    return best_x, best_score


def _best_horizontal_transition(cell: Image.Image, y0: int, y1: int) -> tuple[int, float]:
    _, h = cell.size
    best_y, best_score = -1, -10**9
    for y in range(max(1, y0), min(h - 2, y1)):
        score = _horizontal_edge_score(cell, y)
        if score > best_score:
            best_y, best_score = y, score
    return best_y, best_score


def detect_inner_crop_for_cell(cell: Image.Image) -> dict[str, int] | None:
    """Find inner square bounds via strongest consistent edge transitions."""
    w, h = cell.size
    lx, ls = _best_vertical_transition(cell, 0, max(2, w // 7))
    rx, rs = _best_vertical_transition(cell, max(1, (w * 5) // 6), w - 1)
    ty, ts = _best_horizontal_transition(cell, 0, max(2, h // 5))
    by, bs = _best_horizontal_transition(cell, max(1, (h * 3) // 4), h - 1)

    # Require meaningful average contrast score to avoid weak edges.
    if min(ls, rs, ts, bs) < 20.0:
        return None

    left = max(0, lx + 1)
    right = max(0, w - (rx + 1))
    top = max(0, ty + 1)
    bottom = max(0, h - (by + 1))

    # Plausible inset bounds for this UI; reject text-driven false edges.
    if not (0 <= left <= w // 8 and 8 <= right <= w // 4 and 12 <= top <= h // 4 and 18 <= bottom <= h // 3):
        return None

    inner_w = w - left - right
    inner_h = h - top - bottom
    if inner_w < int(w * 0.55) or inner_h < int(h * 0.55):
        return None

    return dict(left=left, top=top, right=right, bottom=bottom)


def calibrate_inner_crop(
    img: Image.Image,
    grid: dict[str, int | list[tuple[int, int]]],
    rows: int,
) -> dict[str, int]:
    """Calibrate one reusable inner crop from several sample cells."""
    samples: list[dict[str, int]] = []
    max_rows = min(rows, 3)
    max_cols = min(int(grid["cols"]), 4)
    for r in range(max_rows):
        for c in range(max_cols):
            cell = img.crop(cell_box(r, c, grid))
            inset = detect_inner_crop_for_cell(cell)
            if inset:
                samples.append(inset)

    if len(samples) < 3:
        return FALLBACK_INNER_CROP.copy()

    # Robustly discard outliers before taking medians.
    def _filtered(vals: list[int]) -> list[int]:
        m = statistics.median(vals)
        mad = statistics.median(abs(v - m) for v in vals)
        if mad == 0:
            return vals
        return [v for v in vals if abs(v - m) <= 2.5 * mad]

    left_vals = _filtered([s["left"] for s in samples])
    top_vals = _filtered([s["top"] for s in samples])
    right_vals = _filtered([s["right"] for s in samples])
    bottom_vals = _filtered([s["bottom"] for s in samples])

    out = {
        "left": int(round(statistics.median(left_vals))),
        "top": int(round(statistics.median(top_vals))),
        "right": int(round(statistics.median(right_vals))),
        "bottom": int(round(statistics.median(bottom_vals))),
    }

    # Clamp to stable UI-specific ranges (derived from border geometry).
    out["left"] = max(0, min(out["left"], 16))
    out["top"] = max(20, min(out["top"], 45))
    out["right"] = max(20, min(out["right"], 40))
    out["bottom"] = max(36, min(out["bottom"], 70))
    return out


def square_cell_crop(
    img: Image.Image,
    row: int,
    col: int,
    grid: dict[str, int | list[tuple[int, int]]],
    inner_crop: dict[str, int],
) -> Image.Image:
    def _auto_trim_outer_frame(tile: Image.Image) -> Image.Image:
        """Trim residual UI frame bars (bottom/right) using adaptive signal checks."""
        w, h = tile.size
        px = tile.load()

        # Bottom trim: remove contiguous dark-heavy rows from the bottom edge.
        trim_bottom = 0
        for y in range(h - 1, max(h // 2, 0), -1):
            dark = 0
            mid = 0
            redish_dark = 0
            for x in range(w):
                r, g, b = px[x, y][:3]
                lum = (r + g + b) // 3
                if lum < 78:
                    dark += 1
                if 78 <= lum <= 120:
                    mid += 1
                if lum < 92 and r >= g + 12 and r >= b + 12:
                    redish_dark += 1
            dark_ratio = dark / w
            mid_ratio = mid / w
            redish_dark_ratio = redish_dark / w
            # Frame bands are mostly dark with limited bright/high-contrast UI elements.
            if (dark_ratio >= 0.72 and mid_ratio <= 0.24) or redish_dark_ratio >= 0.62:
                trim_bottom += 1
            else:
                break

        # Right trim: remove contiguous dark reddish border columns from right edge.
        trim_right = 0
        for x in range(w - 1, max((w * 3) // 4, 0), -1):
            darkish = 0
            reddish = 0
            for y in range(h):
                r, g, b = px[x, y][:3]
                lum = (r + g + b) // 3
                if lum < 92:
                    darkish += 1
                if r >= g + 10 and r >= b + 10:
                    reddish += 1
            dark_ratio = darkish / h
            red_ratio = reddish / h
            if dark_ratio >= 0.56 and red_ratio >= 0.38:
                trim_right += 1
            else:
                break

        # Clamp so we don't over-trim if a tile has unusual colors/content.
        trim_bottom = min(trim_bottom, h // 5)
        trim_right = min(trim_right, w // 6)

        x2 = max(1, w - trim_right)
        y2 = max(1, h - trim_bottom)
        return tile.crop((0, 0, x2, y2))

    box = cell_box(row, col, grid)
    cell = img.crop(box)
    l = min(inner_crop["left"], max(0, cell.width // 4))
    t = min(inner_crop["top"], max(0, cell.height // 3))
    r = min(inner_crop["right"], max(0, cell.width // 3))
    b = min(inner_crop["bottom"], max(0, cell.height // 3))
    tight = cell.crop((l, t, max(l + 1, cell.width - r), max(t + 1, cell.height - b)))
    cell = _auto_trim_outer_frame(tight)
    return cell


def detect_rows(img: Image.Image, grid: dict[str, int | list[tuple[int, int]]]) -> int:
    g = grid
    for row in range(8):
        y = int(g["y_start"]) + row * (int(g["cell_h"]) + int(g["gap_y"])) + 10
        x = int(g["x_start"]) + 10
        if y >= img.height:
            return row
        r, gc, b = img.getpixel((x, y))[:3]
        if (r + gc + b) // 3 < 40:
            return row
    return 8


def make_contact_sheet(
    img: Image.Image,
    items: list[str | None],
    filename: str,
    grid: dict[str, int | list[tuple[int, int]]],
    inner_crop: dict[str, int],
) -> Image.Image:
    g = grid
    cols = int(g["cols"])
    pad, label_h, thumb_w = 8, 24, 160
    thumb_h = int(thumb_w * int(g["cell_h"]) / int(g["cell_w"]))
    slot_w, slot_h = thumb_w + pad * 2, thumb_h + label_h + pad * 2
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (slot_w * cols, slot_h * rows + 30), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
    draw.text((4, 4), filename, fill=(200, 200, 200), font=font)
    for idx, name in enumerate(items):
        r, c = divmod(idx, cols)
        crop = square_cell_crop(img, r, c, g, inner_crop).resize((thumb_w, thumb_h), Image.LANCZOS)
        sx, sy = c * slot_w + pad, r * slot_h + pad + 30
        sheet.paste(crop, (sx, sy))
        draw.text((sx, sy + thumb_h + 2), (name or f"[{idx}]")[:22], fill=(230, 230, 230), font=font)
        draw.rectangle([sx - 1, sy - 1, sx + thumb_w, sy + thumb_h], outline=(100, 100, 100))
    return sheet

# ── Main ──────────────────────────────────────────────────────────────────────

def safe_filename(name: str) -> str:
    """Strip characters that are invalid in Windows filenames."""
    return re.sub(r'[\\/:*?"<>|]', "", name).strip()


def process_image(src: Path, out_dir: Path, preview_only: bool = False):
    img = Image.open(src)
    w, h = img.size
    assert (w, h) == (1668, 2388), f"Unexpected size {w}x{h} for {src.name}"

    grid, detected_rows = detect_grid(img)
    rows = detected_rows if detected_rows > 0 else detect_rows(img, grid)
    inner_crop = calibrate_inner_crop(img, grid, rows)
    total = rows * int(grid["cols"])
    print(
        f"  {src.name}: {rows} rows ({total} cells) -- OCR + CSV match... "
        f"grid(x={grid['x_start']},y={grid['y_start']},w={grid['cell_w']},h={grid['cell_h']}) "
        f"inner(l={inner_crop['left']},t={inner_crop['top']},r={inner_crop['right']},b={inner_crop['bottom']})"
    )

    items: list[str | None] = []
    for idx in range(total):
        r, c = divmod(idx, int(grid["cols"]))
        cell = img.crop(cell_box(r, c, grid))
        name = ocr_item_name(cell)
        items.append(name)
        print(f"    [{idx:2d}] r{r}c{c}  {name or '?'}")

    sheet = make_contact_sheet(img, items, src.name, grid, inner_crop)
    sheet.save(out_dir / f"preview_{src.stem}.png")
    print(f"    -> contact sheet saved")

    if preview_only:
        return

    saved = skipped = errors = 0
    for idx, name in enumerate(items):
        if not name:
            errors += 1
            continue
        r, c = divmod(idx, int(grid["cols"]))
        crop = square_cell_crop(img, r, c, grid, inner_crop)
        out_path = out_dir / f"{safe_filename(name)}.png"
        if out_path.exists():
            skipped += 1
            continue
        crop.save(out_path)
        saved += 1
    print(f"    -> {saved} saved, {skipped} skipped, {errors} unmatched")


def main():
    args = sys.argv[1:]
    preview_only = "--preview" in args
    specific = next((a for a in args if not a.startswith("--")), None)

    folder = Path(__file__).parent
    out_dir = folder / "cropped"
    out_dir.mkdir(exist_ok=True)

    images = [folder / specific] if specific else sorted(folder.glob("IMG_*.png"))

    for src in images:
        if not src.exists():
            print(f"Not found: {src}")
            continue
        print(f"Processing {src.name}...")
        process_image(src, out_dir, preview_only=preview_only)

    print(f"\nDone. Output: {out_dir}")


if __name__ == "__main__":
    main()
