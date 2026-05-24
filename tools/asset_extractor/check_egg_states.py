#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check egg sprite structure to find unhatched versions."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from parsers.opt_parser import parse_opt
from PIL import Image

# Check egg_00
egg_opt = parse_opt("../../artifacts/kingdom-adventures/tmp/KA_assets/material/egg_00.opt")
egg_png = Image.open("../../artifacts/kingdom-adventures/tmp/KA_assets/material/egg_00.png")

print("egg_00.opt structure:")
print(f"  Grid: {egg_opt['cols']}x{egg_opt['rows']}")
print(f"  Cell size: {egg_opt['cell_width']}×{egg_opt['cell_height']}")
print(f"  PNG size: {egg_png.width}×{egg_png.height}")
print(f"  Total sprites: {len(egg_opt['sprites'])}")

filled = [s for s in egg_opt['sprites'] if s['status'] == 'filled']
print(f"  Filled sprites: {len(filled)}\n")

print("Sprite details (u, v, src_x, src_y, w, h):")
for s in filled:
    print(f"  [{s['u']},{s['v']}] src=({s['src_x']},{s['src_y']}) size={s['w']}×{s['h']}")

# Visual inspection
print("\nVisual analysis:")
print("  Top row (v=0): Likely UNHATCHED eggs")
print("  Bottom row (v=1): Likely HATCHED eggs (with baby monsters)")
print("\nUnhatched egg should be at u=0, v=0")
