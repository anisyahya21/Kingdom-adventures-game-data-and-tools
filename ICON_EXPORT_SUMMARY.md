# Website Icon Export Summary

## ✅ Successfully Exported

### Total Icons: 483
- **161 Items** (including all resources and materials)
- **307 Equipment** (weapons, armor, accessories with attributes)
- **8 Eggs** (all egg types)
- **7 Field Attributes** (terrain-specific bonuses)

## 📁 File Structure

```
KA-Website/website_icons/
├── items/              161 item icons (item_000.png through item_XXX.png)
├── equipment/          307 equipment icons (equip_000.png through equip_XXX.png)
├── eggs/               8 egg icons (egg_0.png through egg_7.png)
├── attributes/         7 attribute icons (attribute_1_ground.png through attribute_7_swamp.png)
├── manifest.json       Complete metadata with ID→name→filename mapping
└── README.md           Integration guide
```

## 🔄 Replace Emoji Icons on Website

### Current Website Shows:
```
3× Sturdy Board  2× Iron Ore  1× High Grade Brick  3× 🟤 Copper Coin
```

### Icon Replacements Available:

| Current Emoji | Item Name | Icon File | Item ID |
|--------------|-----------|-----------|---------|
| 🪵 Wood | Wood | `item_002.png` | 2 |
| 🪨 Ore | Ore | `item_004.png` | 4 |
| 💎 Mystic Ore | Mystic Ore | `item_005.png` | 5 |
| ⚡ Energy | Energy | `item_006.png` | 6 |
| 🟤 Copper Coin | Copper Coin | `item_012.png` | 12 |
| - | Silver Coin | `item_013.png` | 13 |
| - | Gold Coin | `item_014.png` | 14 |
| - | Diamonds | `item_000.png` | 0 |
| - | Grass | `item_001.png` | 1 |
| - | Food | `item_003.png` | 3 |
| - | Sturdy Board | `item_075.png` | 75 |
| - | Iron Ore | `item_079.png` | 79 |
| - | High Grade Brick | `item_078.png` | 78 |

## 🔍 How to Find Specific Icons

### Search Tool Usage:
```bash
# From KA-Website directory
python tools/asset_extractor/search_icons.py "copper"
python tools/asset_extractor/search_icons.py "skill"
python tools/asset_extractor/search_icons.py "potion"
python tools/asset_extractor/search_icons.py --id 75
```

### Common Search Terms:
- **Currency**: "coin", "diamond"
- **Building Materials**: "board", "brick", "ore", "wood"
- **Consumables**: "potion", "herb", "elixir"
- **Equipment**: "staff", "sword", "armor", "shield"
- **Resources**: "ore", "wood", "grass", "food", "energy"

## 💻 Website Integration

### Option 1: Direct Image References
```jsx
// In your React/Next.js component
<img 
  src="/website_icons/items/item_002.png" 
  alt="Wood" 
  className="inline-icon"
/>
```

### Option 2: Load Manifest and Use Dynamically
```javascript
// Load manifest once
import manifest from './website_icons/manifest.json';

// Create lookup helper
const getIconByName = (name) => {
  const item = manifest.items.find(i => i.name.toLowerCase().includes(name.toLowerCase()));
  return item ? `/website_icons/items/${item.filename}` : null;
};

// Usage
const woodIcon = getIconByName("wood"); // "/website_icons/items/item_002.png"
```

### Option 3: Icon Component
```jsx
// components/GameIcon.jsx
import manifest from '../website_icons/manifest.json';

export const GameIcon = ({ itemName, type = "items", className = "" }) => {
  const data = manifest[type]?.find(i => 
    i.name.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!data) return null;
  
  return (
    <img 
      src={`/website_icons/${type}/${data.filename}`}
      alt={data.name}
      title={data.name}
      className={className}
    />
  );
};

// Usage
<GameIcon itemName="Wood" className="inline-icon" />
<GameIcon itemName="Copper Coin" type="items" />
```

## 📊 Available Icon Categories

### Items (161 total)
- **Resources (IDs 0-6)**: Diamonds, Grass, Wood, Food, Ore, Mystic Ore, Energy
- **Currency (IDs 7-14)**: Job Trade Ticket, Copper/Silver/Gold Coins
- **Consumables (IDs 26-70)**: Recovery Potions, Holy Herb, Elixirs, Monster Egg Tickets
- **Materials (IDs 71+)**: Iron Ore, Sturdy Board, High Grade Brick, etc.

### Equipment (307 total)
- **Weapons (Type 1-10)**: Swords, Spears, Hammers, Staffs, Bows
- **Shields (Type 11)**: All shield types
- **Body Armor (Type 12)**: Chest armor
- **Headgear (Type 13)**: Helmets, hats
- **Accessories (Type 14)**: Rings, amulets

### Eggs (8 total)
- White, Blue, Green, Red, Purple, Black, Yellow, Rainbow

### Attributes (7 total)
- Ground, Grass, Sand, Rock, Volcano, Snow, Swamp

## 🎯 Next Steps: Finding Skill Icons

Skill icons are likely in the extracted assets but not yet mapped to CSV data. To find them:

### Method 1: Browse Inspector
1. Start inspector: `python main.py inspector --port 8765`
2. Open http://localhost:8765
3. Look for skill-related icons in the items or a separate category

### Method 2: Search Asset Files
```bash
# Search for skill-related files
python tools/asset_extractor/search_icons.py "skill"
```

### Method 3: Check Unmapped Assets
Skills might be in:
- `KA_assets/com/` folder with names like `skill_icon.png`
- `KA_assets/game_2/` folder
- A separate skill CSV file (need to check `data/Sheet csv/` for Skill.csv)

### Action Item:
Tell me what you need skill icons for (e.g., character skill trees, job skills, etc.) and I can:
1. Search the assets for skill icon sheets
2. Add skill icon extraction to the export tool
3. Create skill icon mappings if a Skill.csv exists

## 🚀 Scaling Options

Icons are currently exported at **2x scale** (32×32 for most items).

To re-export at different scales:
```bash
# 1x scale (16×16) - smaller file size
python tools/asset_extractor/export_website_icons.py --scale 1

# 4x scale (64×64) - higher resolution
python tools/asset_extractor/export_website_icons.py --scale 4
```

## 📝 Manifest Structure

`manifest.json` contains complete metadata:
```json
{
  "version": "1.0",
  "scale": 2,
  "items": [
    {
      "id": 2,
      "name": "Wood",
      "category": 3,
      "filename": "item_002.png",
      "method": "material_top_row",
      "sheet": "material_icon.png",
      "iconU": 2,
      "iconV": 10
    }
  ],
  "summary": {
    "items": 161,
    "equipment": 307,
    "eggs": 8,
    "attributes": 7
  }
}
```

## ✨ CSS Styling Suggestions

```css
/* Inline icons next to text */
.inline-icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  display: inline-block;
  image-rendering: pixelated; /* Preserve pixel art quality */
  image-rendering: crisp-edges;
}

/* Larger display icons */
.display-icon {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
}

/* Icon grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px;
}
```

## 📋 Example: Replace Building Materials Display

### Before:
```jsx
<div>
  3× Sturdy Board  2× Iron Ore  1× High Grade Brick  3× 🟤 Copper Coin
</div>
```

### After:
```jsx
import { GameIcon } from './components/GameIcon';

<div className="materials-list">
  <span>3× <GameIcon itemName="Sturdy Board" /> Sturdy Board</span>
  <span>2× <GameIcon itemName="Iron Ore" /> Iron Ore</span>
  <span>1× <GameIcon itemName="High Grade Brick" /> High Grade Brick</span>
  <span>3× <GameIcon itemName="Copper Coin" /> Copper Coin</span>
</div>
```

## 🎮 Icon Quality

- All icons are **pixel-perfect** extractions from the original game assets
- Exported at 2x scale with NEAREST neighbor resampling (no blur/smoothing)
- Maintain transparency for overlays
- Ready for web use (PNG format with alpha channel)

---

**Location**: `KA-Website/website_icons/`  
**Manifest**: `KA-Website/website_icons/manifest.json`  
**Search Tool**: `python tools/asset_extractor/search_icons.py <query>`
