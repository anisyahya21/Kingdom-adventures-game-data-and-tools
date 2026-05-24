"""
extract_textassets.py — extract all TextAsset m_Script blobs and analyse them.
Run: python -S extract_textassets.py
"""
import sys, os, re, zlib
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")
OUT_DIR  = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_extracted\textassets")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def get_name(d) -> str:
    for a in ("m_Name", "name"):
        v = getattr(d, a, None)
        if v:
            return v
    return "?"

def get_bytes(d) -> bytes:
    """Get raw bytes from m_Script regardless of encoding."""
    v = getattr(d, "m_Script", None)
    if v is None:
        return b""
    if isinstance(v, bytes):
        return v
    if isinstance(v, bytearray):
        return bytes(v)
    if isinstance(v, str):
        # Encode with surrogatepass to recover binary data
        return v.encode("utf-8", errors="surrogatepass")
    return b""

def sniff(raw: bytes, label: str):
    """Print format analysis for a binary blob."""
    if not raw:
        print(f"  {label}: EMPTY")
        return
    head = raw[:4]
    magic = head.hex()
    # PNG scan
    png_magic = b'\x89PNG\r\n\x1a\n'
    png_offs = [m.start() for m in re.finditer(re.escape(png_magic), raw)]
    # ZIP
    is_zip = head[:2] == b'PK'
    # ZLIB
    is_zlib = head[0] == 0x78 and head[1] in (0x9c, 0xda, 0x01, 0x5e)
    # Text
    is_text = all(b < 128 for b in raw[:64])
    # FSB5 audio
    is_fmod = head == b'FSB5'

    hexdump = " ".join(f"{b:02x}" for b in raw[:32])
    print(f"  {label}: {len(raw):,} bytes  magic={magic}")
    print(f"    hex: {hexdump}")
    if is_zip:   print("    FORMAT: ZIP")
    if is_zlib:  print("    FORMAT: ZLIB compressed")
    if is_fmod:  print("    FORMAT: FMOD SoundBank (FSB5)")
    if png_offs: print(f"    FORMAT: contains {len(png_offs)} PNG headers at {png_offs[:5]}")
    if is_text:  print(f"    FORMAT: plain text, preview: {repr(raw[:80])}")

    # Try zlib decompress
    if is_zlib:
        try:
            dec = zlib.decompress(raw)
            print(f"    ZLIB decoded: {len(dec):,} bytes")
            png_in_dec = [m.start() for m in re.finditer(re.escape(png_magic), dec)]
            if png_in_dec:
                print(f"    → {len(png_in_dec)} PNGs inside after decompress at {png_in_dec[:5]}")
        except Exception as e:
            print(f"    zlib.decompress failed: {e}")

print("Loading entire DATA_DIR (may take ~30s)...")
env = UnityPy.load(str(DATA_DIR))
print("Done loading.\n")

ta_data: dict[str, bytes] = {}

for obj in env.objects:
    if obj.type.name != "TextAsset":
        continue
    try:
        d = obj.read()
        nm = get_name(d)
        raw = get_bytes(d)
        ta_data[nm] = raw
    except Exception as e:
        print(f"  error: {e}")

print(f"Total TextAssets: {len(ta_data)}\n")

# Sort by size descending
for nm, raw in sorted(ta_data.items(), key=lambda x: -len(x[1])):
    sniff(raw, nm)
    # Save to disk
    safe = nm.replace("/","_").replace("\\","_").replace(":","_")
    out_path = OUT_DIR / safe
    out_path.write_bytes(raw)

print(f"\nAll TextAssets written to: {OUT_DIR}")

# Special: look for OPT-like structures (15-byte sprite slot records)
print("\n=== Searching for OPT-like data (0x01 flag + FF FF 00 pattern) ===")
OPT_PATTERN = re.compile(rb'\x01\xff\xff\x00')
for nm, raw in sorted(ta_data.items(), key=lambda x: -len(x[1]))[:10]:
    matches = OPT_PATTERN.findall(raw)
    if matches:
        print(f"  {nm}: {len(matches)} OPT-like patterns")

# Special: look for PNG sprite data in any TextAsset
print("\n=== TextAssets containing PNG headers ===")
PNG = b'\x89PNG\r\n\x1a\n'
for nm, raw in ta_data.items():
    offs = [m.start() for m in re.finditer(re.escape(PNG), raw)]
    if offs:
        print(f"  {nm}: {len(offs)} PNGs at {offs[:5]}")
