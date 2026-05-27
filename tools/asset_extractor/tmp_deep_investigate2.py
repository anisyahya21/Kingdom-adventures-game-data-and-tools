"""
Deep dive phase 2:
1. Parse img.inf correctly (text format)
2. Read .seb files (building/chip multi-part definitions) 
3. Read .optinfo files
4. Decode map file deeply
5. Face y_offset analysis with visual composite
"""
from pathlib import Path
from PIL import Image
import io
import struct

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

# ============================================================
# 1. IMG.INF - correct text parsing
# ============================================================
print("=" * 60)
print("1. IMG.INF TEXT FORMAT")
print("=" * 60)

def parse_inf(path):
    """Parse tab-separated text img.inf: index<TAB>filename[,bin]"""
    data = Path(path).read_bytes()
    text = data.decode('ascii', errors='replace')
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line: continue
        parts = line.split('\t', 1)
        if len(parts) != 2: continue
        try:
            idx = int(parts[0])
        except:
            continue
        fname = parts[1].split(',')[0].strip()  # remove ,bin suffix
        result[idx] = fname
    return result

# weapon inf
print("\n  weapon/img.inf:")
w_inf = parse_inf(KA / "weapon" / "img.inf")
for k in sorted(w_inf)[:15]:
    print(f"    [{k}] = {w_inf[k]}")
print("  ...")
for k in sorted(w_inf):
    if 98 <= k <= 106: print(f"    [{k}] = {w_inf[k]}")
print("  ...")
for k in sorted(w_inf):
    if 198 <= k <= 206: print(f"    [{k}] = {w_inf[k]}")
print(f"  Total: {len(w_inf)} entries, keys: {sorted(w_inf)[:5]}...{sorted(w_inf)[-5:]}")

# chara inf
print("\n  chara/img.inf:")
c_inf = parse_inf(KA / "chara" / "img.inf")
for k in sorted(c_inf):
    print(f"    [{k}] = {c_inf[k]}")

# chip inf
chip_inf_path = KA / "chip" / "img.inf"
if chip_inf_path.exists():
    print("\n  chip/img.inf (first 30):")
    ch_inf = parse_inf(chip_inf_path)
    for k in sorted(ch_inf)[:30]:
        print(f"    [{k}] = {ch_inf[k]}")
    print(f"  Total: {len(ch_inf)} entries")

# building inf
bld_inf_path = KA / "building" / "img.inf"
if bld_inf_path.exists():
    print("\n  building/img.inf (first 30):")
    b_inf = parse_inf(bld_inf_path)
    for k in sorted(b_inf)[:30]:
        print(f"    [{k}] = {b_inf[k]}")
    print(f"  Total: {len(b_inf)} entries")

# ============================================================
# 2. .SEB FILES - building multi-part definitions
# ============================================================
print("\n" + "=" * 60)
print("2. SEB FILES (multi-part building definitions)")
print("=" * 60)

bld_dir = KA / "building"
seb_files = sorted(bld_dir.glob("*.seb"))
print(f"  {len(seb_files)} .seb files in building/")
for sf in seb_files[:15]:
    data = sf.read_bytes()
    print(f"\n  === {sf.name} ({len(data)} bytes) ===")
    # Try as text
    try:
        text = data.decode('utf-8', errors='strict')
        print(f"  TEXT: {repr(text[:300])}")
    except:
        print(f"  BINARY: {repr(data[:80])}")
        print(f"  bytes: {list(data[:32])}")

# chip sebs
chip_dir_extracted = EXTRACTED / "chip"
if chip_dir_extracted.exists():
    for sf in sorted(chip_dir_extracted.glob("*.seb"))[:5]:
        data = sf.read_bytes()
        print(f"\n  chip/{sf.name} ({len(data)} bytes)")
        try:
            text = data.decode('utf-8', errors='strict')
            print(f"  TEXT: {repr(text[:200])}")
        except:
            print(f"  BINARY: {list(data[:32])}")

# ============================================================
# 3. .OPTINFO FILES
# ============================================================
print("\n" + "=" * 60)
print("3. .OPTINFO FILES")
print("=" * 60)
optinfo_files = sorted(bld_dir.glob("*.optinfo"))[:5]
for oi in optinfo_files:
    data = oi.read_bytes()
    print(f"\n  {oi.name} ({len(data)} bytes):")
    try:
        text = data.decode('utf-8', errors='strict')
        print(f"  {repr(text[:300])}")
    except:
        print(f"  BINARY: {list(data[:32])}")

# chip optinfo
chip_optinfos = sorted((KA/"chip").glob("*.optinfo"))[:3]
for oi in chip_optinfos:
    data = oi.read_bytes()
    print(f"\n  chip/{oi.name} ({len(data)} bytes):")
    print(f"  {repr(data.decode('utf-8', errors='replace')[:300])}")

# ============================================================
# 4. MAP FILE DEEP DECODE
# ============================================================
print("\n" + "=" * 60)
print("4. MAP FILE DEEP DECODE")
print("=" * 60)

for map_name in ["dev_map_96_96.map", "map_160_160.map"]:
    map_path = KA / "map" / map_name
    data = map_path.read_bytes()
    print(f"\n  === {map_name} ({len(data)} bytes) ===")
    
    # Header: big-endian uint32
    w = struct.unpack_from('>I', data, 0)[0]
    h = struct.unpack_from('>I', data, 4)[0]
    v3 = struct.unpack_from('>I', data, 8)[0]
    v4 = struct.unpack_from('>I', data, 12)[0]
    v5 = struct.unpack_from('>I', data, 16)[0]
    v6 = struct.unpack_from('>I', data, 20)[0]
    v7 = struct.unpack_from('>I', data, 24)[0]
    v8 = struct.unpack_from('>I', data, 28)[0]
    print(f"  Header BE uint32: w={w} h={h} [{v3},{v4},{v5},{v6},{v7},{v8}]")
    
    expected_tiles = w * h
    print(f"  Map tiles: {w}x{h} = {expected_tiles}")
    
    # If the map is a grid of fixed-size records after header
    # 4-byte header = 32 bytes (8 uint32s) 
    # remaining = data[32:]
    remaining = len(data) - 32
    print(f"  Data after 32-byte header: {remaining} bytes")
    print(f"  Per tile (if {expected_tiles} tiles): {remaining / expected_tiles:.1f} bytes")
    
    # Try 4-byte records: 96*96 = 9216, 9216*4 = 36864 — not matching 258820-32 = 258788
    # Try reading first few tiles
    print(f"  First few BE uint32 after header: {[struct.unpack_from('>I', data, 32+i*4)[0] for i in range(16)]}")
    print(f"  First few BE uint16 after header: {[struct.unpack_from('>H', data, 32+i*2)[0] for i in range(16)]}")
    
    # Try different header sizes
    for hdr_size in [0, 8, 16, 32]:
        rem = len(data) - hdr_size
        if expected_tiles > 0:
            bpt = rem / expected_tiles
            if bpt == int(bpt) and 1 <= bpt <= 64:
                print(f"  *** hdr_size={hdr_size} -> {bpt:.0f} bytes per tile ***")

# ============================================================
# 5. BINARY chip and building INDEX FILES
# ============================================================
print("\n" + "=" * 60)
print("5. chip and building BINARY INDEX FILES")
print("=" * 60)

chip_bin = EXTRACTED / "chip"
bld_bin = EXTRACTED / "building"

for bin_path, name in [(chip_bin / "chip", "chip"), (bld_bin / "building", "building")]:
    if bin_path.exists() and not bin_path.is_dir():
        data = bin_path.read_bytes()
        print(f"\n  {name} binary ({len(data)} bytes):")
        # Interpret as LE uint32 array
        entries_32 = [struct.unpack_from('<I', data, i)[0] for i in range(0, min(64, len(data)), 4)]
        print(f"  As LE uint32: {entries_32}")
        # Try as LE uint16
        entries_16 = [struct.unpack_from('<H', data, i)[0] for i in range(0, min(32, len(data)), 2)]
        print(f"  As LE uint16: {entries_16}")

# ============================================================
# 6. FACE y_offset - visual test render both y_offset=0 and y_offset=4
# ============================================================
print("\n" + "=" * 60)
print("6. FACE Y_OFFSET ANALYSIS")
print("=" * 60)

def decode_opt(path):
    data = Path(path).read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    SLOT = 15
    slots = {}
    for row in range(rows):
        for col in range(cols):
            off = 4 + (row * cols + col) * SLOT
            s = data[off:off + SLOT]
            if len(s) < 15: continue
            if s[0] == 0: continue
            dx = s[4] | (s[5] << 8)
            dy = s[6] | (s[7] << 8)
            sx = s[8] | (s[9] << 8)
            sy = s[10] | (s[11] << 8)
            w  = s[12] | (s[13] << 8)
            h  = s[14]
            slots[(row, col)] = {'dest_x': dx, 'dest_y': dy, 'src_x': sx, 'src_y': sy, 'w': w, 'h': h}
    return cw, ch, slots

def blit(canvas, src_path, opt_path, v_state, u_frame, y_offset=0):
    src = Image.open(src_path).convert("RGBA")
    cw, ch, slots = decode_opt(opt_path)
    slot = slots.get((v_state, u_frame))
    if not slot: return False, f"no slot ({v_state},{u_frame})"
    region = src.crop((slot['src_x'], slot['src_y'], slot['src_x']+slot['w'], slot['src_y']+slot['h']))
    canvas.paste(region, (slot['dest_x'], slot['dest_y'] + y_offset), region)
    return True, f"blitted at ({slot['dest_x']},{slot['dest_y']+y_offset}) size {slot['w']}x{slot['h']}"

for y_offset in [0, 4, 6]:
    print(f"\n  Testing y_offset={y_offset}:")
    canvas = Image.new("RGBA", (24, 30), (0, 0, 0, 0))
    
    # Body
    ok, msg = blit(canvas, KA/"body"/"m_body_00.png", KA/"body"/"m_body_00.opt", 0, 0)
    print(f"    body v=0: {msg}")
    
    # Foot
    ok, msg = blit(canvas, KA/"foot"/"m_foot_00.png", KA/"foot"/"m_foot_00.opt", 0, 0)
    print(f"    foot v=0: {msg}")
    
    # Face
    ok, msg = blit(canvas, KA/"face"/"m_face_14.png", KA/"face"/"m_face_14.opt", 1, 0, y_offset)
    print(f"    face v=1 y_off={y_offset}: {msg}")
    
    # Eye
    ok, msg = blit(canvas, KA/"eye"/"eye_00.png", KA/"eye"/"eye_00.opt", 1, 0, y_offset)
    print(f"    eye v=1 y_off={y_offset}: {msg}")
    
    # Mouth
    ok, msg = blit(canvas, KA/"mouth"/"mouth_00.png", KA/"mouth"/"mouth_00.opt", 1, 0, y_offset)
    print(f"    mouth v=1 y_off={y_offset}: {msg}")
    
    # Count non-transparent
    arr = list(canvas.getdata())
    nz = sum(1 for px in arr if px[3] > 0)
    print(f"    non-transparent: {nz}/720")
    
    # Save to file for visual inspection
    canvas_scaled = canvas.resize((240, 300), Image.NEAREST)
    out = Path(f"C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/tools/asset_extractor/tmp_face_yoffset_{y_offset}.png")
    canvas_scaled.save(out)
    print(f"    saved -> {out.name}")

print("\n  NOTE: Open the tmp_face_yoffset_*.png files to visually compare!")
