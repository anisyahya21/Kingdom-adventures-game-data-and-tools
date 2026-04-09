# Kingdom Adventures — Community Tools

## Overview

pnpm workspace monorepo using TypeScript. React+Vite frontend at `/` with an Express API backend. All community-editable data is stored in `artifacts/api-server/data/ka_shared.json`.

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite + Wouter (routing) + TanStack Query + Tailwind + shadcn/ui
- **API**: Express 5, esbuild bundle, JSON flat-file storage
- **Icons**: Lucide-react
- **Node.js**: 24, TypeScript 5.9

## Routes (marriage-matcher frontend)

| Path | Page |
|------|------|
| `/` | Home — tool tiles grid |
| `/match-finder` | Marriage Match Finder |
| `/equipment` | Equipment Stats |
| `/monsters` | Monsters & Weekly Conquest |
| `/jobs` | Job Database list |
| `/jobs/:name` | Job detail (stats/skills/equipment/marriage) |

## API Endpoints (`/ka-api/ka/...`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/shared` | Full shared state (equipment overrides, icons, etc.) |
| PUT | `/shared/overrides` | Equipment stat overrides |
| PUT | `/shared/slots` | Equipment slot assignments |
| PUT | `/shared/icons/equip` | Equipment icons |
| PUT | `/shared/icons/stat` | Stat icons |
| PUT | `/shared/weapon-types` | Weapon type per item |
| PUT | `/shared/weapon-categories` | Weapon category list |
| POST | `/shared/rename-user` | Rename user in history |
| GET/PUT | `/monsters` | Monster database |
| GET/PUT | `/weekly-conquest` | Weekly Conquest selection + reward |
| GET/PUT | `/jobs` | Job database |

## Shared Data Model (`ka_shared.json`)

```
overrides       — per-item stat base/inc overrides
slotAssignments — item → slot (Head/Weapon/Shield/Armor/Accessory)
equipIcons      — item → base64 icon
statIcons       — stat name → base64 icon
weaponTypes     — item → weapon type string
weaponCategories — list of weapon type strings
history         — last 200 change events with userName, timestamp, changeType
monsters        — { name: { icon?, spawns: [{area, level}] } }
weeklyConquest  — { monsters: string[6], reward: {jobName, jobRank, diamonds, equipment}, updatedBy, updatedAt }
jobs            — { name: { generation: 1|2, type?: "combat"|"non-combat", icon?, ranks: { S|A|B|C|D: { stats: { HP: { base, inc, levels? }, … } } }, shield?: "can"|"cannot", weaponEquip?: { [weaponClass]: "can"|"cannot"|"weak" }, skillAccess?: { attack: "can"|"cannot", casting: "can"|"cannot" }, skills: [] } }
```

## Key Design Notes

- Equipment stat formula: `value = base + (level − 1) × inc`
- Job stat formula: same formula, max level 999, per-rank base/inc
- Username stored in `localStorage("ka_username")` — shared edits show this name
- Red dash in equipment table = stat never set (no override + sheet value 0)
- Green checkmark on item = all 12 stats have been contributed
- First gen jobs can all marry each other (A compatibility); second gen cannot marry
- Weekly conquest: 6 monsters selected from DB, shows spawn locations + reward (job/diamonds/equipment)

## Vite Proxy

`/ka-api/*` → `http://localhost:8080` with rewrite stripping `/ka-api` → `/api`

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/marriage-matcher run dev` — Frontend
