# SEB Draw Transform Rule (First Evidence Extraction)

Date: 2026-05-16
Scope: evidence extraction only. No renderer/lab changes applied.

## Instruction-Level Confirmation Status

- Requested mode: instruction-level confirmation from completed Ghidra project.
- Current environment result: blocked from extracting instruction listings directly.
- What is available locally:
  - Ghidra repository database files under Reverse engineering/KingdomAdventures.rep
  - IL2CPP dump metadata and RVA mapping files in tools/asset_extractor/il2cpp_dump
- What is not available in this session:
  - `analyzeHeadless.bat` / runnable Ghidra binary on PATH or discoverable locations
  - usable local disassembler fallback (objdump/llvm-objdump/radare2)
- Consequence:
  - this document now provides strict confirmed-vs-inferred separation.
  - final instruction-confirmed math requires opening the listed RVAs inside the existing Ghidra project UI (or headless export) and recording exact instruction traces.

### New instruction trace evidence received

User provided decompiler trace for `FUN_013eb4c0`, which aligns with target region around DrawSebImg (RVA neighborhood 0x13EB4C8).

Confirmed from this trace:
- Static one-time initialization guard exists before render work (`DAT_02ba9a1d` branch).
- Rendering context argument is hard-required (`param_2 == 0` triggers fatal path).
- Frame selection has explicit fallback behavior:
  - if local frame value is zero, fallback calls `FUN_013edd24(...)`.
- Primary draw submission call happens via `FUN_01f530c4(param_2, ..., frame, ..., 0)` after frame resolution.
- Optional secondary path exists when `*(param_1 + 8) != 0`:
  - computes `iVar2 - iVar3` and passes the result through `FUN_009c4dac(...)`.
  - invokes `FUN_013eb2ac(...)` before a second `FUN_01f530c4(...)` draw submission.

Implications now upgraded from inferred to confirmed:
- Frame fallback logic is real and branch-driven (not purely parameter pass-through).
- DrawSebImg-family path can execute at least two draw submissions in one call path (base + conditional secondary submission).
- There is an explicit pre-draw transform/adjustment step in the conditional path (`FUN_013eb2ac(...)`).

Still unknown from this single function alone:
- exact semantic mapping of `param_1` fields to public arguments (`x`, `y`, `imgId`, `anchor`, `layer`, `scale`)
- exact arithmetic meaning of `iVar2 - iVar3` (whether this is x/y delta, frame delta, or another transform input)
- exact source-rect extraction line (U/V/W/H assembly point)
- exact anchor and layer finalization equations

### Additional instruction trace evidence received: FUN_013eb2ac

User provided decompiler trace for `FUN_013eb2ac(int param_1, int param_2, uint param_3, int param_4)`.

Confirmed from this trace:
- Hard precondition checks:
  - `param_2` must be non-null.
  - `param_3` is bounds-checked against `*(param_2 + 0xc)` (capacity/count style field).
  - available destination capacity is validated against pending active entries via:
    - `(destCount - param_3) >= (*(param_1 + 0x10) - *(param_1 + 0x18))`.
- Iterative processing:
  - loop count is `*(param_1 + 0x10)`.
  - per-iteration record pointer advances by 5 ints (`piVar9 = piVar9 + 5`).
  - branch gate `if (-1 < *piVar9)` controls whether an output element is written.
- Per-entry transform computation:
  - callsite shape is `FUN_015c38c0(&local_30, iVar8, iVar6, piVar9[4], *(... + 0xa8))`.
  - with confirmed `FUN_015c38c0` body, emitted tuple is a direct pack:
    - `local_30 = iVar8` (from `entry[2]`)
    - `local_2c = iVar6` (from `entry[3]`)
    - `local_28 = piVar9[4]` (from `entry[4]`)
  - output tuple `(local_30, local_2c, local_28)` is then written to contiguous 3-field slots.
- Output write layout:
  - destination index base uses `param_3` and increments (`uVar5 = param_3 + 1`).
  - write addresses are `*(param_2 + 0x10 + param_3*0xc)`, `+0x14`, `+0x18`.
  - `param_3` only advances when an active entry passes the gate and is emitted.

Instruction-level implication now confirmed:
- DrawSeb secondary path (from FUN_013eb4c0) performs a pre-draw generated triple-buffer write stage before the second draw submission.
- This stage is deterministic and ordered: precondition/capacity guards -> iterate records -> compute triple for active entries -> append to output buffer.
- In this function, triple values are copied from staged entry fields (`[2],[3],[4]`) rather than computed by arithmetic.

Still unknown from FUN_013eb2ac alone:
- semantic meaning of `(local_30, local_2c, local_28)` (likely depth/offset tuple, but not yet symbol-confirmed)
- exact role of `*(...+0xa8)` at this callsite (appears non-semantic here given setter-only callee, but ABI/decompile calling convention artifact still unresolved)
- whether this tuple maps to `(x,y,depth)` or another coordinate basis

### Additional instruction trace evidence received: FUN_013eb0d4

User provided decompiler trace for `FUN_013eb0d4(int param_1)`.

Confirmed from this trace:
- Conditional cleanup path is driven by `*(param_1 + 0x10)`:
  - if count/active-length is greater than zero, cleanup/reset logic executes.
- Hard null check on secondary buffer pointer:
  - reads `iVar2 = *(param_1 + 8)` and aborts fatally if null (`thunk_FUN_00a2ce90`).
- Buffer-clear calls use `FUN_020a5388(...)` twice:
  - first clear uses `(iVar2, 0, *(iVar2 + 0xc), 0)`.
  - second clear uses `(*(param_1 + 0xc), 0, iVar1, 0)` where `iVar1` was prior `*(param_1 + 0x10)`.
- State fields are reset after first clear:
  - `*(param_1 + 0x14) = -1`
  - `*(param_1 + 0x10) = 0`
  - `*(param_1 + 0x18) = 0`
- A monotonic counter/tick is incremented unconditionally:
  - `*(param_1 + 0x1c) = *(param_1 + 0x1c) + 1`.

Instruction-level implication now confirmed:
- The structure used by the `FUN_013eb2ac` pre-draw triple emission has an explicit lifecycle reset/clear routine.
- Generated entries are not append-only forever; they are periodically zeroed and state-reset before reuse.
- The tuple/write stage and the cleanup stage are part of the same managed buffer system, supporting deterministic frame-to-frame staging behavior.

Still unknown from FUN_013eb0d4 alone:
- precise semantic names for fields at `+0x10`, `+0x14`, `+0x18`, `+0x1c`
- whether `FUN_020a5388` is strictly memset-like or a typed container clear with side effects
- exact call-site ordering relative to DrawSebImg/DrawScaledSeb entrypoints in one full frame

### Additional instruction trace evidence received: FUN_013eb144

User provided decompiler trace for `FUN_013eb144(void)`:
- `uVar1 = FUN_013eb720();`
- `return ~uVar1 >> 0x1f;`

Confirmed from this trace:
- `FUN_013eb144` is a thin predicate wrapper around `FUN_013eb720`.
- Return value is normalized to a 0/1 style boolean via top-bit extraction of `~uVar1`.
- Equivalent predicate form: `return ((FUN_013eb720() & 0x80000000) == 0) ? 1 : 0`.
- Practical truth behavior:
  - returns `1` when `FUN_013eb720()` returns a value with high bit clear (`< 0x80000000`)
  - returns `0` when `FUN_013eb720()` returns a value with high bit set (`>= 0x80000000`, e.g. `0xffffffff` sentinel)

Instruction-level implication now confirmed:
- There is an explicit status/inversion gate function in the same runtime cluster as the SEB staging helpers.
- Any callsites of `FUN_013eb144` should be interpreted as checking an inverted status condition from `FUN_013eb720`, not performing transform arithmetic directly.

Still unknown from FUN_013eb144 alone:
- semantic meaning of `FUN_013eb720` status code domain
- whether non-zero negative/flagged values from `FUN_013eb720` map differently than simple 0/non-zero at callsites

### Additional instruction trace evidence received: FUN_013eb164

User provided decompiler trace for `FUN_013eb164(int param_1, int param_2, int param_3)`.

Confirmed from this trace:
- Function is a predicate-style scan over the same 5-int-stride entry array used in nearby helpers:
  - base points through `*(param_1 + 0xc)`.
  - active-loop bound uses `*(param_1 + 0x10)`.
  - per-entry pointer advances by 5 ints (`+5`).
  - entries are gated by `if (-1 < *entry)` before deeper checks.
- Mode split is controlled by `param_2`:
  - `param_2 == 0`: local field-based predicate mode.
  - `param_2 != 0`: external/comparator predicate mode using an object from `FUN_01032abc(...)`.
- `param_2 == 0` mode success condition:
  - for any active entry, if `entry[4] == 0`, function returns `1` immediately.
- `param_2 != 0` mode success condition:
  - resolves comparator object via `FUN_01032abc(*( ... param_3 ... ))`.
  - invokes virtual method at vtable offset `0x100` with `(entry[4], param_2, *(obj+0x104))`.
  - if comparator result is non-zero, function returns `1` immediately.
- If no entry satisfies the selected predicate, function returns `0`.
- Safety checks are strict/fatal:
  - null base/comparator object triggers fatal thunks.
  - index bounds checked against `*(base + 0xc)` during iteration.

Instruction-level implication now confirmed:
- The staged entry list has an explicit query/filter predicate routine with two evaluation modes.
- `entry[4]` is a key semantic field used both for direct zero-test and comparator-driven matching, strengthening that it is a primary tag/id for staged elements.
- This routine is boolean/query logic only; it does not perform draw transform arithmetic itself.

Still unknown from FUN_013eb164 alone:
- exact semantic identity of `entry[4]` (img id, line id, frame tag, or other key)
- what domain/value semantics `param_2` represents at callsites
- exact class/type returned by `FUN_01032abc` and meaning of its `0x100/0x104` slots

### Additional instruction trace evidence received: FUN_015c38c0

User provided decompiler trace for `FUN_015c38c0(undefined4 *param_1, undefined4 param_2, undefined4 param_3, undefined4 param_4)`.

Confirmed from this trace:
- Function performs direct tuple assignment only:
  - `param_1[0] = param_2`
  - `param_1[1] = param_3`
  - `param_1[2] = param_4`
- No arithmetic, no branching, no normalization, no coordinate conversion.

Instruction-level implication now confirmed:
- In `FUN_013eb2ac`, the call to `FUN_015c38c0(&local_30, iVar8, iVar6, piVar9[4], ...)` does not itself compute transforms; it only packs three values.
- Real transform/depth/anchor arithmetic must occur before this call (value preparation) or after tuple consumption, not inside `FUN_015c38c0`.

Still unknown from FUN_015c38c0 alone:
- why decompiler showed an extra argument at one callsite (likely calling convention/decompile artifact)
- exact semantic labels of the packed triple fields

### Additional instruction trace evidence received: FUN_01f530c4

User provided decompiler trace for `FUN_01f530c4(undefined4 param_1, int param_2, undefined4 param_3, int param_4)`.

Confirmed from this trace:
- Branch behavior is dispatch/state-selection oriented:
  - if `param_2 == 0`: selects global slot `DAT_02b25cc8` path.
  - if `param_2 != 0` and `param_4 != 0`: calls `FUN_01f54328()` and returns early.
  - if `param_2 != 0` and `param_4 == 0`: selects global slot `DAT_02b27034` path.
- Both non-early-return paths:
  - initialize/acquire runtime handle via `thunk_FUN_00a225b8()`.
  - resolve selected global object via `thunk_FUN_009ba630(...)`.
  - call `FUN_01fd1ea8(handle, resolvedObj, 0)`.
  - call non-returning `FUN_009c4e4c(handle, DAT_02b12d48_resolved)`.
- Function does not use `param_1` or `param_3` in shown body.
- No coordinate arithmetic or transform composition appears in this body.

Instruction-level implication now confirmed:
- Calls from DrawSeb paths into `FUN_01f530c4` represent render pipeline dispatch/final submission control, not per-sprite x/y/anchor/depth math computation.
- `param_2`/`param_4` control which submission branch or fallback routine is used.

Still unknown from FUN_01f530c4 alone:
- concrete semantic labels for `param_2` and `param_4` (mode/layer/queue class)
- exact render meaning of global slots `DAT_02b25cc8`, `DAT_02b27034`, and `DAT_02b12d48`
- relation between `FUN_01f54328` early-return path and visible draw outcomes

### Additional instruction trace evidence received: FUN_013edd24

User provided decompiler trace for `FUN_013edd24(int param_1)`.

Confirmed from this trace:
- Function repeatedly resolves context/object handles through `param_1 + 0x10` and nested `+0x60` links, with managed-object guard checks (`0xbd` flag pattern).
- Reads an integer value from nested location `**(int **)(resolved + 0x5c)`.
- If that value is non-zero, returns it directly.
- If that value is zero, computes replacement value via `FUN_014fd1bc(*( ... + 0xc))` and writes it back to the same nested slot (`**(int **)(... + 0x5c) = iVar1`).
- Returns the resolved/computed integer value in all paths.

Instruction-level implication now confirmed:
- `FUN_013edd24` is a lazy-init/get-or-create style value resolver used by DrawSeb fallback flow, not transform arithmetic.
- In `FUN_013eb4c0` fallback branch, this function likely supplies a cached/default frame-like or resource-id-like value when local frame input is zero.

Still unknown from FUN_013edd24 alone:
- exact semantic identity of the returned integer (frame id vs image id vs another render token)
- exact data type behind nested `+0x5c` and `+0xc` links
- whether `FUN_014fd1bc` is pure lookup or has side effects beyond value derivation

### Additional instruction trace evidence received: FUN_013eb720

User provided decompiler trace for `FUN_013eb720(int param_1, undefined4 param_2, undefined4 param_3, int param_4)`.

Confirmed from this trace:
- Fast-fail sentinel:
  - if `*(param_1 + 8) == 0`, returns `0xffffffff` immediately.
- Two lookup/evaluation branches based on `*(param_1 + 0x20)`:
  - branch A (`== 0`): obtains key via `FUN_020e8004(...)` and evaluates candidates with comparator object from `FUN_013edd24(...)` using vtable `+0x100` call.
  - branch B (`!= 0`): resolves callback entry from table (or via `FUN_00a1a954(...)`), computes key via callback, then evaluates candidates using another callback dispatch.
- Shared candidate traversal structure:
  - uses bucket/index indirection through structure at `*(param_1 + 8)`.
  - iterates linked/index chain via field at `entry + 0x14`.
  - candidate match prefilter compares `*(entry + 0x10)` against `(key & 0x7fffffff)`.
  - candidate payload values come from `entry + 0x18` and `entry + 0x1c` and are passed to comparator callbacks.
- Return semantics:
  - on successful comparator/callback match, returns current candidate index (`uVar3`/`uVar6`).
  - if traversal exits without match, returns fallback index/sentinel state from traversal logic.

Instruction-level implication now confirmed:
- `FUN_013eb720` is a keyed candidate-search routine over staged/render-associated records, with callback-driven match tests.
- `FUN_013eb144` is therefore an inverted validity-style gate over that search result:
  - true when returned value is non-sentinel range (`< 0x80000000`),
  - false when sentinel/high-bit value is returned (notably `0xffffffff`).
- This routine is search/filter control flow, not direct x/y/anchor/scale arithmetic.

Still unknown from FUN_013eb720 alone:
- exact concrete data model names for entry fields `+0x10/+0x14/+0x18/+0x1c`
- exact meaning of branch selector field at `*(param_1 + 0x20)`
- exact semantic domain of returned index (record id vs slot index vs chain node id)

### Additional instruction trace evidence received: FUN_013eba88

User provided decompiler trace for `FUN_013eba88(int param_1, undefined4 param_2, int param_3)`.

Confirmed from this trace:
- One-time static initialization guard exists (`DAT_02ba9a1e`):
  - initializes `DAT_02b01f18` and `DAT_02b007d4` via `FUN_009c4d4c(...)` once.
- Runtime precondition:
  - requires `*(DAT_02b01f18 + 0x74) != 0`, otherwise calls `thunk_FUN_00a10698()`.
- Resolves key/token `uVar1 = FUN_020405bc(param_2, 0)`.
- Writes manager/state fields:
  - `*(param_1 + 0x14) = -1`
  - `*(param_1 + 8) = FUN_009c4dac(DAT_02b007d4, uVar1)`
  - `*(param_1 + 0xc) = FUN_009c4dac(resolvedCtxD4, uVar1)` where `resolvedCtxD4` comes from `param_3` context chain via `+0x10 -> +0x60 -> +0xd4` with managed-object guard.
- Returns `uVar1`.

Instruction-level implication now confirmed:
- `FUN_013eba88` is a setup/initialization helper for the staging/search structures (not transform arithmetic).
- It prepares two lookup/storage handles in the manager object (`+8` and `+0xc`) and resets state marker `+0x14` before later scan/emit routines run.

Still unknown from FUN_013eba88 alone:
- exact semantic meaning of returned token `uVar1`
- exact data type role of handles stored at `param_1 + 8` and `param_1 + 0xc`
- exact high-level identity of global roots `DAT_02b01f18` and `DAT_02b007d4`

### Additional instruction trace evidence received: FUN_013eb450

User provided decompiler trace for `FUN_013eb450(undefined4 param_1, int param_2)`.

Confirmed from this trace:
- Builds a local 7-field struct-like buffer with zeroed leading fields and copied constant/default vector fields.
- Calls `FUN_01466ee4(&local_38, param_1, 2, ctxB0)` where `ctxB0` comes from `param_2` context chain (`+0x10 -> +0x60 -> +0xb0`).
- Calls `thunk_FUN_00a22200(ctxAC)` where `ctxAC` is from same context chain at `+0xac`.
- No x/y arithmetic, no anchor arithmetic, no layer arithmetic in this function body.

Instruction-level implication now confirmed:
- `FUN_013eb450` is a context-driven staging/submit helper that packages defaults and forwards to lower-level runtime APIs.
- It is orchestration/setup logic, not the location of SEB transform math.

Still unknown from FUN_013eb450 alone:
- exact semantic meaning of the local 7-field payload
- exact side effects of `FUN_01466ee4` and trailing `thunk_FUN_00a22200`

### Additional instruction trace evidence received: FUN_013eb420

User provided decompiler trace for `FUN_013eb420(undefined4 *param_1, undefined4 param_2, int param_3)`.

Confirmed from this trace:
- Initializes caller-provided buffer `param_1` as a 7-field payload:
  - first field zeroed
  - following fields filled from constant/default vector slots
  - one field explicitly re-zeroed (`param_1[3] = 0`)
- Calls `FUN_01466ee4(param_1, param_2, 2, ctxB0)` with `ctxB0` from `param_3` context chain (`+0x10 -> +0x60 -> +0xb0`).
- Function is void and performs no local draw-coordinate arithmetic.

Instruction-level implication now confirmed:
- `FUN_013eb420` is a payload initializer + forwarder variant of `FUN_013eb450`.
- This path reinforces that nearby helper cluster primarily prepares runtime payloads rather than computing transform equations.

Still unknown from FUN_013eb420 alone:
- exact semantic labels for payload fields `[0..6]`
- whether payload fields represent matrix/quaternion/color/state tuple or mixed render command args

### Additional instruction trace evidence received: FUN_013ebb5c

User provided decompiler trace for `FUN_013ebb5c(int param_1, int param_2, undefined4 param_3, undefined4 param_4, int param_5, int param_6)`.

Confirmed from this trace:
- Entry lifecycle/tick:
  - increments `*(param_1 + 0x1c)` on entry.
  - lazily initializes manager handles with `FUN_013eba88(...)` when `*(param_1 + 8) == 0`.
- Key generation branch mirrors FUN_013eb720/FUN_013ebb5c cluster:
  - when `*(param_1 + 0x20) == 0`, key derived via `FUN_020e8004(...)`.
  - when non-zero, key derived via callback-table dispatch.
  - key normalized with `& 0x7fffffff`.
- Bucket/chain traversal and duplicate detection:
  - bucket head resolved from hash table under `*(param_1 + 8)`.
  - chain traversed via per-entry next-index field at `+0x14`.
  - candidate prefilter on `entry + 0x10 == key`.
  - comparator checks against stored `(entry + 0x18, entry + 0x1c)` and incoming `(param_2, param_3)` via two-mode comparator path.
- Insert/update behavior when no duplicate match is accepted:
  - obtains/allocates entry index using `*(param_1 + 0x10)` and fallback/reuse logic with `*(param_1 + 0x18)` and `*(param_1 + 0x14)`.
  - writes entry fields:
    - `+0x10 = key`
    - `+0x14 = previous bucket head - 1` (next link)
    - `+0x18 = param_2`
    - `+0x1c = param_3`
    - `+0x20 = param_4`
  - updates bucket head to new index + 1.
- Return behavior:
  - returns `1` on insert and on update path when `param_5 == 1`.
  - returns `0` on duplicate/reject path and on `param_5 == 2` side-effect branch after `FUN_020a38e8(...)`.

Instruction-level implication now confirmed:
- `FUN_013ebb5c` is a central staged-record insert/update/query-control routine for the same hash/chain structure used by FUN_013eb720 and FUN_013eb2ac.
- Staged record layout now has strong structural confirmation:
  - key at `+0x10`
  - next-link at `+0x14`
  - comparison payload at `+0x18/+0x1c`
  - auxiliary payload at `+0x20`
- This routine manages deduplication and storage control flow; it does not directly compute x/y transform arithmetic.

Still unknown from FUN_013ebb5c alone:
- exact semantic mapping of `param_2`, `param_3`, `param_4` to render-domain meaning (frame/img/layer/depth/etc.)
- exact high-level meaning of mode selector `param_5` beyond observed branch outcomes
- exact interaction ordering between this insert/update routine and later triple emission in FUN_013eb2ac within one frame

## 1) Target functions and RVAs inspected

Primary targets:
- ResourceManagerExtension.DrawSebEx at RVA 0x13EB3D4 (VA 0x13EB3D4)
- ResourceManagerExtension.DrawSebImg at RVA 0x13EB4C8 (VA 0x13EB4C8)
- ResourceManagerExtension.DrawSebImg overload (imgIds path) at RVA 0x13EBC0C (VA 0x13EBC0C)
- ResourceManagerExtension.DrawScaledSeb at RVA 0x13EBED8 (VA 0x13EBED8)
- ResourceManagerExtension.DrawScaledSeb overload at RVA 0x13EC2B8 (VA 0x13EC2B8)
- ResourceManagerExtension.DrawScaledSeb overload at RVA 0x13EBF90 (VA 0x13EBF90)

Supporting SEB runtime path targets:
- ResourceManagerExtension.GetMaxFrame at RVA 0x13ED028
- ResourceManagerExtension.GetImage at RVA 0x13ED064
- Seb.GetSprite at RVA 0x2351CA0
- Seb.Draw at RVA 0x2353700
- Seb.DrawAnchor at RVA 0x2353DD4
- Seb.GetAnchorPosition at RVA 0x23547C4
- Seb.GetAnchorPositionF at RVA 0x235769C
- Seb.GetDepthInfo(frame, scale) at RVA 0x2353684
- Seb.GetDepthInfo(frame, scale, defaultDepth) at RVA 0x2348A2C
- Seb.GetDepthInfo(frame, scale, defaultDepth, ignoreDepth) at RVA 0x2357D78

## 2) Ghidra function names and addresses

Completed Ghidra project is present at:
- Reverse engineering/KingdomAdventures.rep

Address-based targets to open in Ghidra (from IL2CPP dump mapping):
- DrawSebEx: 0x13EB3D4
- DrawSebImg: 0x13EB4C8
- DrawSebImg (imgIds): 0x13EBC0C
- DrawScaledSeb: 0x13EBED8 / 0x13EC2B8 / 0x13EBF90
- Seb.DrawAnchor: 0x2353DD4
- Seb.GetAnchorPosition: 0x23547C4
- Seb.GetDepthInfo: 0x2353684

Note:
- In this pass, function names/addresses are confirmed from dump metadata and used as Ghidra navigation anchors.
- Instruction-level pseudocode extraction from Ghidra database is still pending for final math confirmation.

## 3) Parameter meaning evidence

Evidence from DrawSeb signatures:
- DrawSebEx(source, g, x, y, sebId, frame=-1, scale=100, anchor=17, layer=-1)
- DrawSebImg(source, g, x, y, sebId, frame, imgId=-1, layer=-1, scale=100, anchor=17)
- DrawScaledSeb(source, g, x, y, sebId, frame, layer, scale, imgId=-1, anchor=17)

Evidence from SEB sprite/runtime structures:
- Sprite fields expose source/crop and transform-carrying members:
  - U, V, W, H
  - X, Y
  - TransX, TransY
  - FrameNo, TexId
- SEB render methods expose anchor and layer application points:
  - Draw(frame, layer=-1)
  - DrawAnchor(frame, layer, anchor)
  - GetAnchorPosition(frame, anchor)
- Depth and ordering-related APIs include scale input:
  - GetDepthInfo(frame, scale, ...)

## 4) Decompiled/native snippets or summarized math

Confirmed structural evidence:
- DrawSeb path accepts explicit x/y, frame, imgId, anchor, layer, scale inputs.
- Internal animation transform helper exists and has fields:
  - x, y, scaleX, scaleY, angle
- SEB draw pipeline exposes frame and line-based sprite selection:
  - GetSprite(frameNo, lineNo)
- Sprite payload contains crop rectangle and per-sprite offsets:
  - crop: U, V, W, H
  - offset: X, Y and TransX, TransY

Strongly indicated call chain shape:
- DrawSebImg and DrawScaledSeb feed Seb draw methods.
- Anchor handling likely routes through Seb.DrawAnchor and Seb.GetAnchorPosition.
- Layer handling likely routes through Draw or DrawAnchor overloads with layer argument.

Additional native-structure evidence from dump metadata:
- Sprite struct exposes exact crop/offset carriers:
  - U, V, W, H
  - X, Y
  - TransX, TransY
- Seb exposes layer/anchor/render entrypoints:
  - Draw(frame, layer)
  - DrawAnchor(frame, layer, anchor)
  - GetAnchorPosition(frame, anchor)
  - GetDepthInfo(frame, scale, ...)
- ResourceManagerExtension exposes orchestration and helpers:
  - DrawSebEx, DrawSebImg, DrawScaledSeb overload set
  - GetMaxFrame, GetImage
  - UpdateImageAnimation, PopOut, SwingUpDown

## 5) Confirmed formula (first-pass confidence)

This section separates confirmed from provisional.

### Confirmed vs inferred matrix

- Source rect selection:
  - Confirmed: crop fields are carried by Sprite.U/V/W/H.
  - Inferred: exact branch/order that selects sprite record from frame/img path.
- Frame selection:
  - Confirmed: frame is explicit parameter and frame helpers exist.
  - Inferred: exact fallback branch for frame=-1 and flip-path precedence.
- X/Y offset order:
  - Confirmed: inputs exist (x,y) and sprite offsets exist (X/Y, TransX/TransY).
  - Inferred: exact operation order with anchor adjustment and animation transform.
- Scale handling:
  - Confirmed: scale parameter exists; depth queries consume scale.
  - Inferred: exact arithmetic path and rounding behavior.
- Anchor/pivot:
  - Confirmed: anchor parameter and anchor-position methods exist.
  - Inferred: exact anchor table math and at-what-step application.
- Layer/depth:
  - Confirmed: layer parameter exists; draw/render-layer and depth APIs exist.
  - Inferred: exact default-layer resolution for layer=-1 and final ordering rule.

Source rect selection (confirmed data model, provisional execution order):
- Confirmed data model:
  - Source crop rectangle is represented by Sprite.U, Sprite.V, Sprite.W, Sprite.H.
- Provisional execution rule:
  - sourceRect = sprite(U, V, W, H) where sprite comes from GetSprite(frameNo, lineNo).

Frame selection (partially confirmed):
- Confirmed controls:
  - frame input parameter exists across DrawSeb methods.
  - helper methods exist for frame behavior (IsFlipFrame, GetFlipFrame, GetRemoveFlipFrame).
  - GetMaxFrame and GetImage(source, sebId, frame, layer) exist.
- Provisional execution rule:
  - if frame is explicit, use it; if default or negative path is used, runtime selects an effective frame via GetCurFrame or default frame path.

X/Y offset (partially confirmed):
- Confirmed data channels:
  - Draw APIs take x and y.
  - Sprite has X/Y and TransX/TransY.
  - Seb has SetOffset and ClearOffset.
- Provisional execution rule:
  - drawX = inputX + sprite.X + sprite.TransX + sebOffsetX + anchorAdjustX
  - drawY = inputY + sprite.Y + sprite.TransY + sebOffsetY + anchorAdjustY

Scale handling (partially confirmed):
- Confirmed controls:
  - scale parameter default is 100.
  - DrawScaledSeb overloads route scale explicitly.
  - GetDepthInfo(frame, scale, ...) takes scale.
- Provisional execution rule:
  - scaleRatio is derived from scale relative to 100.
  - depth/layer support data may be recomputed using scaled depth path.

Anchor and pivot handling (partially confirmed):
- Confirmed controls:
  - anchor parameter default is 17.
  - anchor-specific methods exist: DrawAnchor and GetAnchorPosition.
- Provisional execution rule:
  - anchorAdjust is obtained from GetAnchorPosition(frame, anchor) and applied to draw position before final blit.

Layer and draw order (partially confirmed):
- Confirmed controls:
  - layer parameter default is -1.
  - Draw and RenderLayer overloads accept layer.
  - GetLayersNum exists.
  - depth-related APIs exist (DepthInfo, GetDepthInfo).
- Provisional execution rule:
  - layer -1 triggers default layer selection path.
  - non-negative layer selects explicit frame sub-layer path.

## 6) Unknowns

Still unknown pending instruction-level native tracing:
- Exact branch logic for frame -1 and imgId -1 fallback.
- Exact order of operations between sprite offsets, anchor offsets, and animation transform offsets.
- Exact scale arithmetic details (integer division, rounding, fixed-point behavior).
- Exact mapping from imgId or lineNo to sprite index in all branches.
- Exact default layer resolution when layer is -1.
- Whether OPT or OPTINFO is read in these exact target methods or only through earlier preprocessing.

Instruction-level confirmation unknowns (explicit):
- exact compare/branch sequence controlling frame/img fallback
- exact arithmetic instructions for anchor-adjusted x/y
- exact scale multiply/divide order and integer truncation points
- exact layer/depth write path used for final draw submission

## 7) Exact rule the website lab should implement later

Do not apply yet. Use this as the candidate implementation target pending final native confirmation:

Candidate SEB draw rule:
1. Resolve effective frame and line/img index.
2. Fetch sprite record for that frame/index.
3. Build source crop from sprite U, V, W, H.
4. Compute anchor adjustment via anchor function using frame and anchor id.
5. Compute draw position from:
   - input x/y
   - sprite X/Y
   - sprite TransX/TransY
   - optional SEB-level offsets
   - anchor adjustment
6. Apply scale relative to 100 in DrawScaledSeb path.
7. Resolve layer:
   - explicit layer if provided
   - default layer path when layer is -1
8. Render through layer-aware draw path.

Promotion gate before website implementation:
- Confirm each step above with instruction-level Ghidra trace for:
  - DrawSebImg
  - DrawSebEx
  - DrawScaledSeb

## 8) Producer-side arithmetic found in the exported bulk set

The earlier remaining gap was not a single missing function. The export set now shows the producer-side math split across at least two paths:

### Path A: FUN_013ea520 -> FUN_013ebb5c (Direct Staging Path)

**Instruction-confirmed field extraction (lines 103-111 of FUN_013ea520):**

```c
iVar13 = piVar7[2];              // Field 1 extraction
iVar1 = piVar7[3];               // Field 2 extraction
if (uVar4 <= uVar10) {
  thunk_FUN_00a2cef4();
}
FUN_013ebb5c(param_1,
  iVar13,                        // arg1 = piVar7[2]
  iVar1,                         // arg2 = piVar7[3]
  piVar7[4],                     // arg3 = piVar7[4]
  2,                             // arg4 = 2 (literal)
  *(undefined4 *)
    (*(int *)(*(int *)(*(int *)(*(int *)(*(int *)(param_4 + 0x10) + 0x60) + 0x40) + 0x10) + 0x60) + 0x88)  // arg5
);
```

**Confirmed facts:**
- This is the point where source records have their fields extracted and passed to staged-record insert/update.
- piVar7 is a 5-int-stride record array from Seb object at offset +0x10.
- Per-loop increment: `piVar7 = piVar7 + 5` (20-byte stride).
- Gate condition: `if (-1 < *piVar7)` controls whether extraction proceeds.
- arg5 to FUN_013ebb5c is resolved via multi-level context chain from param_4 (render context).

**Direct semantic implication:**
- `piVar7[2]` and `piVar7[3]` are the first two fields of staged entry payloads (matching `entry[+0x18]` and `entry[+0x1c]` from FUN_013ebb5c confirms).
- `piVar7[4]` is the third payload field (matches `entry[+0x20]`).
- Mode/constant `2` is passed as arg4, matching the `param_5` mode observed in FUN_013ebb5c calls.

**Still unknown:**
- Exact semantic names (e.g., are these [x, y, depth]? [frame, img, anchor]? [id, variant, mode]?).
- Whether values in piVar7[2..4] are raw or pre-transformed.

### Path B: FUN_013ecbd0 -> Secondary Packing + FUN_013eb2ac (Secondary Draw Path)

**Instruction-confirmed extraction (Two branches identified):**

**Branch 1 (lines 79-96): Direct Triple Packing**

```c
iVar10 = piVar11[2];            // Field 1 extraction
iVar7 = piVar11[3];             // Field 2 extraction
if (uVar6 <= uVar5) {
  thunk_FUN_00a2cef4();
}
iStack_2c = 0;
local_30 = 0;
local_28 = 0;
FUN_015c38c0(&local_30,         // Output buffer
  iVar10,                        // arg1 = piVar11[2]
  iVar7,                         // arg2 = piVar11[3]
  piVar11[4],                    // arg3 = piVar11[4]
  *(undefined4 *)(*(int *)(*(int *)(param_4 + 0x10) + 0x60) + 0xa8)  // arg4
);
local_40 = CONCAT44(iStack_2c, local_30);  // Pack result
local_38 = local_28;
iVar10 = thunk_FUN_00a22200(...);          // Context lookup
```

**Branch 2 (lines 108-114): Packing with Intermediate Lookup**

```c
local_30 = piVar9[2];           // Field 1 extraction
iStack_2c = piVar9[3];          // Field 2 extraction
uVar4 = thunk_FUN_00a22200(     // Intermediate lookup
  *(undefined4 *)
    (*(int *)(*(int *)(param_4 + 0x10) + 0x60) + 0x38),
  &local_30
);
if (*(uint *)(iVar10 + 0xc) <= uVar3) {
  thunk_FUN_00a2cef4();
}
local_40 = 0;
FUN_020404c8(&local_40,         // Output buffer
  uVar4,                         // arg1 = lookup result
  piVar9[4],                     // arg2 = piVar9[4]
  0                              // arg3 = 0 (literal)
);
uVar4 = (undefined4)local_40;    // Unpack result (first 4 bytes)
uVar1 = local_40._4_4_;         // Unpack result (second 4 bytes)
```

**Confirmed facts:**
- Both branches extract values from piVarX[2], piVarX[3], piVarX[4] (same fields as Path A).
- Branch 1 directly passes these to FUN_015c38c0 (tuple packer, no arithmetic).
- Branch 2 performs an additional intermediate lookup (offset 0x38 from context) before passing to FUN_020404c8 (secondary packing function).
- In Branch 2, the result is unpacked into two 4-byte values (uVar4 and uVar1).
- Both branches handle these values before calling FUN_013eb2ac (triple emission writer).

**Conclusion on field source:**
- All three producer paths (Path A direct staging, Path B Branch 1, Path B Branch 2) consume piVarX[2], piVarX[3], piVarX[4] as the core semantic payload.
- These fields are consistently treated as a tuple that can be either staged directly (Path A) or pre-packed via secondary functions (Path B).
- The record source is Seb sprite array at base + 0x10, with 5-int stride (20-byte record size).

### Current conclusion on remaining gaps

**Confirmed:**
1. The producer-side assembly logic is split across two main paths: direct staging (Path A) and secondary packing (Path B).
2. Both paths extract the same three fields from Seb sprite records.
3. piVar7/piVar11/piVar9[2], [3], [4] are the semantic core payload fields.
4. These fields flow into either FUN_013ebb5c (direct insert/update) or secondary packing functions (FUN_015c38c0, FUN_020404c8) before emission.

**Unknown (semantics only, not structure):**
- What do piVarX[2], piVarX[3], piVarX[4] represent in the rendering domain?
  - Possibilities include: [x, y, depth], [frame_index, image_id, layer], [id, variant, mode], or other combinations.
- Exact meaning of the lookup operations in Branch 2 (offset 0x38, offset 0xa8, etc.) and their role in transform composition.
- Whether piVarX values are pre-transformed or require further arithmetic after packing.
  - Seb.DrawAnchor and Seb.GetAnchorPosition
  - Seb.GetDepthInfo paths

  ## RVA-First Instruction Trace Procedure (when Ghidra executable access is available)

  Use this exact order and avoid random FUN browsing:

  1. Open RVA 0x13EB4C8 (DrawSebImg) first.
  2. Trace calls into:
    - DrawSebImg overload at 0x13EBC0C
    - helper calls resolving frame/img/sprite selection.
  3. Open RVA 0x13EB3D4 (DrawSebEx) and confirm orchestration/default routing.
  4. Open RVAs 0x13EBED8, 0x13EC2B8, 0x13EBF90 (DrawScaledSeb overloads) and extract scale math instructions.
  5. Confirm anchor path by tracing into:
    - Seb.DrawAnchor at 0x2353DD4
    - Seb.GetAnchorPosition at 0x23547C4
  6. Confirm layer/depth path by tracing into:
    - Seb.Draw/RenderLayer path
    - Seb.GetDepthInfo at 0x2353684 / 0x2357D78.

  For each target, capture in this file:
  - first 20-40 instructions at function entry
  - every branch that changes frame/img/layer/anchor/scale behavior
  - final arithmetic expression form for x and y
  - exact constants used in arithmetic and comparisons
