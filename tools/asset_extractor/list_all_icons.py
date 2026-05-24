#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
list_all_icons.py — List all exported icons organized by category with preview.

Generates an HTML preview page showing all exported icons with their names and IDs.
"""

import json
from pathlib import Path


def generate_html_preview(manifest_path: Path, output_path: Path):
    """Generate an HTML preview of all exported icons."""
    
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Kingdom Adventures Icons - Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        h2 {
            color: #666;
            margin-top: 40px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
        }
        .summary {
            background: #fff;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary h3 {
            margin-top: 0;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 12px;
            margin-top: 15px;
        }
        .icon-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 12px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        }
        .icon-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .icon-card img {
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            width: 32px;
            height: 32px;
            margin-bottom: 8px;
        }
        .icon-card .name {
            font-size: 11px;
            color: #333;
            font-weight: 500;
            margin-bottom: 4px;
            min-height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon-card .id {
            font-size: 10px;
            color: #999;
        }
        .icon-card .meta {
            font-size: 9px;
            color: #666;
            margin-top: 4px;
        }
        .search-box {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .search-box input {
            width: 100%;
            padding: 10px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .hidden {
            display: none !important;
        }
        .egg-icon img {
            height: 55px !important;
            width: auto;
        }
        .attribute-icon img {
            height: 56px !important;
            width: auto;
        }
    </style>
</head>
<body>
    <h1>🎮 Kingdom Adventures - Exported Icons</h1>
    
    <div class="summary">
        <h3>📊 Export Summary</h3>
        <p><strong>Total Icons:</strong> """ + str(sum(manifest['summary'].values())) + """</p>
        <p><strong>Items:</strong> """ + str(manifest['summary']['items']) + """ | 
           <strong>Equipment:</strong> """ + str(manifest['summary']['equipment']) + """ | 
           <strong>Eggs:</strong> """ + str(manifest['summary']['eggs']) + """ | 
           <strong>Attributes:</strong> """ + str(manifest['summary']['attributes']) + """</p>
        <p><strong>Scale:</strong> """ + str(manifest['scale']) + """x</p>
    </div>
    
    <div class="search-box">
        <input type="text" id="searchInput" placeholder="🔍 Search icons by name or ID..." onkeyup="filterIcons()">
    </div>
"""
    
    # Items
    html += '<h2>📦 Items (' + str(len(manifest['items'])) + ')</h2>\n'
    html += '<div class="icon-grid">\n'
    for item in manifest['items']:
        html += f"""    <div class="icon-card" data-name="{item['name'].lower()}" data-id="{item['id']}" data-category="items">
        <img src="items/{item['filename']}" alt="{item['name']}">
        <div class="name">{item['name']}</div>
        <div class="id">ID {item['id']}</div>
        <div class="meta">{item['method']}</div>
    </div>
"""
    html += '</div>\n'
    
    # Equipment
    html += '<h2>⚔️ Equipment (' + str(len(manifest['equipment'])) + ')</h2>\n'
    html += '<div class="icon-grid">\n'
    for equip in manifest['equipment']:
        attr_text = ""
        if equip.get('attribute') and equip['attribute'] != -1:
            attr_names = {1: "Ground", 2: "Grass", 3: "Sand", 4: "Rock", 5: "Volcano", 6: "Snow", 7: "Swamp"}
            attr_text = f" | {attr_names.get(equip['attribute'], str(equip['attribute']))}"
        
        html += f"""    <div class="icon-card" data-name="{equip['name'].lower()}" data-id="{equip['id']}" data-category="equipment">
        <img src="equipment/{equip['filename']}" alt="{equip['name']}">
        <div class="name">{equip['name']}</div>
        <div class="id">ID {equip['id']}</div>
        <div class="meta">Type {equip.get('type', '?')}{attr_text}</div>
    </div>
"""
    html += '</div>\n'
    
    # Eggs
    html += '<h2>🥚 Eggs (' + str(len(manifest['eggs'])) + ')</h2>\n'
    html += '<div class="icon-grid">\n'
    for egg in manifest['eggs']:
        html += f"""    <div class="icon-card egg-icon" data-name="{egg['name'].lower()}" data-id="{egg['id']}" data-category="eggs">
        <img src="eggs/{egg['filename']}" alt="{egg['name']}">
        <div class="name">{egg['name']}</div>
        <div class="id">ID {egg['id']}</div>
        <div class="meta">{egg['dimensions']}</div>
    </div>
"""
    html += '</div>\n'
    
    # Attributes
    html += '<h2>🌍 Field Attributes (' + str(len(manifest['attributes'])) + ')</h2>\n'
    html += '<div class="icon-grid">\n'
    for attr in manifest['attributes']:
        html += f"""    <div class="icon-card attribute-icon" data-name="{attr['name'].lower()}" data-id="{attr['id']}" data-category="attributes">
        <img src="attributes/{attr['filename']}" alt="{attr['name']}">
        <div class="name">{attr['name']}</div>
        <div class="id">ID {attr['id']}</div>
        <div class="meta">{attr['dimensions']}</div>
    </div>
"""
    html += '</div>\n'
    
    # JavaScript for search
    html += """
    <script>
    function filterIcons() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const cards = document.querySelectorAll('.icon-card');
        
        cards.forEach(card => {
            const name = card.getAttribute('data-name');
            const id = card.getAttribute('data-id');
            
            if (searchTerm === '' || 
                name.includes(searchTerm) || 
                id === searchTerm ||
                id.includes(searchTerm)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    }
    </script>
</body>
</html>
"""
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"HTML preview generated: {output_path}")
    print(f"Open in browser to view all {sum(manifest['summary'].values())} icons")


def main():
    manifest_path = Path("../../website_icons/manifest.json")
    output_path = Path("../../website_icons/preview.html")
    
    if not manifest_path.exists():
        print(f"Error: {manifest_path} not found")
        print("Run: python export_website_icons.py first")
        return
    
    generate_html_preview(manifest_path, output_path)


if __name__ == "__main__":
    main()
