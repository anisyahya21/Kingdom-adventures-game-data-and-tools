# Kingdom Adventures — Community Tools

## Overview

pnpm workspace monorepo using TypeScript. React+Vite frontend at `/` with an Express API backend. All community-editable data is stored in `artifacts/api-server/data/ka_shared.json`.

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite + Wouter (routing) + TanStack Query + Tailwind + shadcn/ui
- **API**: Express 5, esbuild bundle, JSON flat-file storage
- **Icons**: Lucide-react
- **Node.js**: 24, TypeScript 5.9

## Routes (Kingdom Adventures frontend)

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
jobs            — { name: { generation: 1|2, type?: "combat"|"non-combat", icon?, ranks: { S|A|B|C|D: { stats: { HP: { base, inc, levels? }, … } } }, shield?: "can"|"cannot", weaponEquip?: { [weaponClass]: "can"|"cannot"|"weak" }, skillAccess?: { attack: "can"|"cannot", casting: "can"|"cannot" }, skills: [], shops?: string[], notes?: string } }
```

## Key Design Notes

- Equipment stat formula: `value = base + (level − 1) × inc`
- Job stat formula: same formula, max level 999, per-rank base/inc
- Username stored in `localStorage("ka_username")` — shared edits show this name
- Red dash in equipment table = stat never set (no override + sheet value 0)
- Green checkmark on item = all 11 stats have been contributed (Move merged into Speed)
- First gen jobs can all marry each other (A compatibility); second gen cannot marry
- Weekly conquest: 6 monsters selected from DB, shows spawn locations + reward (job/diamonds/equipment)

## API Routing

- **Dev**: Vite proxy `/ka-api/*` → `http://localhost:8080` (rewrite strips `/ka-api` → `/api`)
- **Production**: Replit router forwards `/ka-api/*` AND `/api/*` to Express on port 8080
  - `artifacts/api-server/.replit-artifact/artifact.toml` has `paths = ["/api", "/ka-api"]`
  - `app.ts` has `app.use("/ka-api", router)` alias alongside `app.use("/api", router)`
- All frontend pages use `BASE = import.meta.env.BASE_URL.replace(/\/$/, "")` + `API = (p) => \`${BASE}/ka-api/ka${p}\``
- `BASE_PATH = "/"` in the Kingdom Adventures artifact (set in services.env)

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/kingdom-adventures run dev` — Frontend
