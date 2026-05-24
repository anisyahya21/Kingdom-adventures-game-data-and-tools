"""
sniff_v2.py — use UnityPy 1.25 correct API to read TextAsset data,
and find companion .resource files.
Run: python -S sniff_v2.py
"""
import sys
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

def dump_obj_attrs(d, max_attrs=30):
    """Print all non-dunder attributes of a read() object."""
    attrs = [a for a in dir(d) if not a.startswith("_")][:max_attrs]
    for a in attrs:
        try:
            v = getattr(d, a)
            if callable(v):
                continue
            sv = repr(v)
            if len(sv) > 80:
                sv = sv[:80] + "…"
            print(f"    .{a} = {sv}")
        except Exception:
            pass

# ── Inspect the battle bundle in detail ─────────────────────────────────────
battle_hash = "486ed3a5352492645937156c1e571b94"
f = DATA_DIR / battle_hash
print(f"=== Battle bundle ({f.stat().st_size:,} bytes) ===")
env = UnityPy.load(str(f))
for obj in env.objects:
    print(f"\nObject type={obj.type.name}  pathId={obj.path_id}")
    try:
        d = obj.read()
        print(f"  Attrs:")
        dump_obj_attrs(d)
        # Try every possible data accessor
        for attr in ("script", "m_Script", "bytes", "data", "text", "m_PathID",
                     "stream_data", "m_StreamData"):
            if hasattr(d, attr):
                v = getattr(d, attr)
                if isinstance(v, (bytes, bytearray, str)):
                    print(f"  [{attr}] size={len(v)}, head={repr(v[:40])}")
                else:
                    print(f"  [{attr}] = {repr(v)[:80]}")
    except Exception as e:
        print(f"  read error: {e}")

# ── Check if companion .resource files exist ─────────────────────────────────
print("\n=== Looking for companion .resource files ===")
all_files = list(DATA_DIR.iterdir())
resource_files = [f for f in all_files if f.suffix == ".resource"]
split_files    = [f for f in all_files if ".split" in f.name]
print(f"  .resource files: {len(resource_files)}")
for r in resource_files:
    print(f"    {r.name}  {r.stat().st_size:,}")
print(f"  .split files: {len(split_files)}")
for s in split_files[:10]:
    print(f"    {s.name}  {s.stat().st_size:,}")

# ── Load battle bundle with its folder path so UnityPy resolves externals ──
print("\n=== Load battle bundle via load() with DATA_DIR for external resolution ===")
# UnityPy's load() can take a directory path to auto-resolve .resource files
env2 = UnityPy.load(str(DATA_DIR))  # load entire folder - may take a moment
# Just get TextAsset names quickly
ta_count = 0
ta_sizes = []
for obj in env2.objects:
    if obj.type.name == "TextAsset":
        ta_count += 1
        try:
            d = obj.read()
            nm = getattr(d, "m_Name", "") or getattr(d, "name", "") or "?"
            raw = getattr(d, "script", b"") or b""
            if isinstance(raw, str):
                raw = raw.encode()
            ta_sizes.append((nm, len(raw)))
        except Exception as e:
            ta_sizes.append(("?err", 0))

print(f"  TextAssets found loading entire DATA_DIR: {ta_count}")
for nm, sz in sorted(ta_sizes, key=lambda x: -x[1])[:20]:
    print(f"    {nm!r}: {sz:,} bytes")
