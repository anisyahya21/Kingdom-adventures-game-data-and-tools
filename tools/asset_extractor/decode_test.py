"""Quick test: decode opt format and render face+body frames."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from config import KA_ASSETS_DIR
from PIL import Image


def decode_opt(path):
    """Return (cell_w, cell_h, cols, rows, slots).
    Each slot: dict with u,v,dest_x,dest_y,src_x,src_y,w,h  OR None if empty."""
    data = Path(path).read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    SLOT = 15
    slots = []
    for v in range(rows):
        for u in range(cols):
            off = 4 + (v * cols + u) * SLOT
            s = data[off:off + SLOT]
            if s[0] == 0:
                slots.append(None)
                continue
            # Format:
            # [0] flag, [1-2] ff ff, [3] 00, [4] dest_x, [5] 00, [6] dest_y
            # [7] 00, [8] src_x, [9] 00, [10] src_y
            # [11] 00, [12] draw_w, [13] 00, [14] draw_h
            slots.append({
                'u': u, 'v': v,
                'dest_x': s[4], 'dest_y': s[6],
                'src_x': s[8],  'src_y': s[10],
                'w': s[12],     'h': s[14],
            })
    return cw, ch, cols, rows, slots


def survey_category(category):
    """Print layer info for a category."""
    d = KA_ASSETS_DIR / category
    if not d.exists():
        print(f"{category}: MISSING")
        return
    pngs = list(d.glob('*.png'))
    opts = list(d.glob('*.opt'))
    print(f"{category}: {len(pngs)} PNGs, {len(opts)} OPTs")
    for o in opts[:1]:
        cw, ch, cols, rows, slots = decode_opt(o)
        src_png = d / (o.stem + '.png')
        src = Image.open(src_png).convert('RGBA') if src_png.exists() else None
        src_sz = src.size if src else '?'
        print(f"  {o.name}: cell={cw}x{ch} grid={cols}x{rows} src={src_sz}")
        active = [s for s in slots if s]
        for s in active[:6]:
            vv = s['v']; uu = s['u']
            print(f"    v={vv},u={uu}: dest=({s['dest_x']},{s['dest_y']}) src=({s['src_x']},{s['src_y']}) {s['w']}x{s['h']}")


def render_all_frames(src_path, opt_path, out_path, bg=(200, 200, 200, 255)):
    src = Image.open(src_path).convert('RGBA')
    cw, ch, cols, rows, slots = decode_opt(opt_path)
    print(f"{Path(src_path).parent.name}/{Path(src_path).name}: cell={cw}x{ch} grid={cols}x{rows}")
    for s in slots:
        if s:
            print(f"  u={s['u']},v={s['v']}: dest=({s['dest_x']},{s['dest_y']}) "
                  f"src=({s['src_x']},{s['src_y']}) size={s['w']}x{s['h']}")

    out = Image.new('RGBA', (cw * cols, ch * rows), bg)
    for s in slots:
        if not s:
            continue
        region = src.crop((s['src_x'], s['src_y'],
                            s['src_x'] + s['w'], s['src_y'] + s['h']))
        canvas = Image.new('RGBA', (cw, ch), bg)
        canvas.paste(region, (s['dest_x'], s['dest_y']))
        out.paste(canvas, (s['u'] * cw, s['v'] * ch))
    out.save(out_path)
    print(f"  → saved {out_path}")


# ---- Face ----
render_all_frames(
    KA_ASSETS_DIR / 'face' / 'm_face_00.png',
    KA_ASSETS_DIR / 'face' / 'm_face_00.opt',
    'test_face_frames.png',
)

# ---- Body ----
render_all_frames(
    KA_ASSETS_DIR / 'body' / 'm_body_00.png',
    KA_ASSETS_DIR / 'body' / 'm_body_00.opt',
    'test_body_frames.png',
)

# ---- Shoes ----
render_all_frames(
    KA_ASSETS_DIR / 'shoes' / 'm_shoes_01.png',
    KA_ASSETS_DIR / 'shoes' / 'm_shoes_01.opt',
    'test_shoes_frames.png',
)

# ---- Hand ----
render_all_frames(
    KA_ASSETS_DIR / 'hand' / 'm_hand_00.png',
    KA_ASSETS_DIR / 'hand' / 'm_hand_00.opt',
    'test_hand_frames.png',
)

# ---- Foot (from chara/) ----
foot_path = KA_ASSETS_DIR / 'chara' / 'z_tmp_img_m_foot_00.png'
if foot_path.exists():
    foot = Image.open(foot_path)
    print(f"\nfoot: {foot.size} mode={foot.mode}")
    foot.save('test_foot_raw.png')

# ---- Shadow ----
render_all_frames(
    KA_ASSETS_DIR / 'shadow' / 'shadow.png',
    KA_ASSETS_DIR / 'shadow' / 'shadow.opt',
    'test_shadow_frames.png',
)

for cat in ['eye', 'mouth', 'hair', 'hat', 'shadow', 'accessory']:
    survey_category(cat)

print("\nDone.")
