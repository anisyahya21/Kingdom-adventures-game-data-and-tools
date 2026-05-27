"""
Phase 5:
1. List ALL chara SEB files (find standing/idle pose)
2. Decode chara SEB to understand weapon layering
3. Look at map field analysis more carefully (which field = building)
4. Look at the game/ folder in extracted APK
"""
from pathlib import Path
import struct

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

# ============================================================
# 1. ALL CHARA SEB FILES
# ============================================================
print("=" * 60)
print("1. ALL CHARA SEB FILES")
print("=" * 60)
chara_dir = KA / "chara"
all_seb = sorted(chara_dir.glob("*.seb"))
print(f"  Total: {len(all_seb)}")
for f in all_seb:
    data = f.read_bytes()
    h = [struct.unpack_from('>H', data, i*2)[0] for i in range(4)]
    print(f"  {f.name}: {len(data)} bytes  header={h}")

# ============================================================
# 2. DECODE A KEY CHARA SEB - pick "walk" or "stand" 
# ============================================================
print("\n" + "=" * 60)
print("2. DECODE CHARA SEB ENTRIES")
print("=" * 60)

def decode_chara_seb(path, max_entries=30):
    data = path.read_bytes()
    h = [struct.unpack_from('>H', data, i*2)[0] for i in range(4)]
    print(f"  Header [n_entries={h[0]}, states={h[1]}, cols={h[2]}, rows={h[3]}]")
    total_data = len(data) - 8
    
    # Try 22-byte entries
    for entry_size in [22, 24, 26, 28]:
        if total_data % entry_size == 0:
            n = total_data // entry_size
            print(f"  CLEAN FIT: {n} entries × {entry_size} bytes")
    
    # Parse as 11 × uint16 BE (22 bytes) or 12 × uint16 BE (24 bytes)
    n = h[0]
    entry_size = total_data // n if n > 0 else 22
    print(f"  Using n={n}, entry_size={entry_size}")
    
    for i in range(min(n, max_entries)):
        off = 8 + i * entry_size
        if off + entry_size > len(data):
            break
        e = data[off:off+entry_size]
        # Parse as uint16 pairs
        u16s = [struct.unpack_from('>H', e, j*2)[0] for j in range(entry_size//2)]
        # signed for offset fields (indices 6,7)
        if len(u16s) >= 8:
            ox = struct.unpack_from('>h', e, 12)[0]
            oy = struct.unpack_from('>h', e, 14)[0]
            img = u16s[1]
            layer = u16s[0]
            cw = u16s[4]
            ch = u16s[5]
            state = u16s[8] if len(u16s) > 8 else -1
            col = u16s[9] if len(u16s) > 9 else -1
            row = u16s[10] if len(u16s) > 10 else -1
            print(f"    [{i:3d}] layer={layer:3d} img={img:3d} canvas={cw:3d}x{ch:3d} off=({ox:4d},{oy:4d}) state={state} col={col} row={row}")

# Pick several interesting ones
for fname in ["walk_right.seb", "stand_right.seb", "walk_down.seb", "stand_down.seb",
              "attack_spear_right.seb", "attack_bow_right.seb"]:
    p = chara_dir / fname
    if p.exists():
        print(f"\n  === {fname} ({p.stat().st_size} bytes) ===")
        decode_chara_seb(p)
    else:
        print(f"\n  {fname}: NOT FOUND")

# ============================================================
# 3. MAP - search for non-chip building values (indices > 96)
# ============================================================
print("\n" + "=" * 60)
print("3. MAP - BUILDING DETECTION")
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

# chip max index
ch_max = max(ch_inf.keys())
bld_max = max(bld_inf.keys())
print(f"  chip max idx={ch_max}, building max idx={bld_max}")
print(f"  Values only in building (not in chip): {sorted(k for k in bld_inf if k not in ch_inf)}")
print(f"  Values only in chip (not in building): {sorted(k for k in ch_inf if k not in bld_inf)[:20]}")

# For map tiles: if a field has value that's in building/img.inf but NOT chip/img.inf
# then it's a building
bld_only = set(k for k in bld_inf if k not in ch_inf)
print(f"\n  Building-only values: {sorted(bld_only)}")

map_data = (KA/"map"/"dev_map_96_96.map").read_bytes()
width = 96

# Scan all tiles for building-only values
building_tiles = []
for row in range(width):
    for col in range(width):
        tile_off = 4 + row * (8 + width * 28) + 8 + col * 28
        for fi in range(7):
            v = struct.unpack_from('>I', map_data, tile_off + fi*4)[0]
            if v in bld_only:
                building_tiles.append((row, col, fi, v, bld_inf[v]))

print(f"\n  Found {len(building_tiles)} building-only tile entries")
for item in building_tiles[:20]:
    r, c, fi, v, name = item
    fields = [struct.unpack_from('>I', map_data, 4 + r*(8+width*28) + 8 + c*28 + f*4)[0] for f in range(7)]
    print(f"  tile[{r},{c}] field[{fi}]={v} → {name}  |  all_fields={fields}")

# Also look for values > 96 in all fields
print(f"\n  Tiles with any field value > 96 (building range):")
count = 0
for row in range(width):
    for col in range(width):
        tile_off = 4 + row * (8 + width * 28) + 8 + col * 28
        fields = [struct.unpack_from('>I', map_data, tile_off + fi*4)[0] for fi in range(7)]
        for fi, v in enumerate(fields):
            if v != 0xFFFFFFFF and v > 96:
                print(f"  tile[{row},{col}] field[{fi}]={v} | all={fields}")
                count += 1
                break
        if count >= 20:
            break
    if count >= 20:
        break

# ============================================================
# 4. GAME FOLDER IN EXTRACTED
# ============================================================
print("\n" + "=" * 60)
print("4. game/ FOLDER CONTENTS")
print("=" * 60)
game_dir = EXTRACTED / "game"
if game_dir.exists():
    files = sorted(game_dir.iterdir())
    print(f"  {len(files)} files")
    for f in files[:30]:
        if f.is_file():
            print(f"  {f.name}: {f.stat().st_size} bytes")
        else:
            print(f"  {f.name}/")
    
    # Read any text files
    for f in game_dir.iterdir():
        if f.suffix in ('.txt', '.xml', '.json', '.csv', '.ini'):
            print(f"\n  === {f.name} ===")
            print(f.read_text(encoding='utf-8', errors='replace')[:300])
        elif f.suffix == '.seb':
            data = f.read_bytes()
            h = [struct.unpack_from('>H', data, i*2)[0] for i in range(4)]
            print(f"  {f.name}: seb header={h}")
