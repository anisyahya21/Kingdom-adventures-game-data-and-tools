# IL2CPP File Locations

This file identifies the IL2CPP runtime and metadata files found in the workspace, and classifies which files appear original versus generated.

## Original extracted IL2CPP files

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\arm64-v8a\libil2cpp.so`
  - Appears original.
  - Extracted from the APK runtime extraction folder.
  - Likely the actual game `libil2cpp.so` binary.
  - Safe to share only with a trusted reverse engineer, not publicly.

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\lib\armeabi-v7a\libil2cpp.so`
  - Appears original.
  - Extracted APK library for the 32-bit ABI.
  - Likely the game runtime binary for armv7.
  - Safe to share only with a trusted reverse engineer, not publicly.

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\apk_runtime_extract\extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat`
  - Appears original.
  - Extracted IL2CPP metadata from the APK.
  - Likely the companion metadata file for `libil2cpp.so`.
  - Safe to share only with a trusted reverse engineer, not publicly.

## Generated IL2CPP dump outputs

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\dump.cs`
  - Appears generated.
  - Typical output file from Il2CppDumper / similar IL2CPP dumping tools.
  - Safe to share with another reverse engineer.

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\script.json`
  - Appears generated.
  - Likely created by Il2CppDumper as dump configuration metadata.
  - Safe to share with another reverse engineer.

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\DummyDll\Il2CppDummyDll.dll`
  - Appears generated.
  - Typical dummy assembly produced during IL2CPP dumping.
  - Safe to share with another reverse engineer.

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_dump\il2cpp.h`
  - Appears generated.
  - Likely produced to support native reconstruction and decompilation.
  - Safe to share with another reverse engineer.

## Related IL2CPP tool outputs

- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.exe`
- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.dll`
- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.runtimeconfig.json`
- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\Il2CppDumper.deps.json`
- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper\il2cpp_header_to_ghidra.py`
- `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\il2cpp_tools\Il2CppDumper-net6-v6.7.46.zip`
  - These are IL2CPP tool binaries and scripts, and they strongly indicate Il2CppDumper was used for the generated dump outputs.

## Summary

### Exact original inputs
- `libil2cpp.so` (arm64-v8a)
- `libil2cpp.so` (armeabi-v7a)
- `global-metadata.dat`

### Exact generated outputs
- `dump.cs`
- `script.json`
- `DummyDll\Il2CppDummyDll.dll`
- `il2cpp.h`

### Likely tool
- Il2CppDumper (based on the tool folder and generated output names).

### Safe to share with another reverse engineer
- Generated dump outputs in `tools\asset_extractor\il2cpp_dump\`.
- `Il2CppDumper` tool distribution under `tools\asset_extractor\il2cpp_tools\Il2CppDumper\`.

### Not safe to share publicly without permission
- Original extracted runtime binaries and metadata in `tools\asset_extractor\apk_runtime_extract\extracted\...`.
