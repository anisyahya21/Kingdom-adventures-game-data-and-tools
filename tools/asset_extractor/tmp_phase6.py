"""
Phase 6:
1. Correctly parse walk_right.seb (22-byte entries) for weapon offset
2. Read xls/ folder and ka_shared_inspect.txt (building placement data?)
3. Look at chip SEB files for tile anchor offsets
4. Find building placement data file
"""
from pathlib import Path
import struct, json

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

def parse_seb_22(path, label=""):
    data = Path(path).read_bytes()
    h = [struct.unpack_from('>H', data, i*2)[0] for i in range(4)]
    data_bytes = len(data) - 8
    n = data_bytes // 22
    entries = []
    for i in range(n):
        off = 8 + i * 22
        e = data[off:off+22]
        u16s = [struct.unpack_from('>H', e, j*2)[0] for j in range(11)]
        ox = struct.unpack_from('>h', e, 12)[0]
        oy = struct.unpack_from('>h', e, 14)[0]
        entries.append({
            'layer': u16s[0], 'img': u16s[1], 'frame': u16s[2], 'unk': u16s[3],
            'canvas_w': u16s[4], 'canvas_h': u16s[5],
            'offset_x': ox, 'offset_y': oy,
            'state': u16s[8], 'col': u16s[9], 'row': u16s[10]
        })
    if label:
        print(f"\n=== {label} ({n} entries) header={h} ===")
        for i, e in enumerate(entries[:50]):
            print(f"  [{i:3d}] layer={e['layer']:3d} img={e['img']:3d} canvas={e['canvas_w']:3d}x{e['canvas_h']:3d} "
                  f"off=({e['offset_x']:4d},{e['offset_y']:4d}) state={e['state']:3d} col={e['col']:3d} row={e['row']:3d}")
    return entries

# ============================================================
print("=" * 60)
print("1. PARSE walk_right.seb (CORRECT 22-byte entries)")
print("=" * 60)
walk_entries = parse_seb_22(KA/"chara"/"walk_right.seb", "walk_right.seb")

# Group by layer
by_layer = {}
for e in walk_entries:
    l = e['layer']
    if l not in by_layer:
        by_layer[l] = []
    by_layer[l].append(e)

print("\n  Unique layers found:")
for layer, entries in sorted(by_layer.items()):
    imgs = sorted(set(e['img'] for e in entries))
    offsets = sorted(set((e['offset_x'], e['offset_y']) for e in entries))
    canvas = sorted(set((e['canvas_w'], e['canvas_h']) for e in entries))
    print(f"  layer={layer:3d}: {len(entries)} entries, imgs={imgs}, offsets={offsets}, canvas={canvas}")

# Key weapon/shield info
print("\n  Layer 11 (weapon) entries:")
for e in by_layer.get(11, []):
    print(f"    img={e['img']} canvas={e['canvas_w']}x{e['canvas_h']} off=({e['offset_x']},{e['offset_y']}) state={e['state']} col={e['col']} row={e['row']}")
print("\n  Layer 12 (shield) entries:")
for e in by_layer.get(12, []):
    print(f"    img={e['img']} canvas={e['canvas_w']}x{e['canvas_h']} off=({e['offset_x']},{e['offset_y']}) state={e['state']} col={e['col']} row={e['row']}")

# Also look at equip_walk_right.seb which is specifically for equipped items
print("\n")
equip_entries = parse_seb_22(KA/"chara"/"equip_walk_right.seb", "equip_walk_right.seb")
by_layer_eq = {}
for e in equip_entries:
    l = e['layer']
    if l not in by_layer_eq:
        by_layer_eq[l] = []
    by_layer_eq[l].append(e)
print("\n  Unique layers in equip_walk_right:")
for layer, entries in sorted(by_layer_eq.items()):
    imgs = sorted(set(e['img'] for e in entries))
    offsets = sorted(set((e['offset_x'], e['offset_y']) for e in entries))
    canvas = sorted(set((e['canvas_w'], e['canvas_h']) for e in entries))
    print(f"  layer={layer:3d}: {len(entries)} entries, imgs={imgs[:5]}, offsets={offsets[:3]}, canvas={canvas}")
print("\n  equip_walk layer 11 (weapon):")
for e in by_layer_eq.get(11, []):
    print(f"    img={e['img']} canvas={e['canvas_w']}x{e['canvas_h']} off=({e['offset_x']},{e['offset_y']}) state={e['state']} col={e['col']} row={e['row']}")

# ============================================================
print("\n" + "=" * 60)
print("2. XLS FOLDER & GAME STATE FILES")
print("=" * 60)
xls_dir = EXTRACTED / "xls"
if xls_dir.exists():
    for f in sorted(xls_dir.iterdir()):
        print(f"  {f.name}: {f.stat().st_size} bytes")
        ext = f.suffix.lower()
        if ext in ('.txt', '.csv', '.json', '.xml', '.xls', '.xlsx'):
            data = f.read_bytes()
            print(f"  preview: {data[:200]}")

# Read ka_shared_inspect.txt
inspect_file = EXTRACTED / "ka_shared_inspect.txt"
if inspect_file.exists():
    text = inspect_file.read_text(encoding='utf-8', errors='replace')
    print(f"\n  ka_shared_inspect.txt ({len(text)} chars):")
    print(text[:3000])

# ============================================================
print("\n" + "=" * 60)
print("3. CHIP SEB FILES (tile anchor offsets)")
print("=" * 60)
chip_dir = KA / "chip"
chip_sebs = list(chip_dir.glob("*.seb"))
print(f"  Chip SEBs: {len(chip_sebs)}")
for f in sorted(chip_sebs)[:5]:
    entries = parse_seb_22(f, f.name)

# ============================================================
print("\n" + "=" * 60)
print("4. BUILDING PLACEMENT DATA")
print("=" * 60)
# Look at building/*.seb files (the ones that ARE data, not just sprite info)
bld_dir = KA / "building"
print("  Building dir files:")
for f in sorted(bld_dir.iterdir()):
    print(f"  {f.name}: {f.stat().st_size} bytes")

# Also look at the map folder for additional files
map_dir = KA / "map"
print("\n  Map dir files:")
for f in sorted(map_dir.iterdir()):
    print(f"  {f.name}: {f.stat().st_size} bytes")

# Check if there's a building placement file
for pattern in ['*.bld', '*.dat', '*.bin', '*.csv', '*.json']:
    found = list(KA.rglob(pattern))
    if found:
        print(f"\n  Files matching {pattern}:")
        for f in found[:5]:
            print(f"    {f.relative_to(KA)}: {f.stat().st_size} bytes")

# ============================================================
print("\n" + "=" * 60)
print("5. CHARA img.inf - ALL LAYER NAMES")
print("=" * 60)
chara_inf = KA / "chara" / "img.inf"
if chara_inf.exists():
    text = chara_inf.read_text(encoding='ascii', errors='replace')
    print(text[:2000])

# ============================================================
print("\n" + "=" * 60)
print("6. WAIT_RIGHT.SEB - simplest idle pose")
print("=" * 60)
entries = parse_seb_22(KA/"chara"/"wait_right.seb", "wait_right.seb")
by_layer = {}
for e in entries:
    by_layer.setdefault(e['layer'], []).append(e)
print("\n  All layers:")
for layer in sorted(by_layer):
    e = by_layer[layer][0]
    imgs = sorted(set(x['img'] for x in by_layer[layer]))
    offsets = sorted(set((x['offset_x'], x['offset_y']) for x in by_layer[layer]))
    print(f"  layer={layer:3d}: imgs={imgs}, offsets={offsets}, canvas_w={e['canvas_w']}x{e['canvas_h']}")
