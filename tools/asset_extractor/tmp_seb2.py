"""Decode chara .seb files using confirmed format:
No file header. N_LAYERS=14 layers.
Each layer = 20-byte header (10 x uint16 BE) + num_frames x 16-byte frame (8 x uint16 BE).
num_frames comes from file_size / N_LAYERS / (20 + 16*x) — solved per pair of files.
"""
import struct, pathlib

KA = pathlib.Path(r'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets')

LNAME = {0:'shadow',1:'body',2:'foot',3:'shoes',4:'face',5:'mouth',6:'eye',7:'hair',8:'hat',10:'hand',11:'weapon',12:'shield'}

N_LAYERS = 14
LAYER_HDR = 20   # bytes
FRAME_SZ  = 16   # bytes per frame

def decode_seb(path, num_frames):
    data = pathlib.Path(path).read_bytes()
    expected = N_LAYERS * (LAYER_HDR + num_frames * FRAME_SZ)
    print(f"\n=== {pathlib.Path(path).name}  size={len(data)}  expected={expected}  frames={num_frames} ===")
    if len(data) != expected:
        print(f"  SIZE MISMATCH: expected {expected}, got {len(data)}")
        return

    for L in range(N_LAYERS):
        base = L * (LAYER_HDR + num_frames * FRAME_SZ)
        hdr = struct.unpack_from('>10H', data, base)
        # hdr: [v0, v1, v2, v3, v4, v5, v6, v7, canvas_w, canvas_h]
        # OR maybe different layout — let's print all
        cw   = hdr[8]
        ch   = hdr[9]
        # Find the layer type from val0? val1? Try val4 or val0
        # Look for known canvas sizes: shadow=24x30, hair=24x24
        lname = '?'
        if cw == 24 and ch == 30:
            lname = 'shadow/body/hand/foot/shoes/eye? (24x30)'
        elif cw == 24 and ch == 24:
            lname = 'face/hair/hat? (24x24)'

        print(f"\n  Layer {L:2d} (byte {base}): hdr={list(hdr)}  canvas={cw}x{ch}  [{lname}]")

        # Print frames
        for F in range(num_frames):
            fbase = base + LAYER_HDR + F * FRAME_SZ
            fr = struct.unpack_from('>8H', data, fbase)
            # Interpret as signed where needed
            ox = fr[0]-65536 if fr[0]>32767 else fr[0]
            oy = fr[1]-65536 if fr[1]>32767 else fr[1]
            print(f"    frame {F}: [{list(fr)}]  ox={ox} oy={oy}")

# wait_right.seb: 14 layers, 4 frames (confirmed: 14x(20+4x16)=14x84=1176)
decode_seb(KA/'chara'/'wait_right.seb', 4)
