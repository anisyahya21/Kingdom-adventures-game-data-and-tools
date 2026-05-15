import csv
import json
import shutil
import struct
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent
KA_ASSETS = REPO / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
API_RULES_OUT = REPO / "artifacts" / "api-server" / "data" / "sprite-rules.json"
FRONTEND_PUBLIC = REPO / "artifacts" / "kingdom-adventures" / "public" / "character_sprites"
FRONTEND_RULES_OUT = FRONTEND_PUBLIC / "character-rules.json"
JOB_CSV = REPO / "data" / "Sheet csv" / "KA GameData - Job.csv"
EQUIP_CSV = REPO / "data" / "sheet-research" / "raw-copies" / "KA GameData - Equip.csv"

SPRITE_DIRS = ["face", "body", "hand", "shoes", "foot", "weapon", "shadow", "mouth", "eye", "hair"]
POSE_FILES = ["wait_right.seb", "equip_wait_right.seb", "equip_wait_up.seb"]


def png_dimensions(png_path: Path):
    try:
        with png_path.open("rb") as f:
            header = f.read(24)
        if len(header) >= 24 and header[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">I", header[16:20])[0], struct.unpack(">I", header[20:24])[0]
    except OSError:
        pass
    return None, None


def decode_opt(data: bytes, img_w=None, img_h=None):
    if len(data) < 4:
        return {}

    cell_w = data[0]
    cell_h = data[1]
    cols = data[2]
    rows = data[3]

    all_src_x = set()
    pos = 4
    done = False
    for _v in range(rows):
        if done:
            break
        for _u in range(cols):
            if pos >= len(data):
                done = True
                break
            flag = data[pos]
            if flag == 0:
                pos += 1
            elif flag == 1:
                if pos + 15 <= len(data):
                    all_src_x.add(int.from_bytes(data[pos + 8:pos + 10], "little"))
                    pos += 15
                elif pos + 12 <= len(data):
                    all_src_x.add(int.from_bytes(data[pos + 8:pos + 10], "little"))
                    done = True
                    break
                else:
                    done = True
                    break
            else:
                pos += 1

    sorted_src_x = sorted(all_src_x)

    def right_bound(src_x):
        for value in sorted_src_x:
            if value > src_x:
                return value
        return img_w if img_w else cell_w

    slots = {}
    pos = 4
    for v in range(rows):
        for u in range(cols):
            key = f"{v},{u}"
            if pos >= len(data):
                slots[key] = {"status": "implicit_empty"}
                continue
            flag = data[pos]
            if flag == 0:
                slots[key] = {"status": "empty"}
                pos += 1
            elif flag == 1:
                if pos + 15 <= len(data):
                    slots[key] = {
                        "status": "filled",
                        "destX": int.from_bytes(data[pos + 4:pos + 6], "little"),
                        "destY": int.from_bytes(data[pos + 6:pos + 8], "little"),
                        "srcX": int.from_bytes(data[pos + 8:pos + 10], "little"),
                        "srcY": int.from_bytes(data[pos + 10:pos + 12], "little"),
                        "w": int.from_bytes(data[pos + 12:pos + 14], "little"),
                        "h": data[pos + 14],
                        "cellW": cell_w,
                        "cellH": cell_h,
                    }
                    pos += 15
                elif pos + 12 <= len(data):
                    dest_x = int.from_bytes(data[pos + 4:pos + 6], "little")
                    dest_y = int.from_bytes(data[pos + 6:pos + 8], "little")
                    src_x = int.from_bytes(data[pos + 8:pos + 10], "little")
                    src_y = int.from_bytes(data[pos + 10:pos + 12], "little")
                    eff_w = img_w or cell_w
                    eff_h = img_h or cell_h
                    rb = right_bound(src_x)
                    slots[key] = {
                        "status": "short_recovered",
                        "destX": dest_x,
                        "destY": dest_y,
                        "srcX": src_x,
                        "srcY": src_y,
                        "w": max(0, min(rb - src_x, eff_w - src_x)),
                        "h": max(0, min(cell_h - dest_y, eff_h - src_y)),
                        "cellW": cell_w,
                        "cellH": cell_h,
                        "recovered": True,
                    }
                    pos = len(data)
                elif pos + 11 <= len(data):
                    dest_x = int.from_bytes(data[pos + 4:pos + 6], "little")
                    dest_y = int.from_bytes(data[pos + 6:pos + 8], "little")
                    src_x = int.from_bytes(data[pos + 8:pos + 10], "little")
                    src_y = data[pos + 10]
                    eff_w = img_w or cell_w
                    eff_h = img_h or cell_h
                    rb = right_bound(src_x)
                    slots[key] = {
                        "status": "short_recovered",
                        "destX": dest_x,
                        "destY": dest_y,
                        "srcX": src_x,
                        "srcY": src_y,
                        "w": max(0, min(rb - src_x, eff_w - src_x)),
                        "h": max(0, min(cell_h - dest_y, eff_h - src_y)),
                        "cellW": cell_w,
                        "cellH": cell_h,
                        "recovered": True,
                    }
                    pos = len(data)
                else:
                    slots[key] = {"status": "corrupt"}
                    pos = len(data)
            else:
                slots[key] = {"status": "unknown_flag"}
                pos += 1
    return slots


def parse_inf(inf_path: Path):
    result = {}
    if not inf_path.exists():
        return result
    for line in inf_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split("\t") if part.strip()]
        if len(parts) < 2:
            continue
        try:
            idx = int(parts[0])
        except ValueError:
            continue
        result[str(idx)] = parts[1].split(",")[0].strip()
    return result


def bake_directory(dir_name: str):
    src_dir = KA_ASSETS / dir_name
    if not src_dir.exists():
        return {"inf": {}, "opts": {}}

    inf_data = {inf_path.stem: parse_inf(inf_path) for inf_path in sorted(src_dir.glob("*.inf"))}
    opts_data = {}
    for opt_path in sorted(src_dir.glob("*.opt")):
        basename = opt_path.stem
        png_path = src_dir / f"{basename}.png"
        img_w, img_h = png_dimensions(png_path) if png_path.exists() else (None, None)
        data = opt_path.read_bytes()
        slots = decode_opt(data, img_w, img_h)
        non_empty = {k: v for k, v in slots.items() if v.get("status") not in ("empty", "implicit_empty")}
        sample = next((v for v in non_empty.values() if "cellW" in v), None)
        opts_data[basename] = {
            "cellW": sample["cellW"] if sample else (data[0] if len(data) >= 1 else 24),
            "cellH": sample["cellH"] if sample else (data[1] if len(data) >= 2 else 24),
            "slots": {
                k: {sk: sv for sk, sv in v.items() if sk not in ("cellW", "cellH")}
                for k, v in non_empty.items()
            },
        }
    return {"inf": inf_data, "opts": opts_data}


def s16(value: int):
    return value - 65536 if value > 32767 else value


def read_u16be(raw: bytes, off: int):
    return int.from_bytes(raw[off:off + 2], "big")


def parse_seb(seb_path: Path, frame_index: int):
    raw = seb_path.read_bytes()
    if len(raw) < 8:
        return []
    frame_count = read_u16be(raw, 4)
    marker2 = read_u16be(raw, 6)
    ops = []
    off = 4
    while off + 20 <= len(raw):
        if read_u16be(raw, off) == frame_count and read_u16be(raw, off + 2) == marker2:
            idx = min(frame_index, max(0, frame_count - 1))
            rec = off + idx * 20
            if rec + 20 <= len(raw):
                layer_type = read_u16be(raw, rec + 6)
                if layer_type != 65535 and layer_type <= 13:
                    w = s16(read_u16be(raw, rec + 12))
                    h = s16(read_u16be(raw, rec + 14))
                    if w > 0 and h > 0:
                        ops.append({
                            "type": layer_type,
                            "u": s16(read_u16be(raw, rec + 8)) // w,
                            "v": s16(read_u16be(raw, rec + 10)) // h,
                            "w": w,
                            "h": h,
                            "ox": s16(read_u16be(raw, rec + 16)),
                            "oy": s16(read_u16be(raw, rec + 18)),
                        })
            off += max(20, frame_count * 20)
        else:
            off += 2
    return ops


def bake_poses():
    poses = {}
    for name in POSE_FILES:
        seb_path = KA_ASSETS / "chara" / name
        poses[name] = [parse_seb(seb_path, frame) for frame in range(4)] if seb_path.exists() else [[], [], [], []]
    return poses


def int_cell(row, index):
    try:
        raw = (row[index] or "").strip()
    except IndexError:
        return None
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def cell(row, index):
    try:
        return (row[index] or "").strip()
    except IndexError:
        return ""


def bake_jobs():
    with JOB_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[3:]
    jobs = []
    for row in rows:
        job_id = int_cell(row, 0)
        if job_id is None:
            continue
        jobs.append({
            "id": job_id,
            "name": cell(row, 1),
            "resHead": int_cell(row, 14),
            "imgHeads": [int_cell(row, 15), int_cell(row, 16), int_cell(row, 17)],
            "resBody": int_cell(row, 18),
            "imgBodys": [int_cell(row, 19), int_cell(row, 20), int_cell(row, 21)],
            "resHand": int_cell(row, 22),
            "imgHands": [int_cell(row, 23), int_cell(row, 24), int_cell(row, 25)],
            "resFoot": int_cell(row, 26),
            "imgFoots": [int_cell(row, 27), int_cell(row, 28), int_cell(row, 29)],
            "weapon": int_cell(row, 30),
            "shield": int_cell(row, 31),
        })
    return jobs


def bake_equips():
    with EQUIP_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[1:]
    equips = []
    for row in rows:
        equip_id = int_cell(row, 0)
        if equip_id is None:
            continue
        equips.append({
            "id": equip_id,
            "name": cell(row, 1),
            "img": int_cell(row, 8),
        })
    return equips


def copy_pngs():
    if FRONTEND_PUBLIC.exists():
        shutil.rmtree(FRONTEND_PUBLIC)
    FRONTEND_PUBLIC.mkdir(parents=True, exist_ok=True)
    copied = 0
    for dir_name in SPRITE_DIRS:
        src_dir = KA_ASSETS / dir_name
        if not src_dir.exists():
            continue
        dst_dir = FRONTEND_PUBLIC / dir_name
        dst_dir.mkdir(parents=True, exist_ok=True)
        for png_path in sorted(src_dir.glob("*.png")):
            shutil.copy2(png_path, dst_dir / png_path.name)
            copied += 1
    return copied


def main():
    dirs = {dir_name: bake_directory(dir_name) for dir_name in SPRITE_DIRS}
    api_rules = {dir_name: dirs[dir_name] for dir_name in ["face", "body", "hand", "shoes", "foot", "weapon"]}
    API_RULES_OUT.parent.mkdir(parents=True, exist_ok=True)
    API_RULES_OUT.write_text(json.dumps(api_rules, separators=(",", ":")), encoding="utf-8")

    copied = copy_pngs()
    frontend_rules = {
        "version": 1,
        "spriteBase": "/character_sprites",
        "dirs": dirs,
        "poses": bake_poses(),
        "jobs": bake_jobs(),
        "equips": bake_equips(),
    }
    FRONTEND_RULES_OUT.write_text(json.dumps(frontend_rules, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {API_RULES_OUT} ({API_RULES_OUT.stat().st_size / 1024:.1f} KB)")
    print(f"Copied {copied} PNG files to {FRONTEND_PUBLIC}")
    print(f"Wrote {FRONTEND_RULES_OUT} ({FRONTEND_RULES_OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
