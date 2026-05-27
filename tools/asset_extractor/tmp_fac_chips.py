import csv; from pathlib import Path
import sys; sys.path.insert(0, '.')
import config
from parsers.inf_parser import parse_img_inf

b_inf = parse_img_inf(config.KA_ASSETS_DIR / 'building' / 'img.inf')

# Parse facility CSV: chips[] starts at col 24
with open(config.CSV_FACILITY, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    rows = list(reader)

print("Facilities with distinct chip values (col 24-27):")
for r in rows[3:]:
    if not r or not r[0].strip() or not r[0].strip().isdigit():
        continue
    fid = int(r[0])
    name = r[1] if len(r) > 1 else '?'
    chips = []
    for c in range(24, 28):
        v = r[c].strip() if c < len(r) else ''
        if v and v not in ('', '0', '-1'):
            chips.append((c, int(v)))
        elif v == '0':
            chips.append((c, 0))
    
    # Only show facilities with a non-(-1) chip
    non_neg = [(col, v) for col, v in chips if v >= 0]
    if non_neg:
        chip_names = [b_inf.get(v, f'?[{v}]') for _, v in non_neg[:4]]
        print(f"  [{fid:4d}] {name:<35s} chips={[v for _,v in non_neg]} → {chip_names}")
