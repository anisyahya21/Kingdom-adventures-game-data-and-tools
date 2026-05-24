"""Dump kairolib raw bytes to kairolib.bin for format analysis."""
import sys, struct
sys.path.insert(0, r"C:\Users\anisb\unitypy_pkgs")

import UnityPy
from pathlib import Path

DATA_DIR = Path(r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures\assets\bin\Data")

LOG = open(r"C:\Users\anisb\kairo_analysis.txt", "w", encoding="utf-8")

def log(msg):
    LOG.write(msg + "\n")
    LOG.flush()

def get_raw_bytes(d) -> bytes:
    v = getattr(d, "m_Script", None)
    if v is None: return b""
    if isinstance(v, (bytes, bytearray)): return bytes(v)
    if isinstance(v, str):
        buf = bytearray()
        for ch in v:
            cp = ord(ch)
            if 0xDC80 <= cp <= 0xDCFF:
                buf.append(cp - 0xDC00)
            else:
                buf.extend(ch.encode("utf-8"))
        return bytes(buf)
    return b""

log("Loading...")
env = UnityPy.load(str(DATA_DIR))
log("Done.")

kairolib_bytes = b""
for obj in env.objects:
    if obj.type.name == "TextAsset":
        try:
            d = obj.read()
            nm = getattr(d, "m_Name", None) or getattr(d, "name", "?")
            if nm == "kairolib":
                kairolib_bytes = get_raw_bytes(d)
                log(f"Found kairolib: {len(kairolib_bytes)} bytes")
                break
        except Exception as e:
            pass

if not kairolib_bytes:
    log("ERROR: kairolib not found")
    sys.exit(1)

# Save raw bytes
Path(r"C:\Users\anisb\kairolib.bin").write_bytes(kairolib_bytes)
log("Saved to C:\\Users\\anisb\\kairolib.bin")

# --- Analyze the format ---
def u32be(data, pos):
    return struct.unpack_from(">I", data, pos)[0]

log(f"\nFirst 64 bytes hex:")
log(" ".join(f"{b:02x}" for b in kairolib_bytes[:64]))

# Header
f0 = u32be(kairolib_bytes, 0)
f1 = u32be(kairolib_bytes, 4)
f2 = u32be(kairolib_bytes, 8)
log(f"\nHeader:")
log(f"  [0] = {f0} (0x{f0:08x})")
log(f"  [4] = {f1} (0x{f1:08x})")
log(f"  [8] = {f2} (0x{f2:08x})")

# Scan for PNG magic (89 50 4E 47)
log("\nPNG headers at:")
pos = 0
png_offsets = []
while pos < len(kairolib_bytes) - 4:
    if kairolib_bytes[pos:pos+4] == b'\x89PNG':
        png_offsets.append(pos)
    pos += 1
log(f"  {png_offsets[:30]}")
log(f"  Total PNG headers: {len(png_offsets)}")

# Try to understand structure: if f0=1083, f1=95063, f2=39
# Maybe the first 1083 bytes are the header/TOC, then data follows
log(f"\n--- Testing TOC at offset 12 ---")
# Hypothesis: TOC entries are [4 name_len][name][4 data_offset][4 data_size]
pos = 12
files_toc = []
for i in range(f2):  # f2 = file_count = 39
    if pos + 4 > len(kairolib_bytes): break
    name_len = u32be(kairolib_bytes, pos)
    pos += 4
    if name_len > 256 or pos + name_len > len(kairolib_bytes):
        log(f"  Entry {i}: name_len={name_len} INVALID at pos {pos-4}")
        break
    name = kairolib_bytes[pos:pos+name_len].decode("ascii", errors="replace")
    pos += name_len
    if pos + 8 > len(kairolib_bytes): break
    field1 = u32be(kairolib_bytes, pos)
    field2 = u32be(kairolib_bytes, pos+4)
    pos += 8
    files_toc.append((name, field1, field2))
    log(f"  Entry {i}: '{name}' field1={field1} field2={field2} (at TOC pos {pos-8-name_len-4})")

log(f"\nTOC ended at pos {pos}, remaining file pos: {pos}/{len(kairolib_bytes)}")

# Where does data section start?
# If f0=1083 is the TOC size (including header), data starts at 1083
log(f"\n--- Data section at offset {f0} ---")
data_start = f0
log(f"Bytes at offset {data_start}: " + " ".join(f"{b:02x}" for b in kairolib_bytes[data_start:data_start+32]))

LOG.close()
print("Analysis written to C:\\Users\\anisb\\kairo_analysis.txt")
