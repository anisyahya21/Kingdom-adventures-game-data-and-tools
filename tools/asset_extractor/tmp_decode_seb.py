import struct
from pathlib import Path
KA = Path(r'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp\KA_assets')

def decode(path):
    data = Path(path).read_bytes()
    n = (len(data) - 8) // 22
    entries = []
    for i in range(n):
        off = 8 + i * 22
        e = data[off:off+22]
        u16s = [struct.unpack_from('>H', e, j*2)[0] for j in range(11)]
        ox = struct.unpack_from('>h', e, 12)[0]
        oy = struct.unpack_from('>h', e, 14)[0]
        entries.append({'layer':u16s[0],'img':u16s[1],'canvas_w':u16s[4],'canvas_h':u16s[5],'offset_x':ox,'offset_y':oy,'state':u16s[8],'col':u16s[9],'row':u16s[10]})
    return entries

for fname in ['equip_wait_right.seb','equip_walk_right.seb','wait_right.seb','walk_right.seb']:
    entries = decode(KA/'chara'/fname)
    print('\n=== ' + fname + ' (' + str(len(entries)) + ' entries) ===')
    for e in entries:
        if e['layer'] in (11, 12):
            print('  layer=' + str(e['layer']) + ' img=' + str(e['img']) + ' cw=' + str(e['canvas_w']) + ' ch=' + str(e['canvas_h']) + ' off=(' + str(e['offset_x']) + ',' + str(e['offset_y']) + ') st=' + str(e['state']) + ' col=' + str(e['col']))
    # Print ALL unique layers
    by_layer = {}
    for e in entries:
        by_layer.setdefault(e['layer'], set()).add((e['offset_x'], e['offset_y']))
    for l in sorted(by_layer.keys()):
        print('  layer=' + str(l).rjust(4) + '  offsets=' + str(by_layer[l]))

# Also check chara/img.inf
print('\n=== chara/img.inf ===')
inf = (KA/'chara'/'img.inf').read_text(encoding='ascii', errors='replace')
print(inf[:1500])
