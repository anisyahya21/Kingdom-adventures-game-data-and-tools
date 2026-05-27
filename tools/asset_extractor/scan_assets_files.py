"""
scan_assets_files.py — probe sharedassets0.assets, globalgamemanagers.assets,
and a sample of the hash bundles to see ALL object types present.
Run: python -S scan_assets_files.py
"""
import sys, json
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path
from collections import Counter

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

# Files to probe
named_files = [
    DATA_DIR / "sharedassets0.assets",
    DATA_DIR / "globalgamemanagers.assets",
    DATA_DIR / "level0",
]

print("=== Named asset files ===")
for f in named_files:
    if not f.exists():
        print(f"{f.name}: NOT FOUND")
        continue
    print(f"\n{f.name}  ({f.stat().st_size:,} bytes)")
    try:
        env = UnityPy.load(str(f))
        counts = Counter(obj.type.name for obj in env.objects)
        for t, c in counts.most_common(20):
            print(f"  {t}: {c}")
        # Sample a few Texture2D / TextAsset names
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "TextAsset", "Sprite"):
                try:
                    d = obj.read()
                    print(f"  --> [{obj.type.name}] {d.name}")
                except Exception as e:
                    print(f"  --> [{obj.type.name}] read error: {e}")
    except Exception as e:
        print(f"  ERROR: {e}")

# Sample largest hash-named bundles
print("\n\n=== Largest hash-named bundles (top 5) ===")
bundles = sorted(
    [f for f in DATA_DIR.iterdir() if f.is_file() and "." not in f.name],
    key=lambda f: f.stat().st_size, reverse=True
)
for bundle in bundles[:5]:
    print(f"\n{bundle.name}  ({bundle.stat().st_size:,} bytes)")
    try:
        env = UnityPy.load(str(bundle))
        counts = Counter(obj.type.name for obj in env.objects)
        for t, c in counts.most_common(10):
            print(f"  {t}: {c}")
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "TextAsset", "Sprite"):
                try:
                    d = obj.read()
                    print(f"  --> [{obj.type.name}] {d.name}")
                except Exception as e:
                    print(f"  --> read error: {e}")
    except Exception as e:
        print(f"  ERROR: {e}")

# Check assets directory above Data/ for other files
print("\n\n=== assets/ directory (above bin/Data/) ===")
assets_dir = DATA_DIR.parent.parent  # .../apk kingdom adventures/assets/
if assets_dir.name == "assets":
    for item in sorted(assets_dir.rglob("*"), key=lambda p: p.stat().st_size if p.is_file() else 0, reverse=True)[:20]:
        if item.is_file():
            print(f"  {item.relative_to(assets_dir.parent)}  {item.stat().st_size:,}")
