"""
test_unitypy.py — probe one APK bundle with UnityPy and list asset types found.
Run with:
  python -S -c "import sys; sys.path.insert(0,'C:/Users/anisb/unitypy_pkgs'); exec(open('test_unitypy.py').read())"
Or just:
  python test_unitypy.py   (if UnityPy is on sys.path already)
"""
import sys, os
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path
from collections import Counter

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

# ── pick one medium-sized hash-named bundle ──────────────────────────────────
candidates = sorted(
    [f for f in DATA_DIR.iterdir() if f.is_file() and "." not in f.name],
    key=lambda f: f.stat().st_size
)
print(f"Total hash-named bundles: {len(candidates)}")
if not candidates:
    print("No bundles found — check DATA_DIR path")
    sys.exit(1)

# pick the median-size bundle
test_file = candidates[len(candidates) // 2]
print(f"\nTesting bundle: {test_file.name}  ({test_file.stat().st_size:,} bytes)")

env = UnityPy.load(str(test_file))
type_counts: Counter = Counter()
names: list[str] = []

for obj in env.objects:
    type_counts[obj.type.name] += 1
    if obj.type.name in ("Texture2D", "Sprite", "TextAsset"):
        try:
            data = obj.read()
            names.append(f"  [{obj.type.name}] {data.name}")
        except Exception as e:
            names.append(f"  [{obj.type.name}] <read error: {e}>")

print("\nAsset type counts:")
for t, c in type_counts.most_common():
    print(f"  {t}: {c}")

print("\nTextAsset / Texture2D / Sprite names:")
for n in names[:40]:
    print(n)
if len(names) > 40:
    print(f"  ... and {len(names)-40} more")
