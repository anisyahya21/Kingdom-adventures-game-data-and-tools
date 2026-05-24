# APKLab IL2CPP Architecture Check

- APKLab project root: `C:\APK-RE\kingdom-adventurers`
- Architectures present: `arm64-v8a` and `armeabi-v7a`
- `libil2cpp.so` exists in both ABI folders:
  - `lib/arm64-v8a/libil2cpp.so`
  - `lib/armeabi-v7a/libil2cpp.so`
- `global-metadata.dat` is exposed at:
  - `assets/bin/Data/Managed/Metadata/global-metadata.dat`
- `assets/bin/Data` exists
- Java/smali appears heavily obfuscated and likely acts as wrapper/service layer around Unity runtime and platform integrations

## Targeted Java/Smali Boundary Inspection (No Gameplay Logic Analysis)

Focused only on `UnityPlayerActivity` / main activity / native loading / JNI boundaries.

- Main launcher activity is Unity-based:
  - `AndroidManifest.xml` declares `main.Main` as LAUNCHER/MAIN and includes `unityplayer.UnityActivity=true` metadata
  - `main.Main` extends `com.unity3d.player.UnityPlayerActivity` (`java_src/main/Main.java`, `smali_classes2/main/Main.smali`)
- Unity activity bootstrap boundary:
  - `UnityPlayerActivity.onCreate(...)` instantiates `UnityPlayer`, sets it as content view, and forwards lifecycle/input to Unity (`java_src/com/unity3d/player/UnityPlayerActivity.java`, `smali/com/unity3d/player/UnityPlayerActivity.smali`)
- Native loading boundary:
  - `UnityPlayer.loadNative(...)` loads `libmain.so` (`System.load`/`System.loadLibrary("main")`) then invokes `NativeLoader.load(...)` (`java_src/com/unity3d/player/UnityPlayer.java`, `smali/com/unity3d/player/UnityPlayer.smali`)
- JNI boundary:
  - `UnityPlayer` declares many `native*` methods (`initJni`, `nativeRender`, `nativePause`, `nativeResume`, etc.), indicating Java is largely a bridge into native runtime
  - Additional JNI bridge exists (`bitter.jnibridge.JNIBridge.invoke(...)`)

## Conclusion

Gameplay logic is primarily IL2CPP/native, not Java.

## Recommended Next Step

Map `global-metadata.dat` symbols/types to `libil2cpp.so` and continue native placement/rendering analysis.
