"""
Quick visual test of the character fix:
1. Check that face y_offset=0 gives correct rendering
2. Check that weapon renders in the 60x84 canvas
3. Render a few test characters and save PNGs
"""
from pathlib import Path
import struct, sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import config

from parsers.csv_parser import load_jobs, load_equip
from parsers.inf_parser import parse_img_inf
from PIL import Image
import io

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

def render_job(job_id, variant=1, scale=8):
    jobs = load_jobs(config.CSV_JOB)
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        print(f"Job {job_id} not found")
        return None

    RES = {14:"face", 2:"body", 0:"hand", 4:"hand", 18:"hand", 1:"shoes", 5:"shoes",
           15:"foot", 19:"foot", 12:"body", 16:"hand"}

    def resolve(res, imgs, var):
        d = RES.get(res)
        if not d: return None, None
        idx = imgs[var] if var < len(imgs) else None
        if idx is None or idx < 0: return d, None
        inf = parse_img_inf(KA / d / "img.inf")
        return d, inf.get(idx)

    # Body canvas (24x30)
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

    # Face (y_offset=0)
    face_dir, face_file = resolve(job["resHead"], job["imgHeads"], variant)
    if face_file and face_dir:
        stem = Path(face_file).stem
        blit(canvas, KA/face_dir/face_file, KA/face_dir/(stem+".opt"), v_state=1, y_offset=0)

    # Mouth, Eye (y_offset=0)
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

    # Weapon/shield resolution
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

    # Combined 60x84 canvas
    COMBINED_W, COMBINED_H = 60, 84
    BODY_X, BODY_Y = 24, 0
    WEAPON_X, WEAPON_Y = -8, 29
    SHIELD_X, SHIELD_Y = 7, 30

    combined = Image.new("RGBA", (COMBINED_W, COMBINED_H), (0, 0, 0, 0))
    combined.paste(canvas, (BODY_X, BODY_Y), canvas)

    w_png, w_opt = resolve_weapon(job["weapon"])
    has_weapon = False
    if w_png and w_opt:
        w_canvas = Image.new("RGBA", (60, 60), (0, 0, 0, 0))
        blit(w_canvas, w_png, w_opt)
        combined.paste(w_canvas, (WEAPON_X, WEAPON_Y), w_canvas)
        has_weapon = True
        w_bbox = w_canvas.getbbox()
        print(f"  Weapon: {w_png.name}, bbox={w_bbox}")

    s_png, s_opt = resolve_weapon(job["shield"])
    has_shield = False
    if s_png and s_opt:
        s_canvas = Image.new("RGBA", (24, 30), (0, 0, 0, 0))
        blit(s_canvas, s_png, s_opt)
        combined.paste(s_canvas, (SHIELD_X, SHIELD_Y), s_canvas)
        has_shield = True
        s_bbox = s_canvas.getbbox()
        print(f"  Shield: {s_png.name}, bbox={s_bbox}")

    # Scale
    result = combined.resize((COMBINED_W * scale, COMBINED_H * scale), Image.NEAREST)
    return result, job["name"], has_weapon, has_shield

# Test several jobs
jobs = load_jobs(config.CSV_JOB)
print(f"Loaded {len(jobs)} jobs")
print("\nTesting character rendering (y_offset=0 face, 60x84 composite):")
print("=" * 60)

# Pick jobs with weapons
test_jobs = []
equip_list = load_equip(config.CSV_EQUIP)
equip_map = {e["id"]: e for e in equip_list}

for j in jobs[:30]:
    has_weapon = j["weapon"] is not None and j["weapon"] >= 0
    has_shield = j["shield"] is not None and j["shield"] >= 0
    if has_weapon:
        test_jobs.append(j["id"])
        if len(test_jobs) >= 5:
            break

if not test_jobs:
    test_jobs = [jobs[0]["id"], jobs[1]["id"]]

for job_id in test_jobs[:5]:
    result = render_job(job_id)
    if result:
        img, name, hw, hs = result
        fname = f"tmp_char_{job_id}_{name.replace(' ','_')}.png"
        img.save(fname)
        print(f"  Job {job_id} ({name}): weapon={hw} shield={hs} → saved {fname}")
    else:
        print(f"  Job {job_id}: render failed")
