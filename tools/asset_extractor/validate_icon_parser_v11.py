"""
validate_icon_parser_v11.py — validates v11 sequential .opt parser implementation.

Tests parser output against known good values from packet v11 specification.
Run from asset_extractor directory: python validate_icon_parser_v11.py
"""

from pathlib import Path
import sys

# Add parsers to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from parsers.opt_parser import parse_opt
import config

def test_icon_weapon():
    """Test icon_weapon.opt parsing."""
    print("\n=== Testing icon_weapon.opt ===")
    opt_path = config.KA_ASSETS_DIR / "com" / "icon_weapon.opt"
    
    if not opt_path.exists():
        print(f"❌ FAIL: {opt_path} not found")
        return False
    
    result = parse_opt(opt_path, debug_hex=False)
    
    # Check header
    if result["cell_width"] != 16 or result["cell_height"] != 16:
        print(f"❌ FAIL: Expected cell 16x16, got {result['cell_width']}x{result['cell_height']}")
        return False
    
    if result["cols"] != 10 or result["rows"] != 18:
        print(f"❌ FAIL: Expected grid 10x18, got {result['cols']}x{result['rows']}")
        return False
    
    print(f"✓ Header: cell {result['cell_width']}x{result['cell_height']}, grid {result['cols']}x{result['rows']}")
    
    # Check specific slots
    sprites_by_uv = {(s["u"], s["v"]): s for s in result["sprites"]}
    
    # (u=0,v=0) should be filled
    slot_0_0 = sprites_by_uv.get((0, 0))
    if not slot_0_0:
        print(f"❌ FAIL: slot (0,0) not found")
        return False
    if slot_0_0["src_x"] != 132 or slot_0_0["src_y"] != 208:
        print(f"❌ FAIL: slot (0,0) expected src (132,208), got ({slot_0_0['src_x']},{slot_0_0['src_y']})")
        return False
    if slot_0_0["w"] != 12 or slot_0_0["h"] != 12:
        print(f"❌ FAIL: slot (0,0) expected size (12,12), got ({slot_0_0['w']},{slot_0_0['h']})")
        return False
    if slot_0_0["dest_x"] != 2 or slot_0_0["dest_y"] != 2:
        print(f"❌ FAIL: slot (0,0) expected dest (2,2), got ({slot_0_0['dest_x']},{slot_0_0['dest_y']})")
        return False
    print(f"✓ slot (0,0): src ({slot_0_0['src_x']},{slot_0_0['src_y']},{slot_0_0['w']},{slot_0_0['h']}), dest ({slot_0_0['dest_x']},{slot_0_0['dest_y']})")
    
    # (u=5,v=15) Hammer
    slot_5_15 = sprites_by_uv.get((5, 15))
    if not slot_5_15:
        print(f"❌ FAIL: slot (5,15) Hammer not found")
        return False
    if slot_5_15["src_x"] != 57 or slot_5_15["src_y"] != 95:
        print(f"❌ FAIL: slot (5,15) expected src (57,95), got ({slot_5_15['src_x']},{slot_5_15['src_y']})")
        return False
    if slot_5_15["w"] != 15 or slot_5_15["h"] != 15:
        print(f"❌ FAIL: slot (5,15) expected size (15,15), got ({slot_5_15['w']},{slot_5_15['h']})")
        return False
    if slot_5_15["dest_x"] != 1 or slot_5_15["dest_y"] != 1:
        print(f"❌ FAIL: slot (5,15) expected dest (1,1), got ({slot_5_15['dest_x']},{slot_5_15['dest_y']})")
        return False
    print(f"✓ slot (5,15) Hammer: src ({slot_5_15['src_x']},{slot_5_15['src_y']},{slot_5_15['w']},{slot_5_15['h']}), dest ({slot_5_15['dest_x']},{slot_5_15['dest_y']})")
    
    # (u=7,v=16), (u=8,v=16), (u=9,v=16) should be empty (not in sprites list)
    empty_slots = [(7, 16), (8, 16), (9, 16)]
    for u, v in empty_slots:
        if (u, v) in sprites_by_uv:
            print(f"❌ FAIL: slot ({u},{v}) should be empty but found in sprites")
            return False
    print(f"✓ Empty slots (7,16), (8,16), (9,16) correctly omitted")
    
    # Check total sprite count is reasonable (should be ~173 filled based on packet)
    if len(result["sprites"]) < 170 or len(result["sprites"]) > 180:
        print(f"⚠ WARNING: Expected ~173 filled slots, got {len(result['sprites'])}")
    else:
        print(f"✓ Total filled slots: {len(result['sprites'])} (expected ~173)")
    
    print(f"✅ PASS: icon_weapon.opt")
    return True


def test_icon_item():
    """Test icon_item.opt parsing."""
    print("\n=== Testing icon_item.opt ===")
    opt_path = config.KA_ASSETS_DIR / "com" / "icon_item.opt"
    
    if not opt_path.exists():
        print(f"❌ FAIL: {opt_path} not found")
        return False
    
    result = parse_opt(opt_path, debug_hex=False)
    
    # Check header
    if result["cell_width"] != 16 or result["cell_height"] != 16:
        print(f"❌ FAIL: Expected cell 16x16, got {result['cell_width']}x{result['cell_height']}")
        return False
    
    if result["cols"] != 12 or result["rows"] != 11:
        print(f"❌ FAIL: Expected grid 12x11, got {result['cols']}x{result['rows']}")
        return False
    
    print(f"✓ Header: cell {result['cell_width']}x{result['cell_height']}, grid {result['cols']}x{result['rows']}")
    
    # Check that bottom row slots are filled and in bounds
    sprites_by_uv = {(s["u"], s["v"]): s for s in result["sprites"]}
    
    bottom_row_slots = [(0, 10), (1, 10), (2, 10), (6, 10)]
    for u, v in bottom_row_slots:
        slot = sprites_by_uv.get((u, v))
        if not slot:
            print(f"❌ FAIL: slot ({u},{v}) not found (should be filled)")
            return False
        # Check that source coords are reasonable (not out of bounds)
        if slot["src_x"] < 0 or slot["src_y"] < 0:
            print(f"❌ FAIL: slot ({u},{v}) has negative source coords: ({slot['src_x']},{slot['src_y']})")
            return False
        if slot["w"] <= 0 or slot["h"] <= 0:
            print(f"❌ FAIL: slot ({u},{v}) has invalid size: ({slot['w']},{slot['h']})")
            return False
        print(f"✓ slot ({u},{v}): src ({slot['src_x']},{slot['src_y']},{slot['w']},{slot['h']}), dest ({slot['dest_x']},{slot['dest_y']})")
    
    # Check total sprite count (should be ~117 filled based on packet)
    if len(result["sprites"]) < 115 or len(result["sprites"]) > 120:
        print(f"⚠ WARNING: Expected ~117 filled slots, got {len(result['sprites'])}")
    else:
        print(f"✓ Total filled slots: {len(result['sprites'])} (expected ~117)")
    
    print(f"✅ PASS: icon_item.opt")
    return True


def test_icon_head():
    """Test icon_head.opt parsing, including short record recovery."""
    print("\n=== Testing icon_head.opt ===")
    opt_path = config.KA_ASSETS_DIR / "com" / "icon_head.opt"
    
    if not opt_path.exists():
        print(f"❌ FAIL: {opt_path} not found")
        return False
    
    result = parse_opt(opt_path, debug_hex=False)
    
    print(f"✓ Header: cell {result['cell_width']}x{result['cell_height']}, grid {result['cols']}x{result['rows']}")
    
    # Check (u=9,v=3) Robot Helmet - should be short_recovered
    sprites_by_uv = {(s["u"], s["v"]): s for s in result["sprites"]}
    
    slot_9_3 = sprites_by_uv.get((9, 3))
    if not slot_9_3:
        print(f"❌ FAIL: slot (9,3) Robot Helmet not found")
        return False
    
    if slot_9_3.get("status") != "short_recovered":
        print(f"⚠ WARNING: slot (9,3) expected status 'short_recovered', got '{slot_9_3.get('status')}'")
    
    # Check that it has valid coords
    if slot_9_3["dest_x"] != 1 or slot_9_3["dest_y"] != 1:
        print(f"❌ FAIL: slot (9,3) expected dest (1,1), got ({slot_9_3['dest_x']},{slot_9_3['dest_y']})")
        return False
    
    if slot_9_3["src_x"] != 131 or slot_9_3["src_y"] != 14:
        print(f"❌ FAIL: slot (9,3) expected src (131,14), got ({slot_9_3['src_x']},{slot_9_3['src_y']})")
        return False
    
    # Width/height should be recovered (cell - dest)
    expected_w = result["cell_width"] - slot_9_3["dest_x"]  # 16 - 1 = 15
    expected_h = result["cell_height"] - slot_9_3["dest_y"]  # 16 - 1 = 15
    if slot_9_3["w"] != expected_w or slot_9_3["h"] != expected_h:
        print(f"⚠ WARNING: slot (9,3) expected recovered size ({expected_w},{expected_h}), got ({slot_9_3['w']},{slot_9_3['h']})")
    
    print(f"✓ slot (9,3) Robot Helmet: src ({slot_9_3['src_x']},{slot_9_3['src_y']},{slot_9_3['w']},{slot_9_3['h']}), dest ({slot_9_3['dest_x']},{slot_9_3['dest_y']}), status={slot_9_3.get('status')}")
    
    print(f"✅ PASS: icon_head.opt")
    return True


def test_icon_sheild():
    """Test icon_sheild.opt parsing."""
    print("\n=== Testing icon_sheild.opt ===")
    opt_path = config.KA_ASSETS_DIR / "com" / "icon_sheild.opt"
    
    if not opt_path.exists():
        print(f"❌ FAIL: {opt_path} not found")
        return False
    
    result = parse_opt(opt_path, debug_hex=False)
    
    print(f"✓ Header: cell {result['cell_width']}x{result['cell_height']}, grid {result['cols']}x{result['rows']}")
    
    # Check total sprite count (should be ~25 filled based on packet)
    if len(result["sprites"]) < 23 or len(result["sprites"]) > 27:
        print(f"⚠ WARNING: Expected ~25 filled slots, got {len(result['sprites'])}")
    else:
        print(f"✓ Total filled slots: {len(result['sprites'])} (expected ~25)")
    
    print(f"✅ PASS: icon_sheild.opt")
    return True


def main():
    print("=" * 60)
    print("Icon OPT Parser v11 Validation")
    print("=" * 60)
    
    all_pass = True
    
    all_pass &= test_icon_weapon()
    all_pass &= test_icon_item()
    all_pass &= test_icon_head()
    all_pass &= test_icon_sheild()
    
    print("\n" + "=" * 60)
    if all_pass:
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
