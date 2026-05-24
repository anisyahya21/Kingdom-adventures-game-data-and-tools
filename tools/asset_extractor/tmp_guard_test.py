from pathlib import Path
import sys
sys.path.insert(0, str(Path('.').resolve()))
import config
from parsers.csv_parser import load_jobs, load_equip
from parsers.inf_parser import parse_img_inf
from PIL import Image

KA = config.KA_ASSETS_DIR

def decode_opt(opt_path):
    data = Path(opt_path).read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    slots = {}
    for row in range(rows):
        for col in range(cols):
            off = 4 + (row * cols + col) * 15
            s = data[off:off + 15]
            if len(s) < 15 or s[0] == 0:
                continue
            slots[(row, col)] = {
                "dest_x": s[4], "dest_y": s[6],
                "src_x":  s[8], "src_y":  s[10],
                "w":      s[12], "h":      s[14],
            }
    return slots

def blit(canvas, src_path, opt_path, v_state=0, u_frame=0, y_offset=0):
    src_path, opt_path = Path(src_path), Path(opt_path)
    if not src_path.exists() or not opt_path.exists():
        return False
    try:
        src   = Image.open(src_path).convert("RGBA")
        slots = decode_opt(opt_path)
        slot  = slots.get((v_state, u_frame))
        if slot is None:
            return False
        region = src.crop((slot["src_x"], slot["src_y"],
                           slot["src_x"] + slot["w"],
                           slot["src_y"] + slot["h"]))
        canvas.paste(region, (slot["dest_x"], slot["dest_y"] + y_offset), region)
        return True
    except Exception as e:
        print(f"    blit error: {e}")
        return False

RES = {14:"face", 2:"body", 0:"hand", 4:"hand", 18:"hand", 1:"shoes", 5:"shoes",
       15:"foot", 19:"foot", 12:"body", 16:"hand"}

def resolve(res, imgs, var):
    d = RES.get(res)
    if not d: return None, None
    idx = imgs[var] if var < len(imgs) else None
    if idx is None or idx < 0: return d, None
    inf = parse_img_inf(KA / d / "img.inf")
    return d, inf.get(idx)

jobs = load_jobs(config.CSV_JOB)
equip_list = load_equip(config.CSV_EQUIP)
equip_map = {e["id"]: e for e in equip_list}
w_inf = parse_img_inf(KA / "weapon" / "img.inf")

def resolve_weapon(equip_id):
    if equip_id is None or equip_id < 0: return None, None
    eq = equip_map.get(equip_id)
    if not eq or eq["img"] is None or eq["img"] < 0: return None, None
    fname = w_inf.get(eq["img"])
    if not fname: return None, None
    png = KA / "weapon" / fname
    opt = KA / "weapon" / (Path(fname).stem + ".opt")
    return (png if png.exists() else None), (opt if opt.exists() else None)

for job_id in [65, 70, 10, 0]:
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        print(f"Job {job_id} not found"); continue
    variant = 1

    canvas = Image.new("RGBA", (24, 30), (0, 0, 0, 0))

    # Shadow
    blit(canvas, KA/"shadow"/"shadow.png", KA/"shadow"/"shadow.opt")

    # Body
    body_dir, body_file = resolve(job["resBody"], job["imgBodys"], variant)
    if body_file and body_dir:
        stem = Path(body_file).stem
        blit(canvas, KA/body_dir/body_file, KA/body_dir/(stem+".opt"))

    # Foot
    foot_dir, foot_file = resolve(job["resFoot"], job["imgFoots"], variant)
    if foot_file and foot_dir:
        stem = Path(foot_file).stem
        blit(canvas, KA/foot_dir/foot_file, KA/foot_dir/(stem+".opt"))

    # Face y_offset=0
    face_dir, face_file = resolve(job["resHead"], job["imgHeads"], variant)
    if face_file and face_dir:
        stem = Path(face_file).stem
        blit(canvas, KA/face_dir/face_file, KA/face_dir/(stem+".opt"), v_state=1, y_offset=0)

    blit(canvas, KA/"mouth"/"mouth_00.png", KA/"mouth"/"mouth_00.opt", v_state=1, y_offset=0)
    blit(canvas, KA/"eye"/"eye_00.png", KA/"eye"/"eye_00.opt", v_state=1, y_offset=0)

    # Hair
    hair_png = KA / "hair" / "hair_m_00.png"
    if hair_png.exists():
        hair_img = Image.open(hair_png).convert("RGBA")
        hair_row = hair_img.crop((0, 24, 24, 48))
        canvas.paste(hair_row, (0, 0), hair_row)

    # Hand
    hand_dir, hand_file = resolve(job["resHand"], job["imgHands"], variant)
    if hand_file and hand_dir:
        stem = Path(hand_file).stem
        blit(canvas, KA/hand_dir/hand_file, KA/hand_dir/(stem+".opt"), v_state=2)
        blit(canvas, KA/hand_dir/hand_file, KA/hand_dir/(stem+".opt"), v_state=0)

    # Weapon/Shield composite (GRIP-ALIGNED approach)
    w_png, w_opt = resolve_weapon(job["weapon"])
    s_png, s_opt = resolve_weapon(job["shield"])

    # Hand grip center in body canvas (right arm, front-facing)
    HAND_X, HAND_Y = 16, 18

    # Process weapon: render on 60x60, find grip at bottom-center of bbox
    w_offset = None
    w_canvas = None
    if w_png and w_opt:
        w_canvas = Image.new("RGBA", (60, 60), (0, 0, 0, 0))
        blit(w_canvas, w_png, w_opt)
        w_bbox = w_canvas.getbbox()
        if w_bbox:
            grip_wx = (w_bbox[0] + w_bbox[2]) // 2
            grip_wy = w_bbox[3]  # bottom = where character grips
            w_offset = (HAND_X - grip_wx, HAND_Y - grip_wy)
            print(f"  Job {job_id} ({job['name']}): weapon bbox={w_bbox}, grip=({grip_wx},{grip_wy}), offset={w_offset}")

    # Process shield: render on 24x30, find grip at bottom-center
    s_offset = None
    s_canvas_img = None
    if s_png and s_opt:
        s_canvas_img = Image.new("RGBA", (24, 30), (0, 0, 0, 0))
        blit(s_canvas_img, s_png, s_opt)
        s_bbox = s_canvas_img.getbbox()
        if s_bbox:
            # Shield: left arm, positioned at left side of character
            SHIELD_HAND_X, SHIELD_HAND_Y = 8, 18
            grip_sx = (s_bbox[0] + s_bbox[2]) // 2
            grip_sy = s_bbox[3]
            s_offset = (SHIELD_HAND_X - grip_sx, SHIELD_HAND_Y - grip_sy)
            print(f"  Job {job_id} ({job['name']}): shield bbox={s_bbox}, grip=({grip_sx},{grip_sy}), offset={s_offset}")

    # Compute combined canvas extents
    x1, y1, x2, y2 = 0, 0, 24, 30  # body extents
    if w_canvas and w_offset:
        x1 = min(x1, w_offset[0])
        y1 = min(y1, w_offset[1])
        x2 = max(x2, w_offset[0] + 60)
        y2 = max(y2, w_offset[1] + 60)
    if s_canvas_img and s_offset:
        x1 = min(x1, s_offset[0])
        y1 = min(y1, s_offset[1])
        x2 = max(x2, s_offset[0] + 24)
        y2 = max(y2, s_offset[1] + 30)

    COMBINED_W = x2 - x1
    COMBINED_H = y2 - y1
    body_in_combined = (-x1, -y1)

    combined = Image.new("RGBA", (COMBINED_W, COMBINED_H), (0, 0, 0, 0))

    # Weapon BEHIND body
    if w_canvas and w_offset:
        combined.paste(w_canvas, (w_offset[0] - x1, w_offset[1] - y1), w_canvas)
    # Shield BEHIND body
    if s_canvas_img and s_offset:
        combined.paste(s_canvas_img, (s_offset[0] - x1, s_offset[1] - y1), s_canvas_img)
    # Body ON TOP
    combined.paste(canvas, body_in_combined, canvas)

    scale = 8
    result = combined.resize((COMBINED_W * scale, COMBINED_H * scale), Image.NEAREST)
    name = job["name"].replace(" ", "_")
    fname = f"tmp_guard_{job_id}_{name}.png"
    result.save(fname)
    print(f"  → saved {fname} (combined={COMBINED_W}x{COMBINED_H})")
