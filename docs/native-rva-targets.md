# Native RVA Targets From IL2CPP Dump

Date: 2026-05-16
Scope: Build a concrete method target list for native disassembly using existing dump artifacts.

## Inputs Used

- dump symbol file:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\dump.cs
- signature-level decompile file:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\decompiled_Assembly-CSharp\Assembly-CSharp.decompiled.cs

## Priority Target Group A: SEB Rendering and Transform Hooks

These methods are closest to sprite placement math and animation transforms.

1) ResourceManagerExtension.DrawSebEx
- RVA: 0x13EB3D4
- Signature: DrawSebEx(ResourceManager source, Graphics g, int x, int y, int sebId, int frame = -1, int scale = 100, int anchor = 17, int layer = -1)

2) ResourceManagerExtension.DrawSebImg
- RVA: 0x13EB4C8
- Signature: DrawSebImg(ResourceManager source, Graphics g, int x, int y, int sebId, int frame, int imgId = -1, int layer = -1, int scale = 100, int anchor = 17)

3) ResourceManagerExtension.DrawSebImg (imgIds overload)
- RVA: 0x13EBC0C
- Signature: DrawSebImg(ResourceManager source, Graphics g, int x, int y, int sebId, int frame, int[] imgIds, int scale = 100)

4) ResourceManagerExtension.UpdateImageAnimation
- RVA: 0x13EBA9C
- Signature: UpdateImageAnimation(ResourceManager source, int imgId)

5) ResourceManagerExtension.PopOut
- RVA: 0x13EBD14

6) ResourceManagerExtension.SwingUpDown
- RVA: 0x13EBDF8

7) ResourceManagerExtension.DrawScaledSeb (3 overloads)
- RVA: 0x13EBED8
- RVA: 0x13EC2B8
- RVA: 0x13EBF90

## Priority Target Group B: Map Placement and Draw Pipelines

These methods are likely to feed final x/y and chip orientation into rendering calls.

1) ChipPlaceSystem.Draw
- RVA: 0x15094A8

2) ChipPlaceSystem.DrawPopup
- RVA: 0x150A7A8

3) ChipPlaceSystem.DrawPopup (static)
- RVA: 0x150A7DC

4) ChipPlaceSystem.DrawButtons
- RVA: 0x1509954

5) ChipPlaceSystem.CheckPlace (core checks)
- RVA: 0x15039CC
- RVA: 0x1508238
- RVA: 0x1509380

6) ChipReplaceSystem.Draw
- RVA: 0x15107B8

7) ChipReplaceSystem.DrawPopup
- RVA: 0x1510B60

8) ChipReplaceSystem.DrawDynamic
- RVA: 0x1510D28

## Priority Target Group C: Map/Nature State That Can Affect Visual Output

These methods may not directly draw pixels, but can alter which entities are present and colored.

1) MapChipColorSystem.SetMapChipColors
- RVA: 0x15AE224

2) MapChipColorSystem.SetColor
- RVA: 0x15AE5D8
- RVA: 0x15AE018

3) MapSystem.ChangeMapChip
- RVA: 0x15AF9CC

4) MapSystem.CreateMapChips
- RVA: 0x15B17D4

5) MapSystem.GetEntranceDir
- RVA: 0x15B30E8
- RVA: 0x15B31F0

6) TownNatureSystem.OnChangeMapChip
- RVA: 0x15EFB14

7) TownNatureSystem.OnChangeMapChips
- RVA: 0x15EFD80

8) TownNatureSystem.OnGrowNature
- RVA: 0x15F0878

## Suggested Native Trace Order

1) Group A in order (DrawSebEx -> DrawSebImg -> DrawScaledSeb) to recover direct coordinate, anchor, and scaling math.
2) Group B draw methods to identify how map chip state is converted into x/y inputs passed to Group A.
3) Group C methods only when resolving state-driven visual differences.

## What This Gives You Right Now

- A concrete list of native entry points with RVAs to open first in libil2cpp.so.
- A reduced search surface for transform math recovery.
- A deterministic progression from draw primitive methods outward into map systems.
