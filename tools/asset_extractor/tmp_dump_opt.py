from pathlib import Path

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")

def dump_opt(path):
    data = Path(path).read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    print(f"  canvas={cw}x{ch}  cols={cols}  rows={rows}  filesize={len(data)}")
    SLOT = 15
    for row in range(rows):
        for col in range(cols):
            off = 4 + (row * cols + col) * SLOT
            s = data[off:off + SLOT]
            if len(s) < 15:
                print(f"    ({row},{col}) TRUNCATED")
                continue
            flag = s[0]
            dx = s[4] | (s[5] << 8)
            dy = s[6] | (s[7] << 8)
            sx = s[8] | (s[9] << 8)
            sy = s[10] | (s[11] << 8)
            w  = s[12] | (s[13] << 8)
            h  = s[14]
            print(f"    ({row},{col}) flag={flag}  dest=({dx},{dy})  src=({sx},{sy})  size={w}x{h}")

LAYERS = [
    ("shadow",   KA/"shadow"/"shadow.opt"),
    ("body m_body_00",    KA/"body"/"m_body_00.opt"),
    ("foot m_foot_00",    KA/"foot"/"m_foot_00.opt"),
    ("face m_face_14",    KA/"face"/"m_face_14.opt"),
    ("face m_face_00",    KA/"face"/"m_face_00.opt"),
    ("eye  eye_00",       KA/"eye"/"eye_00.opt"),
    ("mouth mouth_00",    KA/"mouth"/"mouth_00.opt"),
]

for name, p in LAYERS:
    print(f"\n=== {name} ===")
    if Path(p).exists():
        dump_opt(p)
    else:
        print("  NOT FOUND")

# hair
print("\n=== hair ===")
hair_dir = KA / "hair"
for f in sorted(hair_dir.iterdir()):
    print(f"  {f.name}", end="")
    if f.suffix == '.opt':
        data = f.read_bytes()
        print(f"  -> canvas={data[0]}x{data[1]}  cols={data[2]}  rows={data[3]}", end="")
    print()

# hat
print("\n=== hat ===")
hat_dir = KA / "hat"
for f in sorted(hat_dir.iterdir())[:20]:
    print(f"  {f.name}", end="")
    if f.suffix == '.opt':
        data = f.read_bytes()
        print(f"  -> canvas={data[0]}x{data[1]}  cols={data[2]}  rows={data[3]}", end="")
    print()

# hand
print("\n=== hand (first 3 opt) ===")
for h in sorted((KA/"hand").glob("*.opt"))[:3]:
    print(f"\n  {h.name}")
    dump_opt(h)

# weapon 
print("\n=== weapon/img.inf index vs files ===")
inf_path = KA / "weapon" / "img.inf"
inf_data = inf_path.read_bytes()
entries = {}
for i in range(0, len(inf_data), 4):
    chunk = inf_data[i:i+4]
    if len(chunk) < 4: break
    idx = int.from_bytes(chunk[:2], 'little')
    slen = chunk[2]
    if slen == 0 or i+4+slen > len(inf_data):
        continue
    name_bytes = inf_data[i+3:i+3+slen]
    entries[idx] = name_bytes.decode('ascii', errors='replace').rstrip('\x00')

print(f"  weapon/img.inf has {len(entries)} entries")
for idx in sorted(entries)[:20]:
    print(f"  [{idx}] -> {entries[idx]}")

# weapon 100 = sheild_00, 200 = weapon start
print("  ...")
for idx in sorted(entries):
    if 98 <= idx <= 105:
        print(f"  [{idx}] -> {entries[idx]}")
for idx in sorted(entries):
    if 198 <= idx <= 205:
        print(f"  [{idx}] -> {entries[idx]}")

# weapon opt for weapon_14 and sheild_00
print("\n=== weapon/weapon_14.opt ===")
wp = KA/"weapon"/"weapon_14.opt"
if wp.exists():
    dump_opt(wp)

print("\n=== weapon/sheild_00.opt ===")
sp = KA/"weapon"/"sheild_00.opt"
if sp.exists():
    dump_opt(sp)
