"""
Phase 4: 
1. Look at .gif files in chara/ (are they real GIFs or custom format?)
2. Decode weapon canvas alignment from game logic
3. Find any character assembly SEB or similar  
4. Check kaextracted for Java/Smali code
"""
from pathlib import Path
from PIL import Image
import struct

KA = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets")
EXTRACTED = Path(r"C:\Users\anisb\ka_extracted")

# ============================================================
# 1. CHARA GIF FILES 
# ============================================================
print("=" * 60)
print("1. CHARA GIF FILES")
print("=" * 60)
chara_dir = KA / "chara"
if chara_dir.exists():
    files = sorted(chara_dir.iterdir())
    print(f"  Files in chara/: {len(files)}")
    for f in files[:10]:
        print(f"  {f.name}: {f.stat().st_size} bytes")
    
    # Try to open the first .gif as a real GIF
    gif_files = list(chara_dir.glob("*.gif"))[:5]
    for gf in gif_files:
        data = gf.read_bytes()
        print(f"\n  {gf.name}: first 16 bytes = {list(data[:16])} ({repr(data[:8])})")
        # If starts with GIF87a or GIF89a
        if data[:6] in (b'GIF87a', b'GIF89a'):
            try:
                img = Image.open(gf)
                print(f"    REAL GIF: {img.size}, frames={getattr(img, 'n_frames', 1)}")
            except:
                print("    GIF header but failed to open")
        else:
            print(f"    Not a real GIF. Binary: {repr(data[:32])}")

# ============================================================
# 2. LOOK FOR JAVA/SMALI IN EXTRACTED APK
# ============================================================
print("\n" + "=" * 60)
print("2. EXTRACTED APK STRUCTURE")
print("=" * 60)
if EXTRACTED.exists():
    for item in sorted(EXTRACTED.iterdir()):
        if item.is_dir():
            children = list(item.iterdir())
            print(f"  {item.name}/ ({len(children)} items)")
        else:
            print(f"  {item.name}: {item.stat().st_size} bytes")

# Look for source/smali code
smali_dirs = list(EXTRACTED.rglob("smali*"))
print(f"\n  smali dirs: {smali_dirs[:5]}")

java_files = list(EXTRACTED.rglob("*.java"))[:5]
print(f"  .java files: {java_files}")

class_files = list(EXTRACTED.rglob("*.class"))[:5]
print(f"  .class files: {class_files}")

dex_files = list(EXTRACTED.rglob("*.dex"))[:5]
print(f"  .dex files: {dex_files}")

# ============================================================
# 3. LOOK AT WEAPON/CHARA RENDER in actual weapon opt
# ============================================================
print("\n" + "=" * 60)
print("3. WEAPON RENDERING GEOMETRY")
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
            slots[(row, col)] = {'dest_x':dx,'dest_y':dy,'src_x':sx,'src_y':sy,'w':w,'h':h,'canvas_w':cw,'canvas_h':ch}
    return cw, ch, slots

# Render full weapon_14 on 60x60 canvas and save
cw, ch, slots = decode_opt(KA/"weapon"/"weapon_14.opt")
print(f"\n  weapon_14 canvas={cw}x{ch}")
w14 = Image.open(KA/"weapon"/"weapon_14.png").convert("RGBA")
canvas60 = Image.new("RGBA", (60, 60), (0, 0, 0, 0))
for (row, col), s in slots.items():
    region = w14.crop((s['src_x'], s['src_y'], s['src_x']+s['w'], s['src_y']+s['h']))
    canvas60.paste(region, (s['dest_x'], s['dest_y']), region)
# Find bounding box of weapon on 60x60 canvas
bb = canvas60.getbbox()
print(f"  weapon_14 bounding box on 60x60: {bb}")
canvas60_scaled = canvas60.resize((180, 180), Image.NEAREST)
canvas60_scaled.save(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\tmp_weapon14_60x60.png")
print(f"  Saved tmp_weapon14_60x60.png")

# Also render hand for character
cw2, ch2, hand_slots = decode_opt(KA/"hand"/"m_hand_00.opt")
print(f"\n  m_hand_00 canvas={cw2}x{ch2}")
hpng = Image.open(KA/"hand"/"m_hand_00.png").convert("RGBA")
hand_canvases = {}
for row in range(4):
    c = Image.new("RGBA", (24,30), (0,0,0,0))
    for (r,col), s in hand_slots.items():
        if r == row:
            region = hpng.crop((s['src_x'],s['src_y'],s['src_x']+s['w'],s['src_y']+s['h']))
            c.paste(region,(s['dest_x'],s['dest_y']),region)
    hand_canvases[row] = c

# v=0 = right arm, find bounding box
for row in range(4):
    bb2 = hand_canvases[row].getbbox()
    print(f"  hand_00 v={row} bbox: {bb2}")

# ============================================================
# 4. TRY DIFFERENT WEAPON CROP REGIONS
# ============================================================
print("\n" + "=" * 60)
print("4. WEAPON CROP EXPERIMENTS")
print("=" * 60)

# Character hand (v=0, right arm) bbox tells us where on 24x30 the hand is
hand_v0_bb = hand_canvases[0].getbbox()
print(f"  Right arm (v=0) bbox: {hand_v0_bb}")
# Center of grip would be around the hand bbox center
if hand_v0_bb:
    grip_x = (hand_v0_bb[0] + hand_v0_bb[2]) // 2
    grip_y = (hand_v0_bb[1] + hand_v0_bb[3]) // 2
    print(f"  Hand grip center: ({grip_x}, {grip_y})")

# Weapon bottom-of-handle on 60x60 canvas
weapon_bb = canvas60.getbbox()
print(f"  Weapon 60x60 bbox: {weapon_bb}")
# The weapon handle (pole slot): dest=(29,22), size=7x29 → center of handle base = (32, 51)
handle_base_x = 29 + 7//2  # = 32
handle_base_y = 22 + 29    # = 51 (bottom of pole)
print(f"  Weapon pole base (grip point): ({handle_base_x}, {handle_base_y})")

# To align weapon handle base with character hand center:
# weapon_canvas_x + handle_base_x = char_canvas_x + grip_x
# → char_canvas_x - weapon_canvas_x = handle_base_x - grip_x
if hand_v0_bb:
    offset_x = handle_base_x - grip_x  # how much to shift weapon canvas in x
    offset_y = handle_base_y - grip_y
    print(f"  Weapon->char offset: ({offset_x}, {offset_y})")
    print(f"  Crop region from 60x60: ({offset_x}, {offset_y}, {offset_x+24}, {offset_y+30})")

# Try several crops and save
for dx, dy, label in [(18, 18, "center"), (12, 15, "top"), (offset_x if hand_v0_bb else 20, offset_y if hand_v0_bb else 25, "grip")]:
    x0, y0 = max(0,dx), max(0,dy)
    x1, y1 = min(60, dx+24), min(60, dy+30)
    crop = Image.new("RGBA", (24, 30), (0,0,0,0))
    if x1 > x0 and y1 > y0:
        region = canvas60.crop((x0, y0, x1, y1))
        crop.paste(region, (max(0,-dx), max(0,-dy)), region)
    
    # Composite: character + weapon crop
    char = Image.new("RGBA", (24,30), (0,0,0,0))
    char.paste(hand_canvases[0], (0,0), hand_canvases[0])  # right arm
    char.paste(hand_canvases[2], (0,0), hand_canvases[2])  # left arm
    char.paste(crop, (0,0), crop)
    char_scaled = char.resize((192, 240), Image.NEAREST)
    out_path = f"C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/tools/asset_extractor/tmp_weapon_crop_{label}.png"
    char_scaled.save(out_path)
    print(f"  Saved crop_{label}: region from ({dx},{dy}) to ({dx+24},{dy+30})")

# ============================================================
# 5. MAP TILE LAYER SEMANTICS - render test patch
# ============================================================
print("\n" + "=" * 60)
print("5. MAP TILE LAYER TEST")
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
width = 96

# Print 10x10 grid of field[0] values mapped to chip names
print("\n  dev_map_96_96 field[0] grid (top-left 10x10), short names:")
for row in range(10):
    row_str = []
    for col in range(10):
        tile_off = 4 + row * (8 + width * 28) + 8 + col * 28
        f0 = struct.unpack_from('>I', map_data, tile_off)[0]
        f1 = struct.unpack_from('>I', map_data, tile_off+4)[0]
        name = ch_inf.get(f0, str(f0))[:8]  # short name
        row_str.append(f"{name:10s}")
    print(f"  row{row:2d}: {''.join(row_str)}")

print("\n  dev_map_96_96 field[1] grid (top-left 10x10):")
for row in range(10):
    row_str = []
    for col in range(10):
        tile_off = 4 + row * (8 + width * 28) + 8 + col * 28
        f1 = struct.unpack_from('>I', map_data, tile_off+4)[0]
        if f1 == 0xFFFFFFFF:
            name = "(null)"
        else:
            name = ch_inf.get(f1, bld_inf.get(f1, str(f1)))[:8]
        row_str.append(f"{name:10s}")
    print(f"  row{row:2d}: {''.join(row_str)}")

# Look at which field has buildings (values matching building/img.inf range)
print("\n  Searching for building index values in map tiles (first building tile)...")
bld_keys = set(bld_inf.keys())
for row in range(96):
    for col in range(96):
        tile_off = 4 + row * (8 + width * 28) + 8 + col * 28
        for fi in range(7):
            v = struct.unpack_from('>I', map_data, tile_off + fi*4)[0]
            if v != 0xFFFFFFFF and v in bld_keys and ch_inf.get(v) is None:
                # Only in building, not in chip
                print(f"  tile[{row},{col}] field[{fi}]={v} → ONLY building: {bld_inf[v]}")
                # Print all 7 fields
                fields = [struct.unpack_from('>I', map_data, tile_off+f*4)[0] for f in range(7)]
                print(f"    all fields: {fields}")
