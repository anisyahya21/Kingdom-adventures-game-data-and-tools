"""
sniff_binary.py — sniff the large binary TextAssets and .resource file.
Run: python -S sniff_binary.py
"""
import sys, struct
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

def hexdump(data, n=128):
    """Print a hex dump of first n bytes."""
    for i in range(0, min(n, len(data)), 16):
        chunk = data[i:i+16]
        hex_part  = " ".join(f"{b:02x}" for b in chunk)
        text_part = "".join(chr(b) if 32<=b<127 else "." for b in chunk)
        print(f"  {i:04x}: {hex_part:<47}  {text_part}")

def read_textasset(bundle_path):
    """Extract raw bytes from a TextAsset bundle."""
    env = UnityPy.load(str(bundle_path))
    for obj in env.objects:
        if obj.type.name == "TextAsset":
            d = obj.read()
            nm = getattr(d, "m_Name", "") or getattr(d, "name", "") or "?"
            raw = d.script if hasattr(d, "script") else b""
            if isinstance(raw, str):
                raw = raw.encode("utf-8", "replace")
            return nm, raw
    return "?", b""

# ── TextAssets ───────────────────────────────────────────────────────────────
text_bundles = [
    ("battle",   "486ed3a5352492645937156c1e571b94"),
    ("map",      "c08112147e7e6cd4daf01ac022a7a351"),
    ("com",      "42c2fdf032a13414e8ce8c0b4d012896"),
    ("language", "915a0a549d50f964ab61a016b8baba99"),
    ("title",    "ecda091e3775040108c842dc129847d4"),
    ("xls",      "e2048166485ed4188bb8b9c57ce4d831"),
    ("weapon",   "7f2f8c366e784274eaa189068b61faff"),
]

for label, bhash in text_bundles:
    f = DATA_DIR / bhash
    if not f.exists():
        print(f"\n[{label}] NOT FOUND")
        continue
    nm, raw = read_textasset(f)
    print(f"\n[{label}] bundle={bhash[:8]}…  name={nm!r}  size={len(raw):,} bytes")
    if raw:
        hexdump(raw, 64)
        # Try to detect format
        magic4 = raw[:4]
        if magic4 == b'PK\x03\x04':
            print("  FORMAT: ZIP archive")
        elif magic4[:2] == b'\xff\xd8':
            print("  FORMAT: JPEG")
        elif magic4 == b'\x89PNG':
            print("  FORMAT: PNG")
        elif raw[:2] == b'BM':
            print("  FORMAT: BMP")
        elif magic4 == b'RIFF':
            print("  FORMAT: RIFF/WAV")
        elif raw[:3] == b'\xef\xbb\xbf' or all(b < 128 for b in raw[:16]):
            print("  FORMAT: text/UTF-8")
        else:
            print(f"  FORMAT: binary (unknown), magic={magic4.hex()}")

# ── .resource file ───────────────────────────────────────────────────────────
res_file = DATA_DIR / "6a7a6b2d6a49d2f47b34852e146a7acd.resource"
if res_file.exists():
    raw = res_file.read_bytes()
    print(f"\n[.resource] {res_file.name}  size={len(raw):,}")
    hexdump(raw, 128)
    # Scan for PNG headers inside
    import re
    png_magic = b'\x89PNG\r\n\x1a\n'
    offsets = [m.start() for m in re.finditer(re.escape(png_magic), raw)]
    print(f"  PNG headers found at offsets: {offsets[:10]}")
    jpeg_magic = b'\xff\xd8\xff'
    offsets2 = [m.start() for m in re.finditer(re.escape(jpeg_magic), raw)]
    print(f"  JPEG headers found at offsets: {offsets2[:10]}")
