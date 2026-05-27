# Native Render Transform Analysis

Date: 2026-05-16
Scope: Native IL2CPP math extraction only. No renderer/lab code changes.

## Inputs Used

- [tools/asset_extractor/il2cpp_dump/script.json](tools/asset_extractor/il2cpp_dump/script.json)
- [tools/asset_extractor/il2cpp_dump/il2cpp.h](tools/asset_extractor/il2cpp_dump/il2cpp.h)
- [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs)
- [tools/asset_extractor/apk_runtime_extract/extracted/lib/arm64-v8a/libil2cpp.so](tools/asset_extractor/apk_runtime_extract/extracted/lib/arm64-v8a/libil2cpp.so)
- [docs/native-rva-targets.md](docs/native-rva-targets.md)

## Status Summary

- IL2CPP dump and RVA mapping are complete.
- Target functions and RVAs are confirmed from dump outputs.
- Instruction-level native disassembly could not be completed on this host in this session because available disassembly backends are missing.
- Python fallback path was attempted but blocked by package installation hangs for required ELF-disassembly libraries.
- Latest Ghidra export boundary pass shows that public method RVA/VA targets do not land on clean Ghidra function starts in the current analyzed program.
- The current blocker is address-space/function-boundary uncertainty, not missing helper exports.

## Tooling Attempts and Evidence

### Attempt E: Ghidra targeted boundary export
- Script: `tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java`.
- Export folder: `Reverse engineering/exports/seb-render-functions`.
- Boundary report: `Reverse engineering/exports/seb-render-functions/target-boundary-report.md`.
- Result:
  - `0x013EB4C8` lands inside `FUN_013eb4c0 @ 013eb4c0`.
  - `0x013EB3D4` lands inside `FUN_013eb2ac @ 013eb2ac`.
  - `0x013EBC0C`, `0x013EBED8`, and `0x013EBF90` land inside `FUN_013ebb5c @ 013ebb5c`.
  - `0x013EC2B8` lands inside `FUN_013ec0d0 @ 013ec0d0`.
  - `dump.cs` Offset target `0x013E73D4` was forced from undefined bytes into a small thunk: `013e73d4: b 0x013e73dc`.
- Interpretation:
  - Public entrypoint RVAs are not currently sufficient as direct Ghidra function starts.
  - Continue with boundary correction/caller context before claiming public parameter-to-formula closure.

### Attempt F: Offset-side mirror cluster reading
- Source files:
  - `FUN_013e7e70_013e7e70.c`
  - `FUN_013e80d0_013e80d0.c`
  - `FUN_013ec0d0_013ec0d0.c`
  - `FUN_013e850c_013e850c.c`
  - `FUN_013e7c5c_013e7c5c.c`
  - `FUN_015c381c_015c381c.c`
- Result:
  - `FUN_013e7e70` mirrors the orchestration behavior of `FUN_013eb4c0`.
  - `FUN_013e7c5c` mirrors the staged triple-emitter behavior of `FUN_013eb2ac`.
  - `FUN_013e850c` mirrors the staged insert/update behavior of `FUN_013ebb5c`.
  - `FUN_015c381c` is a pure 3-value packer.
  - `FUN_013e80d0` is a keyed staged-record lookup/matcher.
- Confirmed layout across both families:
  - staged key: `+0x10`
  - staged link: `+0x14`
  - payload fields: `+0x18`, `+0x1c`, `+0x20`
- Lookup wrappers around `FUN_013e80d0` retrieve, test, or return presence for staged `+0x20`, but do not connect it to a public draw parameter.
- Interpretation:
  - The triple-payload pipeline is now reinforced by two mirrored function families.
  - The final semantic meaning of the payload fields remains unresolved.
  - Do not label these payloads as x/y/frame/layer/anchor until a public call-site or metadata correlation proves it.

### Attempt G: Caller-correlation report
- Source file: `Reverse engineering/exports/seb-render-functions/caller-correlation-report.md`.
- Result:
  - Top-level producer/orchestrator/setup functions have zero normal code callers in Ghidra.
  - They do have DATA references clustered around `0x02a289xx` and `0x02a28axx`.
  - Internal lookup/insert helpers have normal code callers.
- Interpretation:
  - Top-level SEB public-facing functions may be referenced through IL2CPP metadata/delegate/function-pointer tables.
  - Need a data-table dump around `0x02a28900..0x02a28b00` to correlate DATA references with function families.

### Attempt H: Render function-pointer table
- Source file: `Reverse engineering/exports/seb-render-functions/data-table-correlation-report.md`.
- Map/builder meaning:
  - Found a dense internal table of map/sprite render helpers.
  - This helps identify which routines cooperate to choose, look up, and submit objects to the draw pipeline.
  - This moves the work closer to accurate object/facility layering, but not yet to final camera or screen-position formulas.
- Result:
  - Table starts at `0x02A28900` and uses 4-byte pointers.
  - Offset-side family entries include `FUN_013e6ed0`, `FUN_013e7e70`, `FUN_013e80d0`, and `FUN_013e850c`.
  - Rva-side family entries include `FUN_013ea520`, `FUN_013eb2ac`, `FUN_013eb720`, `FUN_013eb4c0`, `FUN_013ec0d0`, `FUN_013ecbd0`, and `FUN_013ebb5c`.
- Interpretation:
  - The top-level render helpers are likely dispatched from a table.
  - Next step is table-cluster-to-method correlation against IL2CPP method order.

### Attempt I: Render table to public draw method mapping
- Sources:
  - `tools/asset_extractor/il2cpp_dump/script.json`
  - `tools/asset_extractor/il2cpp_dump/dump.cs`
  - `Reverse engineering/exports/seb-render-functions/data-table-correlation-report.md`
- Map/builder meaning:
  - Started labeling internal draw helpers by practical drawing purpose.
  - This helps identify which code path controls sprite choice, frame selection, scale, anchor/pivot, layer, and repeated drawing.
  - This supports future facility/object rendering and layering work, but does not yet provide camera or tile-to-screen formulas.
- Correlations:
  - `ResourceManagerExtension.DrawSebImg` single image, public address `0x013EB4C8`, lands inside `FUN_013eb4c0`; table entry `0x02a28a30`.
  - `ResourceManagerExtension.DrawScaledSeb` frame overload, public address `0x013EC2B8`, lands inside `FUN_013ec0d0`; table entry `0x02a28a3c`.
  - `ResourceManagerExtension.DrawSebEx`, public address `0x013EB3D4`, lands inside `FUN_013eb2ac`; table entry `0x02a28a24`.
  - `ResourceManagerExtension.DrawSebImg` int-array overload plus two `DrawScaledSeb` overloads land inside `FUN_013ebb5c`; table entry `0x02a28ab4`.
  - `ResourceManagerExtension.DrawSebRepeatHorizontal`, public address `0x013ED0E0`, appears directly in the table at `0x02a28a7c`.
- Interpretation:
  - The table is useful, but not cleanly aligned one row per public draw method.
  - Some public method addresses still fall inside broader Ghidra functions.
  - Continue with entrypoint-boundary separation before deriving formulas from these helper bodies.

### Attempt J: Current draw-path meaning pass
- Sources:
  - `FUN_013ec0d0_013ec0d0.c`
  - `FUN_013eb4c0_013eb4c0.c`
  - `FUN_013ebb5c_013ebb5c.c`
  - `FUN_013eb2ac_013eb2ac.c`
  - `FUN_013eba88_013eba88.c`
  - `FUN_013ec540_013ec540.c`
  - `FUN_013ecbd0_013ecbd0.c`
  - `FUN_013ed0e0_013ed0e0.c`
- Map/builder meaning:
  - Current evidence explains how object/facility draw pieces are stored and submitted, especially when multiple sprite pieces or repeated records are involved.
  - This helps layering and facility composition work.
  - It does not yet provide the map camera, perspective, or tile-to-screen transform.
- Result:
  - `FUN_013ec0d0` prepares a draw container and inserts multiple record triples through `FUN_013ebb5c`.
  - `FUN_013eb4c0` submits a primary object plus optional stored-record array to the graphics pipeline.
  - `FUN_013ebb5c` manages draw records keyed by an incoming pair and stores payload fields at `+0x18`, `+0x1c`, and `+0x20`.
  - `FUN_013eb2ac` exports stored records as compact 3-value entries.
  - `FUN_013eba88` initializes draw-record storage.
  - `FUN_013ec540` grows/rebuilds record storage when capacity is reached.
  - `FUN_013ecbd0` exports the same records into alternate collection shapes when needed.
  - `FUN_013ed0e0` is currently only proven as lazy cache/object retrieval at `param_1 + 0x2c`, not as the full repeat-horizontal draw body.
- Interpretation:
  - Treat this subsystem as a draw-record manager plus a submission path.
  - Do not rename the 3 payload fields as x/y/layer/frame yet.
  - Next work should locate caller-side fill sites for `FUN_013ebb5c` arguments so the visual meaning of each payload field can be proven.

### Attempt K: Draw-record payload caller pass
- Sources:
  - `FUN_013ea520_013ea520.c`
  - `FUN_013ec0d0_013ec0d0.c`
  - `FUN_013ed26c_013ed26c.c`
  - `FUN_013ed5cc_013ed5cc.c`
  - `FUN_013eb720_013eb720.c`
  - `FUN_013eae08_013eae08.c`
  - `FUN_013ecb14_013ecb14.c`
- Map/builder meaning:
  - Current evidence shows how the game matches stored visual pieces and how it stores a value/reference on the matched piece.
  - This supports object/facility composition and duplicate-piece handling.
  - It still does not prove exact x/y, layer, frame, or image-id meaning.
- Result:
  - `FUN_013ed26c` extracts two values from an input object, looks up a third value from another object, and calls `FUN_013ebb5c` with mode `1`.
  - `FUN_013ed5cc` uses the same pattern but calls with mode `2`.
  - Mode `1` updates existing `record + 0x20` for a matching pair.
  - Mode `2` rejects/reports duplicate matching records.
  - `FUN_013eb720` searches records by the same two-field pair.
  - `FUN_013eae08` and `FUN_013ecb14` retrieve `record + 0x20` for a matching pair.
- Interpretation:
  - Confirmed cautious names:
    - payload 1 and payload 2: record match pair.
    - payload 3: stored draw value/reference.
  - Missing code: upstream caller context is needed to decide what the match pair means in game/map terms.
  - Next Ghidra export should target callers of `FUN_013ed26c`, `FUN_013ed5cc`, `FUN_013ea520`, `FUN_013ec0d0`, and the small table wrapper entries.

### Attempt L: Draw-record lookup/test/removal pass
- Sources:
  - `FUN_013ed18c_013ed18c.c`
  - `FUN_013ed8c4_013ed8c4.c`
  - `FUN_013ed9f8_013ed9f8.c`
  - `FUN_013ed564_013ed564.c`
  - `FUN_013eaf3c_013eaf3c.c`
  - `FUN_013eaff0_013eaff0.c`
  - `FUN_013ec750_013ec750.c`
  - `caller-correlation-report.md`
  - `data-table-correlation-report.md`
- Map/builder meaning:
  - The draw-record system supports visual-piece lifecycle behavior: add, update, check, compare, and remove.
  - This is relevant to facility/object pieces that appear, change state, or disappear.
  - It still does not prove the record pair's exact game meaning.
- Result:
  - `FUN_013ed18c` returns stored `record + 0x20` for an input object's two-value pair.
  - `FUN_013ed8c4` returns whether a record for that input object's pair exists.
  - `FUN_013ed9f8` removes/clears a record for that input object's pair.
  - `FUN_013eaf3c` compares a matched record's stored value with another value.
  - `FUN_013eaff0` compares then removes/clears a matched record.
  - `FUN_013ec750` unlinks and frees a matched record.
  - `FUN_028b3358` was found as an upstream caller/dispatcher but was not exported because low-address helpers filled the cap.
- Interpretation:
  - Keep cautious payload names: record match pair and stored draw value/reference.
  - The next export must include `FUN_028b3358`.
  - `BulkExportSebRender.java` was updated to seed `0x028B3358` and prioritize important targets before truncation.

### Attempt M: Step 9 visual-record caller relevance check
- Sources:
  - `FUN_028b3358_028b3358.c`
  - `disasm_window_028b3358.asm`
  - `caller-correlation-report.md`
  - `tools/asset_extractor/il2cpp_dump/script.json`
- Map/builder meaning:
  - This target does not advance static facility rendering, footprint placement, object anchoring, terrain alignment, camera feel, or draw layering.
  - It shows a generic storage/cache use of the same record helpers, so this path is lower priority for the visual world builder.
- Result:
  - Metadata places the surrounding method group in `System.Data.Common.Int32Storage`.
  - The method checks for a cached record with `FUN_013ecb14`, builds object values from an integer storage array if missing, and stores the result with `FUN_013eaed0`.
  - The caller found in the report is `FUN_028b327c`, also in the same storage-method region.
- Interpretation:
  - `FUN_013ecb14` and `FUN_013eaed0` are generic record/cache helpers, not proof of a map/facility system by themselves.
  - Mark `FUN_028b3358` as CURATED and stop following this branch unless a later map or facility caller reconnects to it.
  - Next analysis should target facility/map-specific code that can reveal static sprite composition, footprint, anchor, and layering rules.

### Attempt A: WSL-based disassembly
- Command path attempted: WSL + Linux objdump/readelf.
- Result: WSL not installed; system prompted interactive OS install.
- Evidence: command output requested installing WSL and waiting for key input.
- Action taken: aborted; no OS-level installs performed.

### Attempt B: Local native disassemblers on PATH
- Checked: r2/radare2/rabin2, llvm-objdump, objdump, dumpbin, ghidra, ida.
- Result: not found.

### Attempt C: Search common install paths
- Searched: Android SDK, LLVM, Visual Studio, Downloads, Git, msys/mingw paths.
- Result: no usable objdump/llvm-objdump/ghidra binaries found.

### Attempt D: Python fallback (pyelftools + capstone)
- Configured workspace .venv and attempted package installs.
- `install_python_packages` reported success, but configured interpreter still lacked modules.
- Confirmed error during execution: `ModuleNotFoundError: No module named 'elftools'`.
- Further direct pip attempts stalled/hung (no completion output).

## Target Function Analysis (Confirmed Data)

## 1) DrawSebEx
- Function: `ResourceManagerExtension.DrawSebEx`
- RVA: `0x13EB3D4`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L731)
- Parameters from signature:
  - source: ResourceManager
  - g: Graphics
  - x, y: draw position candidates
  - sebId: SEB resource id
  - frame default: -1
  - scale default: 100
  - anchor default: 17
  - layer default: -1
- Disassembly evidence:
  - Not extracted yet (instruction dump unavailable in current environment).
- Confirmed facts:
  - Uses explicit frame/scale/anchor/layer parameters at API boundary.
- Unknowns:
  - Exact source rect calculation logic.
  - Exact x/y offset math.
  - Pivot/origin math for anchor=17.
  - Internal layer precedence rules.

## 2) DrawSebImg
- Function: `ResourceManagerExtension.DrawSebImg`
- RVA: `0x13EB4C8`
- Overload RVA: `0x13EBC0C`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L735)
- Parameters from signature:
  - x, y, sebId, frame
  - imgId default: -1
  - layer default: -1
  - scale default: 100
  - anchor default: 17
  - overload with `int[] imgIds`
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Frame and image selection are explicit inputs.
  - Supports single imgId and multi-imgIds path.
- Unknowns:
  - Frame->source rect mapping logic.
  - Whether crop comes directly from SEB table or transformed intermediate.
  - Any OPT/OPTINFO consult inside method body.

## 3) DrawScaledSeb
- Function: `ResourceManagerExtension.DrawScaledSeb`
- RVAs:
  - `0x13EBED8`
  - `0x13EC2B8`
  - `0x13EBF90`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L753)
- Parameters from signature (across overloads):
  - x, y, sebId
  - frame
  - layer
  - scale
  - imgId default: -1
  - anchor default: 17
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Scale is parameterized directly in public API.
  - Anchor and layer exist in the most detailed overload.
- Unknowns:
  - Whether scale uses `scale/100` integer path or fixed-point variant.
  - Anchor pivot offsets and rounding behavior.

## 4) ChipPlaceSystem.Draw
- Function: `ChipPlaceSystem.Draw`
- RVA: `0x15094A8`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L44595)
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Draw pipeline method exists and is called from placement system context.
- Unknowns:
  - How map coordinates are converted to draw coordinates.
  - Which SEB draw primitive it dispatches to and with what transformed args.

## 5) ChipReplaceSystem.Draw
- Function: `ChipReplaceSystem.Draw`
- RVA: `0x15107B8`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L44803)
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Replace flow has dedicated draw path.
- Unknowns:
  - Final x/y + layer computation in replace mode.
  - Whether replace path adds extra offset or animation bias.

## 6) MapSystem.CreateMapChips
- Function: `MapSystem.CreateMapChips`
- RVA: `0x15B17D4`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L52261)
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Method takes xi/yi/width/height/flags, therefore controls chip creation layout.
- Unknowns:
  - Any direct draw-order/layer seed values emitted during creation.
  - Any stored pivot/offset fields set at creation time.

## 7) TownNatureSystem (present)
- Selected target: `TownNatureSystem.OnChangeMapChips`
- RVA: `0x15EFD80`
- Related RVAs:
  - `OnChangeMapChip`: `0x15EFB14`
  - `OnGrowNature`: `0x15F0878`
- Signature evidence: [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs#L55429)
- Disassembly evidence:
  - Not extracted yet.
- Confirmed facts:
  - Nature system reacts to map chip mutations and growth events.
- Unknowns:
  - Whether it directly mutates visual transform fields or only entity set membership.

## Cross-Cutting Questions

### Source rect
- Confirmed: frame/img inputs exist in DrawSebImg APIs.
- Unknown: exact extraction math from SEB data to source rect values.

### Crop/frame selection
- Confirmed: `frame` and `imgId` parameters exist.
- Unknown: fallback behavior for `frame=-1` and `imgId=-1`.

### X/Y draw offset
- Confirmed: x/y explicit parameters in draw functions.
- Unknown: additional runtime offsets, animation transforms, or anchor shifts.

### Scale
- Confirmed: `scale` parameter exists with default `100` in signatures.
- Unknown: precise arithmetic and rounding path.

### Pivot/origin
- Confirmed: `anchor` parameter default `17` exposed.
- Unknown: anchor decoding table and exact origin transform.

### Layer/draw order
- Confirmed: layer parameter exists (default `-1`).
- Unknown: layer fallback and sorting interactions.

### SEB frame usage
- Confirmed: SEB id + frame are central method inputs.
- Unknown: exact frame index interpretation and bounds behavior.

### OPT/OPTINFO usage
- Confirmed: no instruction-level proof captured yet.
- Unknown: whether native draw path consults OPT/OPTINFO directly or only preprocessed image records.

## Constants Currently Confirmed (API-level)

- Frame default: `-1`
- Scale default: `100`
- Anchor default: `17`
- Layer default: `-1`

Note: instruction-level immediates/constants are not yet extracted.

## Exact Rule To Apply Later In Lab/Map (Current Confidence)

- No new transform rule should be applied yet.
- Only safe confirmed rule set at this stage is the API surface defaults above (frame/scale/anchor/layer defaults), not internal math.
- Any lab/map transform change must wait for instruction-level native disassembly evidence.

## What Is Needed To Finish Native Math Extraction

One of the following must be available in-session:
1. A working native disassembler executable (`llvm-objdump`/`objdump`/Ghidra/IDA/radare2), or
2. A working Python environment where `pyelftools` + `capstone` import successfully.

Then perform:
1. RVA->file-offset mapping in arm64 `libil2cpp.so`.
2. Extract instruction windows for each target RVA.
3. Trace callouts and arithmetic to recover source rect, frame/crop, offset, scale, anchor pivot, and layer logic.
4. Update this file with direct disassembly snippets and formulas.
