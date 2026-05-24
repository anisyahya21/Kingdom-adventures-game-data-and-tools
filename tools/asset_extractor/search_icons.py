#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
search_icons.py — Search exported icons by name or ID to help find specific assets.

Usage:
  python search_icons.py "copper"
  python search_icons.py "skill"
  python search_icons.py "coin"
  python search_icons.py --id 71
"""

import argparse
import json
from pathlib import Path


def search_icons(query: str = None, item_id: int = None, manifest_path: Path = None):
    """Search icons in manifest by name or ID."""
    
    if manifest_path is None:
        # Try multiple locations
        candidates = [
            Path("website_icons") / "manifest.json",
            Path("../../website_icons") / "manifest.json",
            Path(__file__).parent.parent.parent / "website_icons" / "manifest.json",
        ]
        for candidate in candidates:
            if candidate.exists():
                manifest_path = candidate
                break
        else:
            manifest_path = candidates[0]  # Use first as fallback for error message
    
    if not manifest_path.exists():
        print(f"Error: {manifest_path} not found")
        print("Run: python export_website_icons.py first")
        return
    
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    
    results = []
    
    # Search in all categories
    for category in ["items", "equipment", "eggs", "attributes"]:
        entries = manifest.get(category, [])
        
        for entry in entries:
            match = False
            
            # Match by ID
            if item_id is not None:
                if entry.get("id") == item_id:
                    match = True
            
            # Match by name query
            elif query:
                name = entry.get("name", "").lower()
                if query.lower() in name:
                    match = True
            
            if match:
                results.append({
                    "category": category,
                    "id": entry.get("id"),
                    "name": entry.get("name"),
                    "filename": entry.get("filename"),
                    "type": entry.get("type"),  # equipment only
                    "attribute": entry.get("attribute"),  # equipment only
                })
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Search exported icons")
    parser.add_argument("query", nargs="?", help="Search term (searches in name)")
    parser.add_argument("--id", type=int, help="Search by exact ID")
    parser.add_argument("--manifest", type=Path, default=Path("website_icons/manifest.json"),
                        help="Path to manifest.json")
    args = parser.parse_args()
    
    if not args.query and args.id is None:
        print("Usage: python search_icons.py <query>")
        print("       python search_icons.py --id <id>")
        print("\nExamples:")
        print('  python search_icons.py "copper"')
        print('  python search_icons.py "skill"')
        print('  python search_icons.py "coin"')
        print('  python search_icons.py "board"')
        print('  python search_icons.py --id 71')
        return
    
    results = search_icons(args.query, args.id, args.manifest)
    
    if not results:
        print(f"No results found for: {args.query or f'ID {args.id}'}")
        return
    
    print(f"\nFound {len(results)} result(s):\n")
    
    for r in results:
        print(f"[{r['category'].upper()}] ID {r['id']:3d} - {r['name']}")
        print(f"  File: {r['filename']}")
        if r.get('type'):
            print(f"  Type: {r['type']}")
        if r.get('attribute') and r['attribute'] != -1:
            attr_names = {1: "Ground", 2: "Grass", 3: "Sand", 4: "Rock", 5: "Volcano", 6: "Snow", 7: "Swamp"}
            print(f"  Attribute: {attr_names.get(r['attribute'], r['attribute'])}")
        print()


if __name__ == "__main__":
    main()
