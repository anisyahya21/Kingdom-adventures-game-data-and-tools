# Town coverage placement rules

Recovered 12 September 2026 from the original ARM64 code and MapChip.txt. Static native evidence; no original-game runtime validation.

## Native branches

- MapChipData declares FLAG_OUT_TERRITORY_OK = 65536. Check at `0x162d654` reads the flags field at `+0x1c` and tests the requested mask.
- ChipPlaceSystem.CheckPlace `0x1508744–0x1508780` skips TownSystem.IsOutOfTownTerritory only when that flag is present. Otherwise a cell outside town coverage fails.
- `0x1508818–0x1508860` additionally rejects cells inside existing town coverage for categories 35 (Town Hall) and 52 (Town Hall boundary). The latter is a generated part, not a manual catalog facility.
- ChipReplaceSystem.CheckPlace `0x1511284` / `0x15112fc` delegates to ChipPlaceSystem.CheckPlace `0x15039cc` with constructionEnd=false. Its footprint overload `0x1510bbc` uses Enumerable.All. Moving does not introduce a universal town requirement.
- LandPlaceSystem.CheckPlace `0x15a4168–0x15a416c` rejects outside-town cells directly. Plots remain restricted.
- TownSystem.IsOutOfTownTerritory `0x15fed00` negates IsTownTerritory.

Evidence: workspace `RE-evidence/20260911-building/placement/town-1508238.asm`, `coverage-162d654.asm`, `coverage-1511284.asm`, `coverage-15112fc.asm`, `coverage-1510bbc.asm`, `coverage-15a407c.asm`, `coverage-15fed00.asm`; original metadata `RE-evidence/G2.1/39257e72291d/dump/dump.cs`.

## Website integration

`tools/recovery/recover_builder_coverage.py` joins each rendered facility's actual MapChip ID to the original table and exports `builder-placement-rules.json` (235 facilities). The shared townPlacementRule/ requiresTownCoverage helpers drive placement, movement, dimming and coverage-loss protection. Roads with legacy missing facilityId use native Road ID4. Every footprint cell is checked. Exemptions do not bypass occupancy, land, indoor capacity or fixed/removal restrictions. Town Hall moves exclude their own former coverage.

The website's existing coverage-loss protection is editor policy, not a recovered native prohibition on town changes. It now only protects facilities that require coverage. Manually planned dungeons remain an explicit editor feature. Global TerritorySystem/fog/area discovery and construction checks are separate from town coverage and are not simulated. This change does not claim all terrain, bridge or placement constraints have been reconstructed.

## Exported catalog classification

Names below use the existing Facility lookup. This list includes fixed and built-in fixtures; a coverage flag alone does not make them manually placeable or movable.

| Facility | ID | MapChip | Town coverage |
| --- | --- | --- | --- |
| Thick Fog | 0 | 23 | inside |
| Scheduled Construction Site | 1 | 22 | inside |
| Land Boundary | 2 | 20 | inside |
| Gravel Path | 3 | 33 | anywhere |
| Road | 4 | 34 | anywhere |
| Bridge | 5 | 35 | anywhere |
| Bridge | 6 | 36 | anywhere |
| Port | 7 | 67 | inside |
| Port | 8 | 68 | inside |
| Port | 9 | 69 | inside |
| Port | 10 | 70 | inside |
| Dungeon Entrance | 15 | 56 | inside |
| Town Hall | 17 | 58 | outside |
| Town Hall | 18 | 59 | inside |
| Town Hall | 19 | 60 | inside |
| Enemy Hall | 20 | 62 | inside |
| Enemy Hall | 21 | 63 | inside |
| Enemy Hall | 22 | 64 | inside |
| Wall: Fence | 23 | 99 | inside |
| Wall: Wood | 24 | 100 | inside |
| Defensive Wall | 25 | 101 | inside |
| Castle Wall | 26 | 102 | inside |
| Enemy's Wall | 27 | 104 | inside |
| Gate | 28 | 103 | inside |
| Torch | 29 | 79 | inside |
| Nighttime Meeting Place | 30 | 80 | inside |
| Low Watchtower | 31 | 81 | inside |
| Turret | 32 | 82 | inside |
| Storehouse (Grass) | 33 | 84 | inside |
| Storehouse (Food) | 34 | 86 | inside |
| Storehouse (Wood) | 35 | 85 | inside |
| Storehouse (Ore) | 36 | 87 | inside |
| Storehouse (Mystic Ore) | 37 | 88 | inside |
| Storehouse (Items) | 38 | 89 | inside |
| Storehouse (Energy) | 39 | 90 | inside |
| Storehouse (Treasure) | 40 | 91 | inside |
| Canal | 41 | 94 | inside |
| Field | 42 | 92 | inside |
| Plantation | 43 | 93 | inside |
| Ranch | 44 | 95 | inside |
| Mine: Ore | 45 | 96 | inside |
| Mine: Mystic Ore | 46 | 97 | inside |
| Mine: Energy | 47 | 98 | inside |
| Floor | 48 | 37 | inside |
| Floor | 49 | 38 | inside |
| Floor | 50 | 39 | inside |
| Floor | 51 | 40 | inside |
| Floor | 52 | 41 | inside |
| Floor | 53 | 42 | inside |
| Floor | 54 | 43 | inside |
| Floor | 55 | 44 | inside |
| Floor | 56 | 45 | inside |
| Floor | 57 | 46 | inside |
| Floor | 58 | 47 | inside |
| Floor | 59 | 48 | inside |
| Floor | 60 | 49 | inside |
| Floor | 61 | 51 | inside |
| Floor | 62 | 50 | inside |
| Entrance | 63 | 55 | inside |
| Wharf | 66 | 66 | inside |
| Well | 67 | 112 | inside |
| Info Board | 68 | 105 | anywhere |
| Wasteland Guide | 69 | 111 | anywhere |
| Stables | 70 | 110 | inside |
| Wagon Yard | 71 | 109 | inside |
| Outdoor Treasure Lab | 72 | 107 | inside |
| Temporary Shelter | 73 | 106 | inside |
| Outdoor Research Lab | 74 | 108 | inside |
| Rest Stop | 75 | 126 | inside |
| Simple Stove | 76 | 120 | inside |
| Bonfire | 77 | 121 | inside |
| Thorny Trap | 78 | 129 | anywhere |
| Flowerbed | 79 | 123 | inside |
| Bushes | 80 | 124 | inside |
| Seedlings | 81 | 125 | inside |
| Fountain | 82 | 122 | inside |
| Goddess Statue | 83 | 119 | inside |
| Rejuvenation Spring | 84 | 113 | inside |
| Monster Statue | 85 | 114 | inside |
| Monster-Repelling Orb | 86 | 115 | inside |
| Monster-Repelling Sword | 87 | 116 | inside |
| Monster-Repelling Slate | 88 | 117 | inside |
| Windmill | 89 | 118 | inside |
| Monster Feed | 90 | 128 | anywhere |
| Bench | 91 | 130 | inside |
| Expedition Hut | 92 | 127 | anywhere |
| Indoor Storage (Grass) | 93 | 138 | inside |
| Indoor Storage (Wood) | 94 | 139 | inside |
| Indoor Storage (Food) | 95 | 140 | inside |
| Indoor Storage (Ore) | 96 | 141 | inside |
| Indoor Storage (Mystic Ore) | 97 | 142 | inside |
| Hard Bed | 98 | 131 | inside |
| Bed | 99 | 132 | inside |
| Royal Bed | 100 | 133 | inside |
| Double Bed | 101 | 134 | inside |
| Register | 102 | 143 | inside |
| Store Shelves | 103 | 144 | inside |
| Skill Shelves | 104 | 145 | inside |
| Furniture Shelves | 105 | 146 | inside |
| Chair | 106 | 166 | inside |
| Royal Room | 107 | 158 | inside |
| Research Lab | 108 | 148 | inside |
| Hospital | 109 | 149 | inside |
| Accessory Workshop | 110 | 150 | inside |
| Cooking Station | 111 | 151 | inside |
| Recovery Station | 112 | 152 | inside |
| Treasure Analysis Lab | 113 | 147 | inside |
| Furniture Workbench | 114 | 153 | inside |
| Weapon Workbench | 115 | 154 | inside |
| Armor Workbench | 116 | 155 | inside |
| Skill Workbench | 117 | 156 | inside |
| Item Workbench | 118 | 157 | inside |
| Decorative Plant | 119 | 187 | inside |
| Tomato | 120 | 188 | inside |
| Flowers | 121 | 189 | inside |
| Pansy | 122 | 190 | inside |
| Glittering Stone | 123 | 186 | inside |
| Dining Table | 124 | 164 | inside |
| Couch | 125 | 165 | inside |
| Candle | 126 | 169 | inside |
| Tree Nursery | 127 | 170 | inside |
| Decorative Armor | 128 | 171 | inside |
| Red Carpet | 129 | 135 | inside |
| Fluffy Carpet | 130 | 136 | inside |
| Black Mat | 131 | 137 | inside |
| Training Room | 132 | 159 | inside |
| Shooting Range | 133 | 160 | inside |
| Magic Training Ground | 134 | 161 | inside |
| Rejuvenating Bath | 135 | 185 | inside |
| Rainwater Barrel | 136 | 167 | inside |
| Fireplace | 137 | 182 | inside |
| Tool Workshop | 138 | 168 | inside |
| Kitchen Shelves | 139 | 177 | inside |
| Bathtub | 140 | 184 | inside |
| Chest of Drawers | 141 | 176 | inside |
| Stove | 142 | 181 | inside |
| Flower Vase | 143 | 178 | inside |
| Animal Figurine | 144 | 179 | inside |
| Vanity Mirror | 145 | 180 | inside |
| Cooking Counter | 146 | 173 | inside |
| Shelf | 147 | 174 | inside |
| Desk | 148 | 163 | inside |
| Window | 149 | 183 | inside |
| Bookshelf | 150 | 175 | inside |
| Dresser | 151 | 172 | inside |
| Ore Workbench | 152 | 162 | inside |
| Study Desk | 153 | 191 | inside |
| Friend Bed | 154 | 243 | inside |
| Guest Bed | 155 | 244 | inside |
| Crib | 156 | 245 | inside |
| Monster Room | 157 | 246 | inside |
| Church | 158 | 242 | inside |
| Treasure Spawn | 159 | 215 | anywhere |
| Dragon Stables | 160 | 216 | inside |
| Pitfall | 161 | 217 | anywhere |
| Monster Stables | 162 | 218 | inside |
| Scorched Earth | 163 | 222 | anywhere |
| Recovery Outpost | 164 | 224 | anywhere |
| Master Smithy | 165 | 225 | anywhere |
| Friend Post Office | 166 | 226 | anywhere |
| Briefing Room | 167 | 227 | anywhere |
| Weekly Conquest Bonus | 168 | 228 | anywhere |
| Treasure Room | 169 | 229 | anywhere |
| Monster Farm | 170 | 230 | anywhere |
| Trophy Room | 171 | 231 | anywhere |
| Ranking Board | 172 | 232 | anywhere |
| Friends Agency | 173 | 233 | anywhere |
| Job Center | 174 | 234 | anywhere |
| Material Shop | 175 | 235 | anywhere |
| Gold Exchange | 176 | 236 | anywhere |
| Instructor's Room | 177 | 237 | anywhere |
| Monster Fusion Lab | 178 | 238 | anywhere |
| Monster Shop | 179 | 239 | anywhere |
| Kairo Room | 180 | 261 | anywhere |
| Underground Arena | 181 | 241 | anywhere |
| Ancestor Statue | 182 | 247 | inside |
| Copper Coin Box | 183 | 248 | inside |
| Silver Coin Box | 184 | 249 | inside |
| Gold Coin Box | 185 | 250 | inside |
| Kairo King Statue | 186 | 251 | inside |
| Town Hall Storehouse | 187 | 252 | inside |
| Town Hall Storehouse | 188 | 253 | inside |
| Day Care | 189 | 219 | anywhere |
| Scorched Earth | 190 | 220 | anywhere |
| Chaos Stone | 191 | 221 | anywhere |
| Monster Feed | 192 | 254 | anywhere |
| Restaurant Shelves | 193 | 255 | inside |
| Storehouse (Eggs) | 194 | 256 | inside |
| Cabin | 195 | 257 | anywhere |
| Legendary Cave | 196 | 258 | anywhere |
| Scorched Earth | 197 | 259 | anywhere |
| Movers | 198 | 260 | anywhere |
| Scorched Earth | 199 | 240 | anywhere |
| Equipment Exchange | 200 | 262 | anywhere |
| Trading Post | 201 | 263 | anywhere |
| Date Spot | 202 | 264 | anywhere |
| Scorched Earth | 203 | 265 | anywhere |
| Scorched Earth | 204 | 266 | anywhere |
| Scorched Earth | 205 | 267 | anywhere |
| High Grade Storehouse (Grass) | 206 | 268 | inside |
| High Grade Storehouse (Wood) | 207 | 269 | inside |
| High Grade Storehouse (Food) | 208 | 270 | inside |
| High Grade Storehouse (Ore) | 209 | 271 | inside |
| High Grade Storehouse (Mystic Ore) | 210 | 272 | inside |
| High Grade Storehouse (Energy) | 211 | 273 | inside |
| High Grade Storehouse (Treasure) | 212 | 274 | inside |
| High Grade Storehouse (Item) | 213 | 275 | inside |
| High Grade Storehouse (Eggs) | 214 | 276 | inside |
| Floor | 216 | 278 | inside |
| Floor | 217 | 279 | inside |
| Floor | 218 | 280 | inside |
| Floor | 219 | 281 | inside |
| Floor | 220 | 282 | inside |
| Floor | 221 | 283 | inside |
| Floor | 222 | 284 | inside |
| Fruit Tree | 223 | 285 | inside |
| Art Workbench | 224 | 286 | inside |
| Survey Room | 225 | 287 | inside |
| Bug Gathering Spot | 226 | 288 | anywhere |
| Scorched Earth | 227 | 289 | anywhere |
| Scorched Earth | 228 | 290 | anywhere |
| Fruit Tree | 229 | 291 | inside |
| Animal Cage | 230 | 292 | inside |
| Art House | 231 | 293 | inside |
| Water Tank | 232 | 294 | inside |
| Bug Case | 233 | 295 | inside |
| Cash Register | 234 | 296 | inside |
| Floor | 235 | 297 | inside |
| Santa Room | 236 | 298 | inside |
| Decorative Sled | 237 | 299 | inside |
| Reindeer Stable | 238 | 300 | inside |
| Airport | 239 | 301 | anywhere |
| Resource Center | 240 | 302 | anywhere |
| Fishing Pond | 241 | 303 | anywhere |
| Flying Carpet | 242 | 304 | inside |
