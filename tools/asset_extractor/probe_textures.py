"""
probe_textures.py — find and dump character sprite names from APK bundles.
UnityPy 1.25 uses .m_Name (not .name) on read() objects.
Run: python -S probe_textures.py
"""
import sys, json
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path
from collections import Counter

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

def get_name(data) -> str:
    """Safely get asset name regardless of API version."""
    for attr in ("m_Name", "name"):
        try:
            return getattr(data, attr)
        except AttributeError:
            pass
    return "<unknown>"

def scan_file(path: Path):
    env = UnityPy.load(str(path))
    results = {"textures": [], "texts": [], "all_types": Counter()}
    for obj in env.objects:
        results["all_types"][obj.type.name] += 1
        if obj.type.name in ("Texture2D", "Sprite", "TextAsset"):
            try:
                d = obj.read()
                nm = get_name(d)
                if obj.type.name == "TextAsset":
                    results["texts"].append(nm)
                else:
                    results["textures"].append(nm)
            except Exception as e:
                pass
    return results

# ── probe the 5 largest bundles ──────────────────────────────────────────────
bundles = sorted(
    [f for f in DATA_DIR.iterdir() if f.is_file() and "." not in f.name],
    key=lambda f: f.stat().st_size, reverse=True
)

print(f"Probing top 10 largest bundles out of {len(bundles)}...\n")
for bundle in bundles[:10]:
    r = scan_file(bundle)
    if r["textures"] or r["texts"]:
        print(f"{bundle.name}  ({bundle.stat().st_size:,} bytes)")
        print(f"  types: {dict(r['all_types'].most_common(5))}")
        print(f"  textures: {r['textures'][:10]}")
        print(f"  texts:    {r['texts'][:10]}")
        print()

# ── also check the big TextAsset bundle ──────────────────────────────────────
big_text = DATA_DIR / "e2048166485ed4188bb8b9c57ce4d831"
if big_text.exists():
    print(f"\n=== Big TextAsset bundle ({big_text.stat().st_size:,} bytes) ===")
    env = UnityPy.load(str(big_text))
    for obj in env.objects:
        if obj.type.name == "TextAsset":
            try:
                d = obj.read()
                nm = get_name(d)
                raw = d.script if hasattr(d, "script") else b""
                if isinstance(raw, (bytes, bytearray)):
                    preview = raw[:200].decode("utf-8", errors="replace")
                else:
                    preview = str(raw)[:200]
                print(f"  Name: {nm}")
                print(f"  Size: {len(raw) if isinstance(raw, (bytes,bytearray)) else '?'} bytes")
                print(f"  Preview: {repr(preview[:100])}")
            except Exception as e:
                print(f"  read error: {e}")

# ── scan ALL bundles and tally Texture2D count ────────────────────────────────
print("\n\n=== Full scan: bundles containing Texture2D ===")
tex_bundles = []
text_bundles = []
for bundle in bundles:
    try:
        env = UnityPy.load(str(bundle))
        has_tex = False
        has_txt = False
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "Sprite"):
                has_tex = True
            elif obj.type.name == "TextAsset":
                has_txt = True
        if has_tex:
            tex_bundles.append(bundle)
        if has_txt:
            text_bundles.append(bundle)
    except Exception:
        pass

print(f"Bundles with Texture2D/Sprite: {len(tex_bundles)}")
for b in tex_bundles[:20]:
    print(f"  {b.name}  {b.stat().st_size:,}")

print(f"\nBundles with TextAsset: {len(text_bundles)}")
for b in text_bundles[:20]:
    print(f"  {b.name}  {b.stat().st_size:,}")
