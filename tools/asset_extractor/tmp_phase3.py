"""
Phase 3 deep investigation:
1. SEB binary format decode (building multi-part)
2. Map file format fully decoded (28 bytes/tile found)
3. Weapon canvas alignment (dest_x problem)
4. All face-related png dims + compare with game screenshot
5. chip/building binary index lookup tables
"""
from pathlib import Path
from PIL import Image
import struct

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

# ============================================================
# 1. SEB FORMAT - decode carefully byte by byte
# ============================================================
print("=" * 60)
print("1. SEB FORMAT DECODE")
print("=" * 60)

def parse_seb(data):
    """Attempt to decode SEB format entries."""
    # Header: 4 BE uint16s = 8 bytes
    h = [struct.unpack_from('>H', data, i*2)[0] for i in range(4)]
    print(f"  Header (4x uint16 BE): {h}")
    # h[0] = ? (type: 4 for buildings, 1 for chips)
    # h[1] = ? (num_states or num_frames)
    # h[2] = ? (num_cols or related)
    # h[3] = ? (total_frames total?)
    
    n_entries = h[0]  # Try: first short = num entries
    entry_size = (len(data) - 8) // n_entries if n_entries > 0 else 0
    print(f"  If n_entries={n_entries}: each entry = {entry_size} bytes (total_data={len(data)-8})")
    
    # Try 22-byte entries
    for entry_size_try in [22, 24]:
        n = (len(data) - 8) // entry_size_try
        remainder = (len(data) - 8) % entry_size_try
        if remainder == 0:
            print(f"  CLEAN FIT: n={n} entries of {entry_size_try} bytes (remainder=0)")
    
    # Parse entries as 22-byte records assuming n_entries=h[0]
    print(f"  Entries (22-byte each, n={n_entries}):")
    for i in range(min(n_entries, 20)):
        off = 8 + i * 22
        if off + 22 > len(data):
            break
        e = data[off:off+22]
        # Fields as BE types:
        # uint32 img_idx, uint32 frame_or_state, uint16 canvas_w, uint16 canvas_h,
        # int16 offset_x, int16 offset_y, uint16 state, uint16 col, uint16 row
        img  = struct.unpack_from('>I', e, 0)[0]
        frm  = struct.unpack_from('>I', e, 4)[0]
        cw   = struct.unpack_from('>H', e, 8)[0]
        ch   = struct.unpack_from('>H', e, 10)[0]
        ox   = struct.unpack_from('>h', e, 12)[0]  # signed
        oy   = struct.unpack_from('>h', e, 14)[0]  # signed
        st   = struct.unpack_from('>H', e, 16)[0]
        col  = struct.unpack_from('>H', e, 18)[0]
        row  = struct.unpack_from('>H', e, 20)[0]
        print(f"    entry[{i}]: img={img} frame={frm} canvas={cw}x{ch} offset=({ox},{oy}) state={st} col={col} row={row}")

seb_files = {
    "building/1x1.seb": (KA/"building"/"1x1.seb"),
    "building/2x2.seb": (KA/"building"/"2x2.seb"),
    "building/2x2_anim.seb": (KA/"building"/"2x2_anim.seb"),
    "building/flag.seb": (KA/"building"/"flag.seb"),
    "chip/chip00.seb": (EXTRACTED/"chip"/"chip00.seb"),
    "chip/chip_water_edge.seb": (EXTRACTED/"chip"/"chip_water_edge.seb"),
}

for name, path in seb_files.items():
    if not path.exists():
        print(f"\n=== {name} NOT FOUND ===")
        continue
    data = path.read_bytes()
    print(f"\n=== {name} ({len(data)} bytes) ===")
    parse_seb(data)

# ============================================================
# 2. MAP FILE DECODE - 4 + rows*(8 + cols*28) hypothesis
# ============================================================
print("\n" + "=" * 60)
print("2. MAP FILE STRUCTURE")
print("=" * 60)

map_path = KA / "map" / "dev_map_96_96.map"
data = map_path.read_bytes()
print(f"  Total: {len(data)} bytes")

# Hypothesis: file_header=4 bytes, then rows * (8 + cols*28)
# file_header[0] (uint32 BE) = width = 96 (confirmed)
file_hdr = struct.unpack_from('>I', data, 0)[0]
print(f"  file_header[0] = {file_hdr}")

# Row format: row_header(8 bytes) + width * tile(28 bytes)
# Row 0 starts at offset 4
# Row 0 header: bytes 4-11
width = 96
for row_idx in range(3):
    row_off = 4 + row_idx * (8 + width * 28)
    rh0 = struct.unpack_from('>I', data, row_off)[0]
    rh1 = struct.unpack_from('>I', data, row_off + 4)[0]
    # First tile
    tile_off = row_off + 8
    t = [struct.unpack_from('>I', data, tile_off + j*4)[0] for j in range(7)]
    print(f"  Row {row_idx} at offset {row_off}: header=[{rh0},{rh1}] first_tile={t}")

# What are the 7 uint32 fields per tile?
# Let's look at variation across tiles in row 0
print(f"\n  Tile variation in row 0 (first 20 tiles):")
for tile_x in range(20):
    tile_off = 4 + 8 + tile_x * 28
    t = [struct.unpack_from('>I', data, tile_off + j*4)[0] for j in range(7)]
    print(f"    tile[0,{tile_x:2d}]: {t}")

# Look at a specific row that might have interesting features
print(f"\n  Tiles in row 40 (middle of map):")
row40_off = 4 + 40 * (8 + width * 28)
for tile_x in range(10):
    tile_off = row40_off + 8 + tile_x * 28
    t = [struct.unpack_from('>I', data, tile_off + j*4)[0] for j in range(7)]
    print(f"    tile[40,{tile_x}]: {t}")

# Field frequency analysis for all tiles
print(f"\n  Unique values for each field across all tiles:")
field_vals = [set() for _ in range(7)]
for row_idx in range(width):
    for tile_x in range(width):
        tile_off = 4 + row_idx * (8 + width * 28) + 8 + tile_x * 28
        for f in range(7):
            val = struct.unpack_from('>I', data, tile_off + f*4)[0]
            field_vals[f].add(val)

for f in range(7):
    vals = sorted(field_vals[f])
    if len(vals) <= 30:
        print(f"    field[{f}]: {len(vals)} unique values: {vals}")
    else:
        print(f"    field[{f}]: {len(vals)} unique values, range {min(vals)}-{max(vals)}, sample: {vals[:10]}...{vals[-5:]}")

# ============================================================
# 3. chip/building LOOKUP TABLES in ka_extracted 
# ============================================================
print("\n" + "=" * 60)
print("3. chip/building BINARY LOOKUP TABLES")
print("=" * 60)

chip_bin = EXTRACTED / "chip" / "chip"
bld_bin  = EXTRACTED / "building" / "building"

for bin_path, name in [(chip_bin, "chip"), (bld_bin, "building")]:
    if not bin_path.exists() or bin_path.is_dir():
        print(f"  {name}: not found or is dir")
        continue
    data_b = bin_path.read_bytes()
    print(f"\n  {name}: {len(data_b)} bytes")
    # Try reading as array of uint32 BE
    n32 = len(data_b) // 4
    vals_be = [struct.unpack_from('>I', data_b, i*4)[0] for i in range(min(n32, 40))]
    vals_le = [struct.unpack_from('<I', data_b, i*4)[0] for i in range(min(n32, 40))]
    print(f"  First 20 as BE uint32: {vals_be[:20]}")
    print(f"  First 20 as LE uint32: {vals_le[:20]}")
    # Look for non-zero values (might be index jumps)
    nonzero = [(i, vals_le[i]) for i in range(len(vals_le)) if vals_le[i] != 0]
    print(f"  Non-zero LE entries (first 20): {nonzero[:20]}")

# ============================================================
# 4. WEAPON CANVAS - all slots in weapon_14.opt
# ============================================================
print("\n" + "=" * 60)
print("4. WEAPON CANVAS ALIGNMENT (weapon_14.opt)")
print("=" * 60)

def dump_opt_full(path):
    data = Path(path).read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    print(f"  canvas={cw}x{ch}  cols={cols}  rows={rows}")
    SLOT = 15
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
            print(f"    ({row},{col}) dest=({dx},{dy}) src=({sx},{sy}) size={w}x{h}  rightedge_x={dx+w} bottomy={dy+h}")
    return cw, ch

print("\n  weapon_14.opt:")
dump_opt_full(KA/"weapon"/"weapon_14.opt")
print("\n  sheild_00.opt:")
dump_opt_full(KA/"weapon"/"sheild_00.opt")
print("\n  work_00.opt:")
if (KA/"weapon"/"work_00.opt").exists():
    dump_opt_full(KA/"weapon"/"work_00.opt")

# Look at weapon PNG
print("\n  weapon_14.png size:")
img = Image.open(KA/"weapon"/"weapon_14.png")
print(f"    {img.size[0]}x{img.size[1]}")

# ============================================================
# 5. ALL BUILDING/CHIP OPT FILES - understand canvas sizes
# ============================================================
print("\n" + "=" * 60)
print("5. BUILDING/CHIP OPT CANVAS SIZES")
print("=" * 60)

print("\n  Building opt files (sample):")
for f in sorted((KA/"building").glob("*.opt"))[:20]:
    data = f.read_bytes()
    cw, ch, cols, rows = data[0], data[1], data[2], data[3]
    print(f"    {f.name}: canvas={cw}x{ch} cols={cols} rows={rows}")
    # Show all slots
    SLOT = 15
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
            print(f"      ({row},{col}) dest=({dx},{dy}) size={w}x{h}")

# ============================================================
# 6. MAP FIELD SEMANTICS - compare map vs chip/building inf
# ============================================================
print("\n" + "=" * 60)
print("6. MAP FIELD SEMANTICS - chip/building img.inf lookup")
print("=" * 60)

def parse_inf(path):
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
        fname = parts[1].split(',')[0].strip()
        result[idx] = fname
    return result

ch_inf = parse_inf(KA/"chip"/"img.inf")
bld_inf = parse_inf(KA/"building"/"img.inf")

map_data = (KA/"map"/"dev_map_96_96.map").read_bytes()

print(f"\n  chip/img.inf has {len(ch_inf)} entries")
print(f"  building/img.inf has {len(bld_inf)} entries")

# Cross-reference tile fields against chip/building indices
# From field analysis: which field ranges match chip/building indices?
print(f"\n  chip index range: {min(ch_inf)} to {max(ch_inf)}")
print(f"  building index range: {min(bld_inf)} to {max(bld_inf)}")

# Show what field[0] values map to in chip inf
print(f"\n  Tile field[0] unique values mapped to chip/img.inf:")
for v in sorted(field_vals[0])[:30]:
    name = ch_inf.get(v, bld_inf.get(v, "(not found)"))
    print(f"    {v} -> {name}")

print(f"\n  Tile field[1] unique values:")
for v in sorted(field_vals[1])[:20]:
    name = ch_inf.get(v, bld_inf.get(v, "(not found)"))
    print(f"    {v} -> chip:{ch_inf.get(v,'?')} bld:{bld_inf.get(v,'?')}")
