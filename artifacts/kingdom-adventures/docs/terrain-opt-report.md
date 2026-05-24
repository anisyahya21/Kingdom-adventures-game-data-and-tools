# Terrain OPT/OPTINFO Research Report

Generated from runtime assets at http://localhost:5174/tmp/KA_assets on 2026-05-16T11:04:36.902Z.

## Scope
- Terrain rows with type 1..13 from Terrain.txt
- Base rows: category=0
- Nature/overlay rows: category=1
- Parsed metadata: PNG dimensions, OPT grid/slots, OPTINFO presence/hint, slot offsets/rects

## Type Summary
| Terrain.type | Base rows (cat=0) | Nature rows (cat=1) | Families seen |
| --- | --- | --- | --- |
| 1 | 5 | 7 | tuchi, iwa |
| 2 | 5 | 15 | jimen, kazan, suna, snow |
| 3 | 5 | 12 | suna, jimen, snow, kazan |
| 4 | 5 | 16 | iwa, snow, kazan, suna |
| 5 | 5 | 9 | kazan, suna, iwa, jimen |
| 6 | 5 | 9 | snow, tuchi, jimen, suna, kazan |
| 7 | 5 | 9 | swamp, kazan, suna |
| 8 | 1 | 0 | snow |
| 9 | 1 | 0 | (unclassified) |
| 10 | 1 | 0 | volcano_soil |
| 11 | 1 | 0 | rocky_soil |
| 12 | 1 | 0 | swamp |
| 13 | 1 | 0 | (unclassified) |

## Answers
1. True base terrain files are those referenced by Terrain rows where category=0.
   Count: 41.
   Sample: desert_soil00.png, grassland_soil00.png, iwa00.png, iwa01.png, iwa02.png, iwa03.png, iwa04.png, jimen00.png, jimen01.png, jimen02.png, jimen03.png, jimen04.png, kazan00.png, kazan01.png, kazan02.png, kazan03.png, kazan04.png, rocky_soil00.png, snow_soil00.png, snow00.png
2. Nature/overlay files are those referenced by Terrain rows where category=1.
   Count: 57.
   Sample: azemichi00.png, bridge_side.png, douro_l_00.png, douro_l_01.png, douro_l2_00.png, douro_l2_01.png, douro01.png, douro02.png, douro03.png, douro04.png, dungeon_floor_00.png, genkan00.png, hashi00.png, hodou01.png, hodou02.png, hodou03.png, hodou04.png, iwa00.png, iwa01.png, jimen00.png
3. Files with multiple static variants (multiple unique filled slot rect/offset tuples):
   Count: 1.
   Sample: mizu_edge.png
4. Files likely containing animation frames (heuristic: OPT has multiple rows and filled slots exceed one row width):
   Count: 1.
   Sample: mizu_edge.png
5. Files containing offset/anchor metadata (non-zero destX/destY in OPT slots):
   Count: 5.
   Sample: mizu_edge.png, mizu00.png, mizu01.png, mizu02.png, mizu03.png
6. Likely variant-selection metadata fields:
   - Terrain.type selects family bucket (matched to f1)
   - Terrain.category separates base (0) vs nature (1)
   - Terrain.frame is the first-choice OPT slot index
   - If Terrain.frame slot is empty, fallback to first filled slot
7. For each Terrain row, recommended draw target is listed in the mapping table below (PNG + OPT slot + source rect + offsets).

## File Metadata Matrix
| PNG | Image size | OPT grid (u x v) | Filled slots | Static variants | Likely animated | Has offsets | OPTINFO | OPTINFO hint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| azemichi00.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| bridge_side.png | 48x30 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| desert_soil00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| douro_l_00.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro_l_01.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro_l2_00.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro_l2_01.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro01.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro02.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro03.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| douro04.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| dungeon_floor_00.png | 48x33 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| genkan00.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| grassland_soil00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| hashi00.png | 48x33 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| hodou01.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| hodou02.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| hodou03.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| hodou04.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| iwa00.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| iwa01.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| iwa02.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| iwa03.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| iwa04.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| jimen00.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| jimen01.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| jimen02.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| jimen03.png | 48x31 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| jimen04.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| kazan00.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| kazan01.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| kazan02.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| kazan03.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| kazan04.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| mizu_edge.png | 240x113 | 5x8 | 37 | 37 | yes | yes | yes | img1 \| optimize_48x23.inf |
| mizu00.png | 48x46 | 2x1 | 1 | 1 | no | yes | yes | img1 \| optimize_48x36.inf |
| mizu01.png | 48x46 | 2x1 | 1 | 1 | no | yes | yes | img1 \| optimize_48x36.inf |
| mizu02.png | 48x46 | 2x1 | 1 | 1 | no | yes | yes | img1 \| optimize_48x36.inf |
| mizu03.png | 48x46 | 2x1 | 1 | 1 | no | yes | yes | img1 \| optimize_48x36.inf |
| oudanhodou_00.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| oudanhodou_01.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| oudanhodou_02.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| oudanhodou_03.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| oudanhodou_04.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| oudanhodou_05.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| rocky_soil00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| rouka00.png | 48x33 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| rouka01.png | 48x33 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| rouka02.png | 48x33 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| side.png | 1x1 | 68x79 | 0 | 0 | no | no | no | missing (html fallback) |
| snow_soil00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| snow00.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| snow01.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| snow02.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| snow03.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| snow04.png | 48x29 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| suna00.png | 48x24 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| suna01.png | 48x24 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| suna02.png | 48x24 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| suna03.png | 48x24 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| suna04.png | 48x28 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp_soil00.png | 48x27 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp00.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp01.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp02.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp03.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| swamp04.png | 48x23 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tochi00.png | 48x24 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tuchi00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tuchi01.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tuchi02.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tuchi03.png | 48x26 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| tuchi04.png | 48x26 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |
| volcano_soil00.png | 48x25 | 1x1 | 0 | 0 | no | no | yes | img1 \| optimize_48x36.inf |

## Terrain Row -> Recommended Draw Mapping
| Terrain.id | type | category | kind | img | png | opt slot | src rect (x,y,w,h) | offset (destX,destY) | frame | natureId/group | filled/static |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 1 | 0 | base | 28 | tuchi00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 5 | 1 | 0 | base | 29 | tuchi01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 6 | 1 | 0 | base | 30 | tuchi02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 7 | 1 | 0 | base | 51 | tuchi03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 8 | 1 | 0 | base | 52 | tuchi04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 49 | 1 | 1 | nature/overlay | 30 | tuchi02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 50 | 1 | 1 | nature/overlay | 31 | mizu00.png | 0 (frame-index) | 0,0,48,23 | 0,13 | 0 | 19/-2 | 1/1 |
| 51 | 1 | 1 | nature/overlay | 8 | douro04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 52 | 1 | 1 | nature/overlay | 9 | genkan00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 121 | 1 | 1 | nature/overlay | 51 | tuchi03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 122 | 1 | 1 | nature/overlay | 52 | tuchi04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 139 | 1 | 1 | nature/overlay | 59 | iwa01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 9 | 2 | 0 | base | 14 | jimen00.png | none | n/a | n/a | 0 | 19/0 | 0/0 |
| 10 | 2 | 0 | base | 15 | jimen01.png | none | n/a | n/a | 0 | 19/0 | 0/0 |
| 11 | 2 | 0 | base | 18 | jimen02.png | none | n/a | n/a | 0 | 19/0 | 0/0 |
| 12 | 2 | 0 | base | 16 | jimen03.png | none | n/a | n/a | 0 | 19/0 | 0/0 |
| 13 | 2 | 0 | base | 17 | jimen04.png | none | n/a | n/a | 0 | 19/0 | 0/0 |
| 53 | 2 | 1 | nature/overlay | 20 | oudanhodou_01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 54 | 2 | 1 | nature/overlay | 6 | douro02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 55 | 2 | 1 | nature/overlay | 10 | hodou01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 56 | 2 | 1 | nature/overlay | 5 | douro01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 57 | 2 | 1 | nature/overlay | 1 | douro_l_00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 58 | 2 | 1 | nature/overlay | 0 | azemichi00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 104 | 2 | 1 | nature/overlay | 43 | bridge_side.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 105 | 2 | 1 | nature/overlay | 44 | hashi00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 106 | 2 | 1 | nature/overlay | 45 | dungeon_floor_00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 112 | 2 | 1 | nature/overlay | 49 | kazan03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 115 | 2 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 123 | 2 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 129 | 2 | 1 | nature/overlay | 54 | suna03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 131 | 2 | 1 | nature/overlay | 54 | suna03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 140 | 2 | 1 | nature/overlay | 58 | snow04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 14 | 3 | 0 | base | 38 | suna00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 15 | 3 | 0 | base | 41 | suna01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 16 | 3 | 0 | base | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 17 | 3 | 0 | base | 54 | suna03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 18 | 3 | 0 | base | 55 | suna04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 59 | 3 | 1 | nature/overlay | 21 | oudanhodou_02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 60 | 3 | 1 | nature/overlay | 22 | oudanhodou_03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 61 | 3 | 1 | nature/overlay | 23 | oudanhodou_04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 62 | 3 | 1 | nature/overlay | 24 | oudanhodou_05.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 63 | 3 | 1 | nature/overlay | 15 | jimen01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 64 | 3 | 1 | nature/overlay | 14 | jimen00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 107 | 3 | 1 | nature/overlay | 46 | snow01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 109 | 3 | 1 | nature/overlay | 47 | kazan01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 113 | 3 | 1 | nature/overlay | 49 | kazan03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 116 | 3 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 124 | 3 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 141 | 3 | 1 | nature/overlay | 57 | snow03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 19 | 4 | 0 | base | 39 | iwa00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 20 | 4 | 0 | base | 59 | iwa01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 21 | 4 | 0 | base | 60 | iwa02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 22 | 4 | 0 | base | 61 | iwa03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 23 | 4 | 0 | base | 62 | iwa04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 65 | 4 | 1 | nature/overlay | 3 | douro_l2_00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 66 | 4 | 1 | nature/overlay | 2 | douro_l_01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 67 | 4 | 1 | nature/overlay | 25 | rouka00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 68 | 4 | 1 | nature/overlay | 4 | douro_l2_01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 69 | 4 | 1 | nature/overlay | 13 | hodou04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 70 | 4 | 1 | nature/overlay | 12 | hodou03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 108 | 4 | 1 | nature/overlay | 46 | snow01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 110 | 4 | 1 | nature/overlay | 47 | kazan01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 111 | 4 | 1 | nature/overlay | 48 | kazan02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 114 | 4 | 1 | nature/overlay | 49 | kazan03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 117 | 4 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 125 | 4 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 130 | 4 | 1 | nature/overlay | 54 | suna03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 132 | 4 | 1 | nature/overlay | 54 | suna03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 133 | 4 | 1 | nature/overlay | 55 | suna04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 138 | 4 | 1 | nature/overlay | 56 | snow02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 24 | 5 | 0 | base | 42 | kazan00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 25 | 5 | 0 | base | 47 | kazan01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 26 | 5 | 0 | base | 48 | kazan02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 27 | 5 | 0 | base | 49 | kazan03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 28 | 5 | 0 | base | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 71 | 5 | 1 | nature/overlay | 37 | side.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 72 | 5 | 1 | nature/overlay | 38 | suna00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 73 | 5 | 1 | nature/overlay | 39 | iwa00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 74 | 5 | 1 | nature/overlay | 11 | hodou02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 75 | 5 | 1 | nature/overlay | 19 | oudanhodou_00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 76 | 5 | 1 | nature/overlay | 18 | jimen02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 118 | 5 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 126 | 5 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 134 | 5 | 1 | nature/overlay | 55 | suna04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 29 | 6 | 0 | base | 91 | snow00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 30 | 6 | 0 | base | 46 | snow01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 31 | 6 | 0 | base | 56 | snow02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 32 | 6 | 0 | base | 57 | snow03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 33 | 6 | 0 | base | 58 | snow04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 77 | 6 | 1 | nature/overlay | 26 | rouka01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 78 | 6 | 1 | nature/overlay | 27 | rouka02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 79 | 6 | 1 | nature/overlay | 28 | tuchi00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 80 | 6 | 1 | nature/overlay | 29 | tuchi01.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 81 | 6 | 1 | nature/overlay | 17 | jimen04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 82 | 6 | 1 | nature/overlay | 16 | jimen03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 119 | 6 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 127 | 6 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 135 | 6 | 1 | nature/overlay | 55 | suna04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 34 | 7 | 0 | base | 63 | swamp00.png | none | n/a | n/a | 0 | 19/2 | 0/0 |
| 35 | 7 | 0 | base | 64 | swamp01.png | none | n/a | n/a | 0 | 19/2 | 0/0 |
| 36 | 7 | 0 | base | 65 | swamp02.png | none | n/a | n/a | 0 | 19/2 | 0/0 |
| 37 | 7 | 0 | base | 66 | swamp03.png | none | n/a | n/a | 0 | 19/2 | 0/0 |
| 38 | 7 | 0 | base | 67 | swamp04.png | none | n/a | n/a | 0 | 19/2 | 0/0 |
| 83 | 7 | 1 | nature/overlay | 32 | mizu01.png | 0 (frame-index) | 0,0,48,23 | 0,13 | 0 | 19/-2 | 1/1 |
| 84 | 7 | 1 | nature/overlay | 33 | mizu02.png | 0 (frame-index) | 0,0,48,23 | 0,13 | 0 | 19/-2 | 1/1 |
| 85 | 7 | 1 | nature/overlay | 34 | mizu03.png | 0 (frame-index) | 0,0,48,23 | 0,13 | 0 | 19/-2 | 1/1 |
| 86 | 7 | 1 | nature/overlay | 35 | mizu_edge.png | 0 (frame-index) | 0,0,48,23 | 0,0 | 0 | 19/-2 | 37/37 |
| 87 | 7 | 1 | nature/overlay | 36 | tochi00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 88 | 7 | 1 | nature/overlay | 7 | douro03.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 120 | 7 | 1 | nature/overlay | 50 | kazan04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 128 | 7 | 1 | nature/overlay | 53 | suna02.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 136 | 7 | 1 | nature/overlay | 55 | suna04.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 39 | 8 | 0 | base | 70 | snow_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 40 | 9 | 0 | base | 69 | desert_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 41 | 10 | 0 | base | 71 | volcano_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 42 | 11 | 0 | base | 72 | rocky_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 43 | 12 | 0 | base | 73 | swamp_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
| 44 | 13 | 0 | base | 74 | grassland_soil00.png | none | n/a | n/a | 0 | 19/-2 | 0/0 |
