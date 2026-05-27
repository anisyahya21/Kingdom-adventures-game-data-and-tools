"""
scan_bundles.py — scan ALL APK bundles and catalogue Texture2D / TextAsset objects.
Run: python -S scan_bundles.py

Outputs two files in the current directory:
  - bundle_scan.json   : { bundle_name: { types, texture_names, text_names } }
  - texture_names.txt  : sorted list of all Texture2D asset names found
  - text_names.txt     : sorted list of all TextAsset names found
"""
import sys, json
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")
OUT_DIR  = Path(__file__).resolve().parent

all_textures: set[str] = set()
all_texts:    set[str] = set()
scan_results: dict     = {}

candidates = sorted(
    [f for f in DATA_DIR.iterdir() if f.is_file() and "." not in f.name],
    key=lambda f: f.stat().st_size
)
print(f"Scanning {len(candidates)} bundles …")

for i, bundle in enumerate(candidates, 1):
    if i % 100 == 0:
        print(f"  {i}/{len(candidates)}  (textures so far: {len(all_textures)}, texts: {len(all_texts)})")
    try:
        env = UnityPy.load(str(bundle))
        tex_names:  list[str] = []
        text_names: list[str] = []
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "Sprite", "TextAsset"):
                try:
                    d = obj.read()
                    name = d.name
                    if obj.type.name in ("Texture2D", "Sprite"):
                        tex_names.append(name)
                        all_textures.add(name)
                    else:
                        text_names.append(name)
                        all_texts.add(name)
                except Exception:
                    pass
        if tex_names or text_names:
            scan_results[bundle.name] = {
                "size": bundle.stat().st_size,
                "textures": tex_names,
                "texts": text_names,
            }
    except Exception as e:
        pass  # skip corrupted / non-Unity files

print(f"\nDone. {len(all_textures)} unique texture names, {len(all_texts)} unique text asset names")
print(f"Bundles with texture/text assets: {len(scan_results)}")

# Write outputs
(OUT_DIR / "bundle_scan.json").write_text(
    json.dumps(scan_results, indent=2, ensure_ascii=False), encoding="utf-8"
)
sorted_tex = sorted(all_textures)
(OUT_DIR / "texture_names.txt").write_text("\n".join(sorted_tex), encoding="utf-8")
sorted_txt = sorted(all_texts)
(OUT_DIR / "text_names.txt").write_text("\n".join(sorted_txt), encoding="utf-8")

print(f"\nWrote bundle_scan.json, texture_names.txt ({len(sorted_tex)} lines), text_names.txt ({len(sorted_txt)} lines)")

# Quick preview: char-related textures
char_kws = ("body","face","hand","foot","shoe","hair","hat","eye","mouth","weapon","shield","shadow","chara","img_m_","img_f_")
char_textures = [t for t in sorted_tex if any(k in t.lower() for k in char_kws)]
print(f"\nCharacter-related textures ({len(char_textures)}):")
for t in char_textures[:60]:
    print(" ", t)
if len(char_textures) > 60:
    print(f"  … and {len(char_textures)-60} more (see texture_names.txt)")
