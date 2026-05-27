"""
Deep investigation of:
1. Face/eye canvas alignment
2. img.inf binary format (correctly)
3. Facility/building multi-part sprites
4. Map file binary format
"""
from pathlib import Path
from PIL import Image
import struct

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

# ============================================================
# 1. FACE PNG DIMENSIONS vs OPT
# ============================================================
print("=" * 60)
print("1. CHARACTER SPRITE PNG DIMENSIONS")
print("=" * 60)

def png_size(path):
    try:
        img = Image.open(path)
        return img.size
    except:
        return None

for cat in ['shadow', 'body', 'foot', 'face', 'eye', 'mouth', 'hair', 'hat', 'hand']:
    d = KA / cat
    files = sorted(d.glob("*.png"))[:3]
    for f in files:
        sz = png_size(f)
        print(f"  {cat}/{f.name}: {sz[0]}x{sz[1]}" if sz else f"  {cat}/{f.name}: ERROR")

# ============================================================
# 2. IMG.INF BINARY FORMAT - raw hex dump + attempt parse
# ============================================================
print("\n" + "=" * 60)
print("2. weapon/img.inf - RAW HEX DUMP (first 256 bytes)")
print("=" * 60)
inf_raw = (KA / "weapon" / "img.inf").read_bytes()
print(f"  Total size: {len(inf_raw)} bytes")
# hex dump first 100 bytes
for i in range(0, min(100, len(inf_raw))):
    if i % 16 == 0: print(f"\n  {i:04x}: ", end="")
    print(f"{inf_raw[i]:02x} ", end="")
print()

print("\n  First 100 bytes as ASCII:")
print("  ", repr(inf_raw[:100]))

# Try line-by-line parsing (null-terminated strings?)
print("\n  Trying to parse as null-terminated strings:")
i = 0
count = 0
while i < len(inf_raw) and count < 30:
    # find next null
    j = inf_raw.find(0, i)
    if j == -1:
        break
    segment = inf_raw[i:j]
    if segment:
        print(f"    [{i}..{j}] = {repr(segment.decode('ascii', errors='replace'))}")
        count += 1
    i = j + 1

# ============================================================
# 3. chara/img.inf 
# ============================================================
print("\n" + "=" * 60)
print("3. chara/img.inf - RAW HEX DUMP")
print("=" * 60)
chara_inf = KA / "chara" / "img.inf"
if chara_inf.exists():
    data = chara_inf.read_bytes()
    print(f"  Size: {len(data)} bytes")
    print(f"  First 200 bytes: {repr(data[:200])}")
else:
    print("  NOT FOUND - checking dirs:")
    for d in KA.iterdir():
        print(f"    {d.name}/")

# ============================================================
# 4. BUILDING sprites
# ============================================================
print("\n" + "=" * 60)
print("4. BUILDING SPRITES")
print("=" * 60)
bld_dir = KA / "building"
if bld_dir.exists():
    files = sorted(bld_dir.iterdir())
    print(f"  {len(files)} files")
    for f in files[:20]:
        if f.suffix == '.png':
            sz = png_size(f)
            print(f"    {f.name}: {sz[0]}x{sz[1]}")
        elif f.suffix == '.opt':
            data = f.read_bytes()
            cw, ch, cols, rows = data[0], data[1], data[2], data[3]
            print(f"    {f.name}: canvas={cw}x{ch} cols={cols} rows={rows}")
        else:
            print(f"    {f.name}")
else:
    print("  NOT FOUND")

# ============================================================
# 5. chip (terrain/facility) sprites  
# ============================================================
print("\n" + "=" * 60)
print("5. CHIP SPRITES (terrain)")
print("=" * 60)
chip_dir = KA / "chip"
if chip_dir.exists():
    files = sorted(chip_dir.iterdir())
    print(f"  {len(files)} files")
    for f in files[:10]:
        if f.suffix == '.png':
            sz = png_size(f)
            print(f"    {f.name}: {sz[0]}x{sz[1]}")
        elif f.suffix == '.opt':
            data = f.read_bytes()
            cw, ch, cols, rows = data[0], data[1], data[2], data[3]
            print(f"    {f.name}: canvas={cw}x{ch} cols={cols} rows={rows} (size={len(data)})")
        elif f.suffix == '.inf':
            data = f.read_bytes()
            print(f"    {f.name}: {len(data)} bytes -- {repr(data[:80])}")

# ============================================================
# 6. MAP FILE FORMAT 
# ============================================================
print("\n" + "=" * 60)
print("6. MAP FILE")
print("=" * 60)
map_dir = KA / "map"
if map_dir.exists():
    files = sorted(map_dir.iterdir())
    print(f"  {len(files)} files")
    for f in files[:5]:
        print(f"  {f.name}: {f.stat().st_size} bytes")
    # Read first map file
    first_map = files[0] if files else None
    if first_map:
        data = first_map.read_bytes()
        print(f"\n  === {first_map.name} ({len(data)} bytes) ===")
        print(f"  First 64 bytes: {repr(data[:64])}")
        print(f"  As uint16 LE: {[struct.unpack_from('<H', data, i)[0] for i in range(0, min(32, len(data)), 2)]}")
        print(f"  As bytes: {list(data[:32])}")
else:
    # Look for map files elsewhere
    print("  map/ dir not found - searching...")
    for d in KA.iterdir():
        print(f"    {d.name}")

# ============================================================
# 7. Look at ka_extracted for map data
# ============================================================
print("\n" + "=" * 60)
print("7. MAP FILES IN EXTRACTED APK")
print("=" * 60)
if EXTRACTED.exists():
    # Look for .map or similar files
    map_files = list(EXTRACTED.rglob("*.map"))[:10]
    for mf in map_files:
        print(f"  {mf.relative_to(EXTRACTED)}: {mf.stat().st_size} bytes")
        data = mf.read_bytes()
        print(f"    First 32 bytes: {list(data[:32])}")
    
    # Look for chip/building data
    chip_files = list(EXTRACTED.rglob("chip*"))[:10]
    print("\n  chip* files:")
    for cf in chip_files[:10]:
        print(f"  {cf.relative_to(EXTRACTED)}: {cf.stat().st_size} bytes")

    # building
    bld_files = list(EXTRACTED.rglob("building*"))[:10]
    print("\n  building* files:")
    for bf in bld_files[:10]:
        print(f"  {bf.relative_to(EXTRACTED)}: {bf.stat().st_size} bytes")
