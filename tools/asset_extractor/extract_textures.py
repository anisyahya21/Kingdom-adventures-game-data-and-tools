"""
extract_textures.py — extract all Texture2D images from the APK bundles,
and sniff TextAsset binary content to identify format.
Run: python -S extract_textures.py
"""
import sys, os
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path
from collections import Counter

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")
OUT_DIR  = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_extracted")
OUT_TEX  = OUT_DIR / "textures"
OUT_TXT  = OUT_DIR / "textassets"
OUT_TEX.mkdir(parents=True, exist_ok=True)
OUT_TXT.mkdir(parents=True, exist_ok=True)

def get_name(data) -> str:
    for attr in ("m_Name", "name"):
        try:
            v = getattr(data, attr)
            if v:
                return v
        except AttributeError:
            pass
    return ""

# ── Extract all Texture2D as PNG ─────────────────────────────────────────────
print("=== Extracting Texture2D images ===")
tex_count = 0
bundles = [f for f in DATA_DIR.iterdir() if f.is_file()]  # include named .assets too

for bundle in sorted(bundles, key=lambda f: f.stat().st_size, reverse=True):
    try:
        env = UnityPy.load(str(bundle))
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "Sprite"):
                try:
                    d = obj.read()
                    nm = get_name(d)
                    if not nm:
                        nm = f"unnamed_{tex_count}"
                    # Sanitize name for filesystem
                    safe = nm.replace("/", "_").replace("\\", "_")
                    out_path = OUT_TEX / f"{safe}.png"
                    # For Texture2D get image; for Sprite get the cropped image
                    if obj.type.name == "Texture2D":
                        img = d.image
                    else:
                        img = d.image
                    if img is not None:
                        img.save(str(out_path))
                        print(f"  [{obj.type.name}] {nm}  {img.size}  → {out_path.name}")
                        tex_count += 1
                except Exception as e:
                    print(f"  texture error in {bundle.name}: {e}")
    except Exception:
        pass

print(f"\nTotal textures saved: {tex_count}")

# ── Read TextAssets and sniff format ─────────────────────────────────────────
print("\n=== TextAsset sniff ===")
for bundle in sorted(bundles, key=lambda f: f.stat().st_size, reverse=True):
    try:
        env = UnityPy.load(str(bundle))
        for obj in env.objects:
            if obj.type.name == "TextAsset":
                try:
                    d = obj.read()
                    nm = get_name(d)
                    raw = d.script if hasattr(d, "script") else b""
                    size = len(raw) if isinstance(raw, (bytes, bytearray)) else 0
                    if size == 0:
                        print(f"  {nm}: EMPTY")
                        continue
                    # Sniff
                    if isinstance(raw, str):
                        raw = raw.encode("utf-8", "replace")
                    head = raw[:16]
                    is_text = all(b < 128 or b in (9,10,13) for b in head)
                    magic = head[:4].hex()
                    preview = raw[:80].decode("utf-8", errors="replace").replace("\n", "↵")
                    # Save raw to file
                    safe = nm.replace("/","_").replace("\\","_") if nm else f"unnamed_{bundle.name}"
                    ext = ".txt" if is_text else ".bin"
                    (OUT_TXT / f"{safe}{ext}").write_bytes(raw)
                    print(f"  {nm}: {size:,}b  magic={magic}  text={is_text}")
                    print(f"    preview: {repr(preview[:80])}")
                except Exception as e:
                    print(f"  text error in {bundle.name}: {e}")
    except Exception:
        pass
