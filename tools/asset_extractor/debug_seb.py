import config, struct as _struct
from pathlib import Path

def _s16(v): return v - 65536 if v > 32767 else v

def parse_seb_full(name, rec_idx=0):
    raw = (config.KA_ASSETS_DIR / "chara" / name).read_bytes()
    u16 = lambda o: _struct.unpack_from(">H", raw, o)[0]
    fc = u16(4); m2 = u16(6)
    ops = []; off = 4
    while off + 20 <= len(raw):
        if u16(off) == fc and u16(off+2) == m2:
            idx = min(rec_idx, max(0, fc - 1))
            roff = off + idx * 20
            if roff + 20 <= len(raw):
                r = _struct.unpack_from(">10H", raw, roff)
                t = r[3]
                if t != 65535 and t <= 13:
                    w, h = _s16(r[6]), _s16(r[7])
                    if w > 0 and h > 0:
                        opt_x = _s16(r[4])
                        opt_y = _s16(r[5])
                        ops.append({"type": t, "u": opt_x // w, "v": opt_y // h, "w": w, "h": h, "ox": _s16(r[8]), "oy": _s16(r[9])})
            off += max(20, fc * 20)
        else:
            off += 2
    return ops

ops = parse_seb_full("wait_right.seb")
print("wait_right.seb ops:")
for op in ops:
    print("  type={} u={} v={} w={} h={} ox={} oy={}".format(
        op["type"], op["u"], op["v"], op["w"], op["h"], op["ox"], op["oy"]))

print()
# Also check what _decode_opt returns for body slot (v=op['v'], u=op['u'])
import sys
sys.path.insert(0, ".")
from pathlib import Path

def decode_opt_simple(opt_path):
    data = Path(opt_path).read_bytes()
    if len(data) < 4: return {}
    _cw, _ch, cols, rows = data[0], data[1], data[2], data[3]
    slots = {}
    pos = 4
    for v in range(rows):
        for u in range(cols):
            if pos >= len(data):
                slots[(v, u)] = {"status": "implicit_empty"}
                continue
            flag = data[pos]
            if flag == 0x00:
                slots[(v, u)] = {"status": "empty"}
                pos += 1
            elif flag == 0x01:
                if pos + 15 <= len(data):
                    dest_x, dest_y, src_x, src_y, width = _struct.unpack_from("<HHHHH", data, pos + 4)
                    height = data[pos + 14]
                    slots[(v, u)] = {"dest_x": dest_x, "dest_y": dest_y, "src_x": src_x, "src_y": src_y, "w": width, "h": height, "status": "filled"}
                    pos += 15
                else:
                    slots[(v, u)] = {"status": "corrupt"}
                    pos = len(data)
            else:
                slots[(v, u)] = {"status": "unknown_{}".format(hex(flag))}
                pos += 1
    return slots

# Check what body op expects and what OPT has
body_op = next(o for o in ops if o["type"] == 1)
print("Body op: u={} v={}".format(body_op["u"], body_op["v"]))
body_slots = decode_opt_simple(config.KA_ASSETS_DIR / "body" / "m_body_00.opt")
key = (body_op["v"], body_op["u"])
print("Looking for slot", key, "->", body_slots.get(key, "MISSING"))
print("Available slots:", list(body_slots.keys()))
