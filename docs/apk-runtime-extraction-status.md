# APK Runtime Extraction Status

Date: 2026-05-16
Task scope: extraction/decompile setup only.

## Discovery Result

- Source provided by user: unpacked APK directory
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\apk kingdom adventures
- APK files found in Downloads:
  - C:\Users\anisb\Downloads\Kingdom Adventurers_2.6.2_APKPure.apk
  - C:\Users\anisb\Downloads\kingdom-adventurers-2-6-2(1).apk
  - C:\Users\anisb\Downloads\kingdom-adventurers-2-6-2.apk
- Canonical APK baseline selected:
  - C:\Users\anisb\Downloads\Kingdom Adventurers_2.6.2_APKPure.apk
- APK path found or missing: missing (no .apk files found in workspace or source directory)
- Setup action performed:
  - Mirrored the provided unpacked APK directory into:
    - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted

## Extraction Paths

- extracted APK folder:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted
- il2cpp dump output folder:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump

## Runtime Detection (current)

- runtime type: IL2CPP
- global-metadata.dat path:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat
- libil2cpp.so paths:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\armeabi-v7a\libil2cpp.so
- Assembly-CSharp.dll path: not found
- architecture note: lib folder contains arm64-v8a and armeabi-v7a only; prefer arm64-v8a for primary dump.

## Exact Next Command To Run

Run this now from the canonical APK baseline (clean re-extract), then dump:

```powershell
Set-Location "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website"
7z x "C:\Users\anisb\Downloads\Kingdom Adventurers_2.6.2_APKPure.apk" -o".\tools\asset_extractor\apk_runtime_extract\extracted" -y

Il2CppDumper.exe `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump"
```

If you want to skip re-extract and use already mirrored extracted files, run:

```powershell
Set-Location "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website"
Il2CppDumper.exe `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump"
```

Optional fallback (32-bit lib):

```powershell
Il2CppDumper.exe `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\armeabi-v7a\libil2cpp.so" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat" `
  "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump"
```

If a future build contains Mono artifacts instead, next decompiler step:

```powershell
# Open in ILSpy or dnSpyEx
# File to open:
# C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\**\Assembly-CSharp.dll
```

## Expected Output Files After Dumping

For IL2CPP dump (typical Il2CppDumper output) in tools/asset_extractor/il2cpp_dump:
- DummyDll\Assembly-CSharp.dll (and other dummy assemblies)
- script.json
- stringliteral.json
- il2cpp.h
- ida.py
- ghidra.py (tool/version dependent)

For Mono path:
- No dump artifacts required; direct decompiler analysis of Assembly-CSharp.dll.

## Execution Status

- Il2CppDumper installed at:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.exe
- Dump execution result:
  - exit code 0 (success)
  - metadata version: 31
  - il2cpp version: 31
  - note from tool: "ERROR: This file may be protected." (dump still completed)
- Generated files confirmed:
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\dump.cs
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\script.json
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\il2cpp.h
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\stringliteral.json
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\DummyDll\Assembly-CSharp.dll
- Additional decompile artifact (signature-level):
  - C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\decompiled_Assembly-CSharp\Assembly-CSharp.decompiled.cs
