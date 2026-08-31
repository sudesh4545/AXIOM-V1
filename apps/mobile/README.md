# AXIOM V1 Mobile

Native Capacitor projects for Android and iOS. The app loads the secure live
AXIOM service inside a native application shell.

## Android

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
