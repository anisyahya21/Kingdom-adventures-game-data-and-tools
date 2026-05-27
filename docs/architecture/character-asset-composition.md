# Character Asset Composition Rules

This document is the rebuild note for Kingdom Adventures character assembly. If the inspector code is lost, these rules should be enough to rebuild the character compositor quickly from the extracted assets.

## Important Paths

- Extracted KA assets: `artifacts/kingdom-adventures/tmp/KA_assets/`
- Inspector renderer: `tools/asset_extractor/inspector/server.py`
- Job data CSV: `data/Sheet csv/KA GameData - Job.csv`
- Equip data CSV: `data/sheet-research/raw-copies/KA GameData - Equip.csv`
- Character SEB files: `artifacts/kingdom-adventures/tmp/KA_assets/chara/*.seb`
- Weapon and shield PNG/OPT files: `artifacts/kingdom-adventures/tmp/KA_assets/weapon/`
- Weapon/shield filename lookup: `artifacts/kingdom-adventures/tmp/KA_assets/weapon/img.inf`

## Core Data Formats

### SEB Animation Files

SEB files define the draw stack and per-layer animation placement.

Relevant idle files:

- `wait_right.seb`: base front/right idle with no equipment.
- `equip_wait_right.seb`: front-facing, looking right, with equipment.
- `equip_wait_up.seb`: back-facing, with equipment.

The current parser block-scans the file and reads 20-byte records as big-endian `>10H`.

Useful record fields:

- `r[3]`: layer type.
- `r[4]`, `r[5]`: source cell offset in SEB space. Convert to frame indices with `u = opt_x // w`, `v = opt_y // h`.
- `r[6]`, `r[7]`: SEB cell width/height.
- `r[8]`, `r[9]`: layer origin `ox`, `oy`, signed 16-bit.

Frame selection:

- Idle tall frames: `poseFrame=0` and `poseFrame=1`.
- Idle short frames: `poseFrame=2` and `poseFrame=3`.
- Clamp requested frame into `0..3` for idle previews.

Layer types used by the character compositor:

| Type | Layer |
| --- | --- |
| `0` | shadow |
| `1` | body |
| `2` | feet |
| `3` | shoes, currently skipped in standalone preview |
| `4` | face/head |
| `5` | mouth |
| `6` | eyes |
| `7` | hair |
| `8` | hat |
| `10` | hand |
| `11` | weapon |
| `12` | shield |

Draw in SEB order. For shields, draw only the first shield operation in the current idle preview; additional shield ops caused duplicate front-facing shield layers.

### OPT Packed Sprite Files

OPT files define where each packed sprite crop lands inside its logical cell.

Header:

- byte `0`: `cell_w`
- byte `1`: `cell_h`
- byte `2`: columns
- byte `3`: rows

Rows are `(v, u)` in row-major order. Filled records start with flag `0x01`; empty records use `0x00`.

Decoded slot fields needed by rendering:

- `dest_x`, `dest_y`: destination inside the logical cell.
- `src_x`, `src_y`: packed PNG crop start.
- `w`, `h`: packed crop size.
- `cell_w`, `cell_h`: copied from the OPT header for mirror math.

Truncated OPT records exist. Recover width using the next larger decoded `src_x` boundary when possible. Recover height with `cell_h - dest_y` bounded by source image height. This matters for shield side cells.

## Asset Resolution Rules

Use Job CSV resource columns to resolve base body/hand/foot/head assets. The current mappings are:

| Resource | Directory |
| --- | --- |
| body | `body/` |
| hand | `hand/` |
| foot | `foot/` |
| face/head sprites | `face/` |
| weapon/shield | `weapon/` via Equip CSV `img` plus `weapon/img.inf` |

For equipment:

1. Look up the Equip row by equipment id.
2. Use `img` from the Equip row.
3. Resolve filename with `weapon/img.inf`.
4. PNG is `weapon/<name>.png`.
5. OPT is `weapon/<same stem>.opt`.

Shield Equip ids currently include `177..200` and `312`.

## Coordinate System

Use the body layer as the stable x reference:

```text
body_ox = body_op.ox
layer_x = (op.ox - body_ox) + origin_x + manual_layer_dx
```

Use the shadow layer as the stable y reference:

```text
ref_oy = shadow_op.oy if shadow_op exists else body_op.oy
layer_y = (op.oy - ref_oy) + origin_y + manual_layer_dy
```

Do not use `body_oy` as the y reference for final frame placement. Body cells change visual height between tall and short frames, and anchoring the canvas to body y can make the floor/bottom pixel drift.

## Stable Animation Baseline

Do not compute `origin_y` from only the current frame. Frame-local top bounds can change by one pixel, which changes the canvas origin and makes the character hover or sink when frames are stacked.

Instead, compute one canonical canvas envelope across all idle pose frames for the selected SEB file:

```text
for frame in 0..3:
  ops = parse_seb(seb_name, frame)
  body_ox, body_oy, ref_oy = pose_refs(ops)
  extent = all layer boxes using:
    dx = op.ox - body_ox
    dy = op.oy - ref_oy

min_x = min(all frame min_x)
min_y = min(all frame min_y)
max_x = max(all frame max_x)
max_y = max(all frame max_y)

origin_x = -min_x
origin_y = -min_y
canvas_w = max_x - min_x
canvas_h = max_y - min_y
```

This makes the bottom/floor pixel stable across tall and short frames. For the tested equipped idle previews, this produces a source canvas around `60x61`, which scales to `480x488` at `scale=8`.

## Blitting Rule

For a normal, non-mirrored OPT slot:

```text
paste_x = x_offset + slot.dest_x
paste_y = y_offset + slot.dest_y
```

For mirrored right-facing shields, mirror both the pixels and the OPT destination inside the logical cell:

```text
mirrored_dest_x = slot.cell_w - slot.dest_x - slot.w
paste_x = x_offset + mirrored_dest_x
paste_y = y_offset + slot.dest_y
```

This is the key discovery. The old renderer flipped shield pixels but still used the unflipped `dest_x`, causing different per-shield placement errors based on shield width and packed-cell offset.

## Shield Rules

Use the SEB shield row and OPT row directly:

- Front/right facing uses `equip_wait_right.seb`.
- Back facing uses `equip_wait_up.seb`.
- `shieldCell=auto` should use the SEB `v` value.
- In front/right idle, SEB uses shield row `v=1`.
- In back/up idle, SEB uses shield row `v=0`.
- For front/right shields, pass `mirror_x=True` and use mirrored OPT `dest_x` as described above.

Do not apply a front/up edge alignment correction after mirroring OPT `dest_x`. The SEB and OPT data already contain the anchor. The old edge correction was compensating for the missing mirrored destination.

The manual calibration list that proved the rule:

| Shield | Old manual correction before mirrored `dest_x` |
| --- | --- |
| F Wooden Shield | `dx -1` |
| F Leather Shield | `dx -1` |
| E Infantry Shield | `dx -1` |
| Buckler | `dx -1` |
| Iron Shield | `dx -2` |
| Noble Shield | `dx +1` |
| Hero Shield | probably `dx -1` |
| Shell Shield | `dx -1` |
| Wairo Shield | `0,0` |
| Scholar's Shield | `dx -2`, `dy -1` |
| Nightmare Shield | `dx -1` |
| Legendary Shield blue | `0,0` |
| Legendary Shield red/bottom | `0,0` |
| Conqueror's Shield | `dx -1` |
| Mirror Shield | `dx +1` |
| Folk Art Shield | `dx -1` |

After applying mirrored `dest_x`, the debug endpoint reported `auto=(0,0)` for all of these examples.

## Validation Endpoints

Run inspector:

```powershell
cd "c:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor"
& "c:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/.venv/Scripts/python.exe" main.py inspector --port 8765
```

Check a composed preview:

```text
http://localhost:8765/api/job-preview?jobId=4&variant=1&equipState=front-right&weaponId=-1&shieldId=177&shieldCell=auto&poseFrame=0&scale=8&dx_shield=0&dy_shield=0
```

Check shield anchor debug:

```text
http://localhost:8765/api/shield-anchor-debug?jobId=4&variant=1&shieldId=177&equipState=front-right&shieldCell=auto&poseFrame=0&dx_shield=0&dy_shield=0
```

Expected debug mode for front/right shields after the fix:

```text
mirrored OPT dest_x, SEB right-facing anchor
```

Expected auto correction after the fix:

```text
auto_anchor_correction = { dx: 0, dy: 0 }
```

Baseline validation at `scale=1` should show the same bottom alpha row for tall and short:

```text
front-right poseFrame=0 bbox bottom == front-right poseFrame=2 bbox bottom
back poseFrame=0 bbox bottom == back poseFrame=2 bbox bottom
```

## Common Mistakes To Avoid

- Do not hand-maintain per-shield offsets. If many shields need different offsets, OPT mirroring or OPT decode is probably wrong.
- Do not mirror only the image crop; mirror `dest_x` inside the OPT cell too.
- Do not use front/up shield edge alignment as the primary right-facing anchor.
- Do not anchor y to `body_oy` for animation exports.
- Do not compute canvas origin from only one pose frame when exporting animation frames.
- Do not fallback shield OPT row `v=1` to `v=0`; if the side slot is truncated, recover it from the OPT data.
- Keep manual `dx_shield` and `dy_shield` at `0` unless debugging a new bug.

## Minimal Rebuild Algorithm

1. Parse job and equipment data.
2. Pick SEB file from facing and equipment state.
3. Parse draw ops for requested pose frame.
4. Resolve each layer's PNG/OPT from job/equipment data.
5. Compute body x reference and shadow y reference.
6. Compute shared all-pose canvas envelope for the selected SEB.
7. For each draw op in SEB order, compute layer position from SEB origin delta.
8. Decode OPT slot `(v, u)`.
9. For right-facing shield only, flip crop horizontally and use mirrored OPT `dest_x`.
10. Paste each crop to the canvas.
11. Scale with nearest-neighbor only.
