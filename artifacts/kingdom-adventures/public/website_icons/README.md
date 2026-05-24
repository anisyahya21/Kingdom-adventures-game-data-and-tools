# Kingdom Adventurers Website Icons

Exported on: 2026-05-15 07:58:04
Scale: 1x

## Structure

```
..\..\website_icons/
  items/           161 item icons
  equipment/       307 equipment icons
  eggs/            8 egg icons
  attributes/      7 field attribute icons
  manifest.json    Complete metadata for all icons
```

## Usage

Each icon PNG is linked to its game entity through `manifest.json`.

### Items
- File: `items/item_XXX.png` (XXX = item ID with leading zeros)
- IDs 0-6: Material resources (Diamonds, Grass, Wood, Food, Ore, Mystic Ore, Energy)
- IDs 26-70: Localized items (Recovery Potions, Holy Herb, Sturdy Board, etc.)
- IDs 71+: Goods and materials

### Equipment
- File: `equipment/equip_XXX.png`
- Linked to equipment ID, type, and attribute
- Attributes: Ground(1), Grass(2), Sand(3), Rock(4), Volcano(5), Snow(6), Swamp(7)

### Eggs
- File: `eggs/egg_X.png` (X = 0-7)
- White, Blue, Green, Red, Purple, Black, Yellow, Rainbow

### Attributes
- File: `attributes/attribute_X_name.png` (X = 1-7)
- Ground, Grass, Sand, Rock, Volcano, Snow, Swamp

## Integration Example

```javascript
// Load manifest
const manifest = await fetch('/icons/manifest.json').then(r => r.json());

// Find item icon
const woodItem = manifest.items.find(i => i.name === "Wood");
console.log(woodItem.filename); // "item_002.png"

// Display icon
<img src="/icons/items/{{ woodItem.filename }}" alt="Wood" />

// Find equipment with Grass attribute
const grassWeapons = manifest.equipment.filter(e => e.attribute === 2);
```

## Replace Emoji Icons

Current website uses emoji for:
- 🪵 Wood → `items/item_002.png`
- 🪨 Ore → `items/item_004.png`
- 💎 Mystic Ore → `items/item_005.png`
- 🪙 Copper Coin → TBD (need to find coin icons in assets)
- ⚡ Energy → `items/item_006.png`

See manifest.json for complete ID→name→filename mapping.
