# Runtime Code Target Report

Date: 2026-05-16
Scope: extracted APK/Unity files and project tools only. No renderer/lab edits.

## 1) Whether runtime code exists in the extracted files

Conclusion: runtime IL2CPP artifacts are present and were successfully dumped.

What exists now:
- global-metadata.dat and libil2cpp.so from extracted APK files.
- Successful Il2CppDumper outputs (dump.cs, script.json, il2cpp.h, stringliteral.json, DummyDll).
- Decompiled Assembly-CSharp symbol surface from DummyDll.

Important caveat:
- DummyDll decompile primarily exposes signatures and RVAs, not full native method bodies.
- Full method-body recovery still requires native disassembly workflow (Ghidra/IDA/Binary Ninja) using script.json + il2cpp.h mapping.

## 2) Exact file paths found

### Runtime inputs used
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so

### Dump outputs generated
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\dump.cs
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\script.json
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\il2cpp.h
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\stringliteral.json
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\DummyDll\Assembly-CSharp.dll

### Decompiled DummyDll source
- C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\decompiled_Assembly-CSharp\Assembly-CSharp.decompiled.cs

## 3) Which files should be decompiled next

Primary targets (for real render-function body recovery):
1. tools/asset_extractor/il2cpp_dump/script.json
2. tools/asset_extractor/il2cpp_dump/il2cpp.h
3. tools/asset_extractor/apk_runtime_extract/extracted/lib/arm64-v8a/libil2cpp.so

Secondary targets (supporting context):
4. tools/asset_extractor/il2cpp_dump/dump.cs
5. tools/asset_extractor/il2cpp_dump/decompiled_Assembly-CSharp/Assembly-CSharp.decompiled.cs
6. APK Unity assets (globalgamemanagers/sharedassets/level0) for data-link validation

## 4) Whether we need an IL2CPP dump step

Yes, and this step has been completed.

Reason:
- The dump generated mapping artifacts and DummyDll symbols.
- Remaining gap is native method body reconstruction from libil2cpp.so using the generated mappings.

## 5) Exact next extraction/decompile command for Windows

### A) Command executed successfully (PowerShell)

Set-Location C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website
tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.exe \
	"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so" \
	"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat" \
	"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump"

### B) Current next step (native analysis)

Load libil2cpp.so in Ghidra/IDA and apply script.json + il2cpp.h mapping to locate target methods by RVA and symbols.

### C) Optional signature-level scan already done

ilspycmd was installed and used to decompile DummyDll Assembly-CSharp to a single C# file for symbol searching.

Recovered candidate symbol areas include:
- ResourceManagerExtension / DrawSeb* methods
- MapChipComponentExtension / SebComponentExt
- MapChip, MapSystem, MapChipColorSystem, ChipPlaceSystem, ChipReplaceSystem
- TownNatureSystem and related nature handling methods

---

Status: IL2CPP dump complete; symbol-level targets identified. Next action is RVA-level native disassembly to recover exact transform math implementation.
