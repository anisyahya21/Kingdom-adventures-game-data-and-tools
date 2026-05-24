import struct, pathlib
KA = pathlib.Path(r'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets')

# Layer name map
LNAME = {0:'shadow',1:'body',2:'foot',3:'shoes',4:'face',5:'mouth',6:'eye',7:'hair',8:'hat',10:'hand',11:'weapon',12:'shield'}

def parse_seb(path, label):
    data = path.read_bytes()
    print(f"\n=== {label} ({len(data)} bytes) ===")
    print(f"First 8 bytes: {' '.join(f'{b:02x}' for b in data[:8])}")
    print(f"  as uint16 BE pairs: {struct.unpack_from('>HHHH', data)}")

    # Try entry size 6 (3 x uint16 BE) — no header
    n6 = len(data) // 6
    print(f"\n-- 6-byte entries (x{n6}), no header --")
    for i in range(min(20, n6)):
        a,b,c = struct.unpack_from('>HHH', data, i*6)
        aS = a-65536 if a>32767 else a
        bS = b-65536 if b>32767 else b
        cS = c-65536 if c>32767 else c
        if a < 20:  # plausible layer index
            lname = LNAME.get(a, str(a))
            print(f"  [{i:3d}] {a:5d}({lname:6s}) b={bS:5d} c={cS:5d}")

    # Try entry size 8 (4 x uint16 BE) — no header
    n8 = len(data) // 8
    print(f"\n-- 8-byte entries (x{n8}), no header --")
    for i in range(min(20, n8)):
        a,b,c,d = struct.unpack_from('>HHHH', data, i*8)
        aS = a-65536 if a>32767 else a
        bS = b-65536 if b>32767 else b
        if a < 20:
            lname = LNAME.get(a, str(a))
            print(f"  [{i:3d}] layer={a}({lname:6s}) img={b:3d} ox={c-65536 if c>32767 else c:4d} oy={d-65536 if d>32767 else d:4d}")

    # Try: 8-byte header, then 6-byte entries
    n6h = (len(data)-8) // 6
    print(f"\n-- 6-byte entries (x{n6h}), 8-byte header --")
    for i in range(min(20, n6h)):
        a,b,c = struct.unpack_from('>HHH', data, 8 + i*6)
        if a < 20:
            lname = LNAME.get(a, str(a))
            print(f"  [{i:3d}] layer={a}({lname:6s}) b={b-65536 if b>32767 else b:5d} c={c-65536 if c>32767 else c:5d}")

    # Try: 8-byte header, then 8-byte entries
    n8h = (len(data)-8) // 8
    print(f"\n-- 8-byte entries (x{n8h}), 8-byte header --")
    for i in range(min(20, n8h)):
        a,b,c,d = struct.unpack_from('>HHHH', data, 8 + i*8)
        if a < 20:
            lname = LNAME.get(a, str(a))
            print(f"  [{i:3d}] layer={a}({lname:6s}) img={b:3d} ox={c-65536 if c>32767 else c:4d} oy={d-65536 if d>32767 else d:4d}")

parse_seb(KA/'chip'/'chip00.seb', 'chip00.seb')
parse_seb(KA/'chara'/'wait_right.seb', 'wait_right.seb')
parse_seb(KA/'chara'/'walk_right.seb', 'walk_right.seb')
