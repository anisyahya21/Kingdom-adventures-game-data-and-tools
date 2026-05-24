# Nature Render Reverse Engineering Report

Date: 2026-05-16
Scope: Research only from extracted assets, analysis scripts, and generated evidence. No renderer or lab tuning changes.

## Files Searched

- tools/asset_extractor/analyze_nature_renderer_files.py
- tools/asset_extractor/analyze_renderer_reference_files.py
- tools/asset_extractor/generated/nature_renderer_evidence_2026-05-15.json
- tools/asset_extractor/generated/renderer_reference_file_evidence_2026-05-15.json
- tools/asset_extractor/generated/shadow_renderer_evidence_2026-05-15.json
- artifacts/kingdom-adventures/tmp/analyze-mapchip-visual-resolver.bundle.mjs
- tools/asset_extractor/apk_extracted/chara/*

Additional discovery check:
- Searched for decompiled runtime artifacts under tools/asset_extractor/apk_extracted (Assembly-CSharp/global-metadata/libil2cpp). None were present in this workspace snapshot.

## Useful Hits

1) Nature row schema and filtering
- analyze_nature_renderer_files.py reads Terrain.csv fields:
  - type, category, natureId, natureGroupId, res, img, seb, frame
- It filters nature rows with:
  - if row[index["res"]] != "20": continue

2) Nature image/sprite index mapping
- analyze_nature_renderer_files.py read_index parses tab-separated index files and maps numeric id to filename from:
  - nature/img.inf
  - nature/seb.inf
- Generated evidence confirms:
  - sebIndex: {0: tree00.seb, 1: ore00.seb, 2: rock00.seb, 3: plant00.seb, 4: nature00.seb, 5: human00.seb}

3) SEB transform record structure (core render transform evidence)
- analyze_renderer_reference_files.py parse_seb decodes each SEB frame record as:
  - tick, sourceId, srcX, srcY, cellW, cellH, offsetX, offsetY, extra8, extra9
- This is the strongest direct evidence of source crop and draw offset metadata.

4) OPT structure (crop/destination cell packing metadata)
- analyze_renderer_reference_files.py parse_opt decodes each slot as:
  - destX, destY, srcX, srcY, width, height (plus cellW/cellH, cols/rows)
- shadow_renderer_evidence_2026-05-15.json confirms this with concrete values in shadow.opt slots.

5) Terrain/mapchip path (different domain from nature rows)
- analyze-mapchip-visual-resolver.bundle.mjs:
  - parseMapBinarySectionA reads map cell fields f0..f5 and stores f2.
  - parseMapChipCsv reads MapChip.csv rows including img, seb, layer, rotation, sizeWidth, sizeHeight.
  - buildMapChipVisualResolverReport resolves visuals by f2 mapchip id, map_assets candidate, and sprite path existence.

6) Path derivation for sidecar metadata in mapchip resolver
- buildMapChipVisualResolverReport derives:
  - sebFilePath = <sebRoot>/<spriteName>.seb
  - optFilePath = <optRoot>/<spriteName>.opt
  - optInfoFilePath = <optRoot>/<spriteName>.optinfo

## Exact Snippets And Field Names

Snippet A: Nature Terrain field intake and filtering

```py
index = {name: header.index(name) for name in ("type", "category", "natureId", "natureGroupId", "res", "img", "seb", "frame")}
...
if row[index["res"]] != "20":
    continue
```

Snippet B: Nature index parser

```py
parts = line.split("\t")
if len(parts) >= 2:
    result[int(parts[0])] = parts[1].split(",", 1)[0]
```

Snippet C: SEB record decode shape

```py
records.append(
    {
        "tick": values[0],
        "sourceId": values[1],
        "srcX": values[2],
        "srcY": values[3],
        "cellW": values[4],
        "cellH": values[5],
        "offsetX": values[6],
        "offsetY": values[7],
        "extra8": values[8],
        "extra9": values[9],
    }
)
```

Snippet D: OPT slot decode shape

```py
{
  "destX": i16(data, offset + 3),
  "destY": i16(data, offset + 5),
  "srcX": i16(data, offset + 7),
  "srcY": i16(data, offset + 9),
  "width": u16(data, offset + 11),
  "height": u16(data, offset + 13),
}
```

Snippet E: Map binary fields and f2 usage

```js
const f0 = view.getUint32(offset, false);
const f1 = view.getUint32(offset + 4, false);
const f2 = view.getUint32(offset + 8, false);
...
worldCell.f2ChipId = cell.fields.f2;
```

Snippet F: Mapchip CSV intake

```js
map.set(id, {
  id,
  name: getText(cells, "name"),
  img: getNumber(cells, "img"),
  seb: getNumber(cells, "seb"),
  layer: getNumber(cells, "layer"),
  rotation: getNumber(cells, "rotation"),
  sizeWidth: getNumber(cells, "sizeWidth"),
  sizeHeight: getNumber(cells, "sizeHeight")
});
```

Snippet G: Resolver metadata sidecars

```js
const sebFilePath = candidate?.spriteName ? `${sebRoot}/${candidate.spriteName}.seb`.replace(/\\/g, "/") : void 0;
const optFilePath = candidate?.spriteName ? `${optRoot}/${candidate.spriteName}.opt`.replace(/\\/g, "/") : void 0;
const optInfoFilePath = candidate?.spriteName ? `${optRoot}/${candidate.spriteName}.optinfo`.replace(/\\/g, "/") : void 0;
```

## Likely Nature Render Pipeline (From Current Evidence)

1) Row selection
- Renderer selects nature data rows from Terrain.csv-like data where res=20 and category/type/natureGroupId partition usage.

2) Asset lookup
- img value resolves image filename through nature/img.inf.
- seb value resolves sprite behavior file through nature/seb.inf.

3) Source crop selection
- Primary source crop appears in SEB frame record (srcX/srcY/cellW/cellH), keyed by sourceId.
- OPT provides additional packed shape rectangles (srcX/srcY/width/height into destX/destY inside a cell canvas).

4) Offset placement
- SEB offsetX/offsetY is the strongest direct draw offset signal.
- OPT destX/destY is an intra-cell destination position for packed slices.

5) Frame choice
- Nature evidence shows Terrain usage only at frame=0:
  - terrainUsageBySebFrame: seb0_frame0, seb2_frame0, seb5_frame0
- For human00.seb, multiple animation frames exist, but referenced terrain rows still specify frame 0.

6) Final draw
- Draw appears to be anchored around a tile/cell basis where negative Y offsets lift tall sprites upward:
  - tree-like: cell 48x128 with offset -24,-116
  - ore/plant-like: cell 48x36 with offset -24,-25

## Confirmed Facts

- Nature transform metadata exists directly in extracted SEB frame records: src rect + offset fields.
- Nature OPT files exist for many nature images and define slot source/destination rectangles.
- Nature Terrain rows in evidence use res=20 and point to img/seb/frame columns.
- In the generated nature evidence, all referenced Terrain nature rows use frame 0.
- Terrain/mapchip resolution flow in the bundled resolver is driven by map cell f2 -> MapChip.csv -> map_assets candidate -> sprite path.
- Mapchip resolver tracks optional anchor metadata from candidate pivot.

## Unknowns (Not Yet Proven From Current Workspace Data)

- Exact runtime class/function in engine that composes SEB + OPT + OPTINFO for nature at render time.
- Whether nature runtime prefers SEB only, OPT only, or a conditional merge by asset family.
- Exact semantic meaning of SEB extra8/extra9 in nature rendering.
- Exact runtime scale multiplier and camera-space conversion for nature sprites.
- Exact pivot/anchor rule used by runtime for nature (tile-center, footpoint, OPT cell origin, or mixed).
- Exact static-frame selection policy if Terrain frame is unset or out of range.
- Definitive branch differences between terrain-base rendering and nature overlay rendering inside engine code (we currently have data-path evidence, not decompiled function-level proof).

## Direct Answers To The 8 Requested Questions

1) res resource bank mapping
- Confirmed at data level: nature rows in Terrain evidence are filtered with res=20, and those rows use img/seb/frame fields for nature assets.
- Not yet confirmed: engine enum/class that interprets res numerically.

2) img to PNG resolution
- Confirmed in extractor logic: numeric img id resolves by reading nature/img.inf id->filename mapping.

3) seb + frame crop/state path
- Confirmed record fields in SEB: sourceId/srcX/srcY/cellW/cellH and per-frame tick.
- Confirmed terrain usage currently references frame 0 for nature rows in evidence.

4) offset calculation source
- Confirmed fields: SEB offsetX/offsetY exist and are populated consistently.
- OPT also has destX/destY for packed slots.
- Exact runtime precedence between SEB offsets and OPT dest offsets is still unproven.

5) scale calculation
- No direct scale formula found in current evidence files.
- Likely external to SEB/OPT metadata and handled by renderer/camera system.

6) anchor/pivot definition
- No explicit nature anchor formula found.
- Mapchip resolver exposes candidate pivot metadata for map assets, but this is not yet proven as nature runtime rule.

7) static frame choice for multi-state
- Evidence shows Terrain nature rows reference frame 0.
- Multi-frame SEB files exist (example human00.seb), but current Terrain references still pin frame 0.

8) terrain vs nature render path differences
- Terrain/mapchip path (from bundled resolver): parsed map f2 + MapChip.csv + map_assets candidate + sprite path.
- Nature path (from nature evidence script): Terrain res=20 rows + nature img.inf/seb.inf + nature SEB/OPT metadata.
- Full in-engine convergence/divergence point remains unknown without decompiled runtime code.

## Next Concrete File/Code Target

Priority target to resolve unknowns without guessing:

1) Acquire and decode runtime metadata/code artifacts (outside current snapshot):
- global-metadata.dat
- libil2cpp.so (or Assembly-CSharp.dll if Mono build)

2) Then extract symbol/function candidates for:
- Terrain row loading for res=20 path
- img.inf and seb.inf runtime readers
- SEB frame decode/selection
- OPT/OPTINFO application
- final draw transform (position, pivot, scale)

3) Produce a follow-up report with function-level call-chain proof and precedence rules.

Until those binaries are available in workspace, SEB/OPT/Terrain evidence above is the strongest non-guessing basis currently available.
