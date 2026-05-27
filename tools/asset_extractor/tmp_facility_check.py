import sys; from pathlib import Path; sys.path.insert(0, '.')
import config; from parsers.inf_parser import parse_img_inf

b_inf = parse_img_inf(config.KA_ASSETS_DIR / 'building' / 'img.inf')
print('building/img.inf:')
for k, v in sorted(b_inf.items())[:30]:
    p = config.KA_ASSETS_DIR / 'building' / v
    print(f'  [{k:3d}] {v} exists={p.exists()}')
print(f'  ... total {len(b_inf)} entries')

# Check config for facility CSV
print()
print('Config attributes:', [a for a in dir(config) if 'FAC' in a.upper() or 'BUILD' in a.upper()])

# Check the data CSV directory
csv_dir = config.CSV_DIR_RESEARCH
print('CSV files:', [f.name for f in csv_dir.glob('*.csv') if 'facil' in f.name.lower() or 'build' in f.name.lower()])
print('All CSVs:', [f.name for f in csv_dir.glob('*.csv')])
