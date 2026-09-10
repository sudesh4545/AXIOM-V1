# AXIOM V1 Mobile

Native Capacitor projects for Android and iOS. The app loads the secure live
AXIOM service inside a native application shell.

## Android

Use JDK 21 and Android SDK 36. Set `JAVA_HOME` to your JDK 21 installation and
`ANDROID_HOME` to your Android SDK before building. Version 0.2.0 includes the
reconnect page, shorter splash, safe-area layout and improved dashboard rendering.

```powershell
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

The directly installable test APK is generated under
`android/app/build/outputs/apk/debug/`.

## iOS

The iOS project is generated and kept in `ios/`. Building for a physical iPhone
requires macOS, Xcode, and an Apple signing identity. Public TestFlight/App Store
distribution requires an Apple Developer membership.
