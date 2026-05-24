"""
decrypt_assets.py — XOR-decrypt all KairoGames binary TextAssets and extract
the contained PNG + OPT files into the apk_extracted/ directory.

The game stores all its sprite data in Unity TextAssets encrypted with a
repeating 32-bit XOR key listed in the 'encrypt_key' TextAsset.

Run: python -S decrypt_assets.py
"""
import sys, struct, re, io, shutil
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

# Write all output to a log file to avoid terminal corruption from binary data
_LOG = open(r"C:\Users\anisb\ka_extract_log.txt", "w", encoding="utf-8")
def log(msg: str = "") -> None:
    _LOG.write(msg + "\n")
    _LOG.flush()
# Patch print to go to log file
import builtins
_orig_print = builtins.print
def print(*args, **kwargs):  # noqa: A001
    kwargs.pop("file", None)
    kwargs.pop("flush", None)
    _orig_print(*args, file=_LOG, flush=True, **kwargs)

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")
# Use a path OUTSIDE OneDrive to avoid sync-lock PermissionErrors
OUT_DIR  = Path(r"C:\Users\anisb\ka_extracted")

# ── helpers ──────────────────────────────────────────────────────────────────
def get_name(d) -> str:
    for a in ("m_Name", "name"):
        v = getattr(d, a, None)
        if v: return v
    return "?"

def get_raw_bytes(d) -> bytes:
    v = getattr(d, "m_Script", None)
    if v is None: return b""
    if isinstance(v, bytes): return v
    if isinstance(v, bytearray): return bytes(v)
    if isinstance(v, str):
        # Surrogates: \udcXX → byte 0xXX, others → UTF-8 encoded
        buf = bytearray()
        for ch in v:
            cp = ord(ch)
            if 0xDC80 <= cp <= 0xDCFF:
                buf.append(cp - 0xDC00)
            else:
                buf.extend(ch.encode("utf-8"))
        return bytes(buf)
    return b""

def build_xor_key(key_ints: list[int]) -> bytes:
    """Convert list of u32 little-endian ints to XOR byte key."""
    return b"".join(struct.pack("<I", k) for k in key_ints)

def xor_decrypt(data: bytes, key: bytes) -> bytes:
    kl = len(key)
    return bytes(b ^ key[i % kl] for i, b in enumerate(data))

# ── KairoGames archive parser ─────────────────────────────────────────────────
def parse_kairo_archive(data: bytes, label: str) -> dict[str, bytes]:
    """
    KairoGames binary archive format (confirmed from kairolib.bin).

    Layout:
      [4 BE u32] total_toc_size  — byte offset where data section starts
      [4 BE u32] total_data_size — total bytes in data section
      [4 BE u32] file_count N
      N × [4 name_len][name]           — names section
      N × [4 data_offset]              — cumulative offsets within data section
      N × [4 content_size]             — per-file content size (slot_size − 4)
      zero padding to total_toc_size
    Data section (starts at total_toc_size):
      Each slot: [4 type_code][4 content_size][content_size−4 bytes actual data]
    """
    files: dict[str, bytes] = {}
    pos = 0

    def read_u32():
        nonlocal pos
        v = struct.unpack_from(">I", data, pos)[0]
        pos += 4
        return v

    if len(data) < 12:
        return files

    total_toc_size = read_u32()
    total_data_size = read_u32()
    file_count = read_u32()
    print(f"  [{label}] toc_size={total_toc_size}  data_size={total_data_size}  files={file_count}")

    if file_count > 10000 or total_toc_size > len(data):
        print(f"  [{label}] header looks invalid, skipping")
        return files

    # Parse names section
    names = []
    for i in range(file_count):
        if pos + 4 > len(data):
            break
        name_len = read_u32()
        if name_len > 256 or pos + name_len > len(data):
            print(f"  [{label}] name_len={name_len} invalid at entry {i}")
            break
        name = data[pos:pos+name_len].decode("ascii", errors="replace")
        pos += name_len
        names.append(name)

    if len(names) != file_count:
        print(f"  [{label}] only parsed {len(names)}/{file_count} names")
        return files

    # Parse offset table (cumulative data offsets relative to data section start)
    offsets = []
    for _ in range(file_count):
        offsets.append(read_u32())

    # Parse content-size table
    content_sizes = []
    for _ in range(file_count):
        content_sizes.append(read_u32())

    # Extract files from data section
    data_base = total_toc_size
    for i, name in enumerate(names):
        slot_start = data_base + offsets[i]
        # Slot layout: [4 type_code][4 self_size=content_sizes[i]][self_size-4 bytes actual_data]
        # content_sizes[i] = self_size_field(4) + actual_data_bytes
        # actual data starts at slot_start + 8 (skip type_code + self_size field)
        actual_data_offset = slot_start + 8
        actual_data_size = content_sizes[i] - 4  # exclude the 4-byte self_size field
        if actual_data_offset + actual_data_size > len(data) or actual_data_size < 0:
            print(f"  [{label}] slot {i} ({name!r}) out of bounds, skipping")
            continue
        files[name] = data[actual_data_offset : actual_data_offset + actual_data_size]

    return files

# ── Load all TextAssets ───────────────────────────────────────────────────────
print("Loading DATA_DIR...")
env = UnityPy.load(str(DATA_DIR))
print("Done.\n")

ta_map: dict[str, bytes] = {}
for obj in env.objects:
    if obj.type.name == "TextAsset":
        try:
            d = obj.read()
            nm = get_name(d)
            ta_map[nm] = get_raw_bytes(d)
        except Exception:
            pass

print(f"TextAssets loaded: {len(ta_map)}")

# ── Parse encryption key ──────────────────────────────────────────────────────
raw_key_text = ta_map.get("encrypt_key", b"")
if not raw_key_text:
    print("ERROR: encrypt_key TextAsset not found!")
    sys.exit(1)

key_text = raw_key_text.decode("utf-8", errors="replace").strip()
# Print only first 80 chars to avoid terminal corruption from raw key content
print(f"\nencrypt_key parsed: {len(key_text)} chars")

key_ints = [int(x, 16) for x in re.findall(r"0x[0-9a-fA-F]+", key_text)]
xor_key  = build_xor_key(key_ints)
print(f"XOR key ({len(xor_key)} bytes): {xor_key.hex()}", flush=True)

# ── Save kairolib (unencrypted reference) ─────────────────────────────────────
kairo_raw = ta_map.get("kairolib", b"")
if kairo_raw:
    print(f"\nkairolib (unencrypted), {len(kairo_raw)} bytes:")
    files = parse_kairo_archive(kairo_raw, "kairolib")
    if files:
        out_kairo = OUT_DIR / "kairolib"
        out_kairo.mkdir(parents=True, exist_ok=True)
        saved = 0
        for fname, fdata in files.items():
            safe_parts = [p.replace("\\", "").replace(":", "_") for p in fname.replace("\\", "/").split("/")]
            out_path = out_kairo.joinpath(*safe_parts)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(fdata)
            saved += 1
        print(f"  Saved {saved} files to {out_kairo}")
    print(f"  File list: {list(files.keys())[:10]}")

# ── Decrypt and parse ALL game data assets ────────────────────────────────────
CHAR_ASSETS = [
    # Character layer sprites (previously extracted)
    "chara", "face", "body", "body_ex", "hand", "foot", "shoes",
    "hat", "hair", "eye", "mouth", "shadow", "weapon", "accessory",
    "battle", "monster", "chip", "map", "effect",
    "system", "billing", "gauge", "head",
    # Additional game assets (not yet extracted)
    "airship", "building", "com", "com_2", "connect", "event",
    "expedition", "friend", "fukidashi", "furniture", "gacha", "gadget",
    "game", "game_2", "image_atlas", "language", "lineup", "load",
    "material", "nature", "num", "title", "vehicle", "wall",
    # Other TextAssets (may not be archives — will save as .bin samples if not)
    "snd", "snd_first", "xls", "BillingMode", "filelist",
]

for asset_name in CHAR_ASSETS:
    raw = ta_map.get(asset_name)
    if raw is None or len(raw) == 0:
        continue
    # Decrypt
    decrypted = xor_decrypt(raw, xor_key)
    # Show first 16 decrypted bytes
    head16 = " ".join(f"{b:02x}" for b in decrypted[:16])
    print(f"\n[{asset_name}] encrypted {len(raw):,}b → decrypted head: {head16}")

    # Check for PNG magic in first 32 bytes (unencrypted or embedded)
    if decrypted[:4] == b'\x89PNG':
        print(f"  → starts with PNG magic!")

    # Try parsing as KairoGames archive
    if decrypted[:2] == b'\x00\x00':
        files = parse_kairo_archive(decrypted, asset_name)
        if files:
            # Save extracted files (remove old file/dir with same name first)
            out_asset_dir = OUT_DIR / asset_name
            if out_asset_dir.exists() and out_asset_dir.is_file():
                out_asset_dir.unlink()
            out_asset_dir.mkdir(parents=True, exist_ok=True)
            saved = 0
            for fname, fdata in files.items():
                # Preserve directory structure (e.g. "zh-CN/file.png" → subdir)
                safe_parts = [p.replace("\\", "").replace(":", "_") for p in fname.replace("\\", "/").split("/")]
                out_path = out_asset_dir.joinpath(*safe_parts)
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(fdata)
                saved += 1
            print(f"  Saved {saved} files to {out_asset_dir}")
            print(f"  File list: {list(files.keys())[:15]}")
        else:
            # Save raw decrypted for further analysis
            (OUT_DIR / f"{asset_name}_decrypted.bin").write_bytes(decrypted[:4096])
            print(f"  → Not a simple KairoGames archive (saved 4KB sample)")
    else:
        (OUT_DIR / f"{asset_name}_decrypted.bin").write_bytes(decrypted[:4096])
        print(f"  → First bytes not 00 00 (no zero prefix) — saved 4KB sample")

print("\nDone.")
