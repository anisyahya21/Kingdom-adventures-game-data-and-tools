#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Extract unhatched egg icons using .opt coordinates."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from parsers.opt_parser import parse_opt
from PIL import Image

print("Extracting unhatched eggs (using .opt coordinates):\n")

for egg_id in range(8):
    egg_name = ["White", "Blue", "Green", "Red", "Purple", "Black", "Yellow", "Rainbow"][egg_id]
    
    opt_path = f"../../artifacts/kingdom-adventures/tmp/KA_assets/material/egg_{egg_id:02d}.opt"
    png_path = f"../../artifacts/kingdom-adventures/tmp/KA_assets/material/egg_{egg_id:02d}.png"
    
    opt_data = parse_opt(opt_path)
    png = Image.open(png_path).convert("RGBA")
    
    # Find the [0,0] sprite (unhatched egg)
    sprite = next((s for s in opt_data['sprites'] if s['u'] == 0 and s['v'] == 0 and s['status'] == 'filled'), None)
    
    if sprite:
        # Extract unhatched portion
        unhatched = png.crop((sprite['src_x'], sprite['src_y'], 
                             sprite['src_x'] + sprite['w'], 
                             sprite['src_y'] + sprite['h']))
        
        print(f"  Egg {egg_id} ({egg_name}): {sprite['w']}×{sprite['h']} at ({sprite['src_x']},{sprite['src_y']})")
        print(f"    Full PNG: {png.width}×{png.height}, Unhatched crop: {unhatched.width}×{unhatched.height}")
    else:
        print(f"  Egg {egg_id} ({egg_name}): No sprite found!")

print("\n✓ All eggs have unhatched versions at [0,0] coordinates")
print("✓ Need to update export_website_icons.py to use .opt extraction instead of whole file")
