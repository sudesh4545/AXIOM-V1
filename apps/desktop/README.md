# AXIOM V1 for Windows

This is the standalone Windows client. It opens AXIOM in its own secure app
window; users do not need Chrome or Edge after installing it.

## Build locally

```powershell
npm install
npm run build:win
```

The installer is written to `release/`.

The free installer is unsigned, so Windows SmartScreen may ask the user to
confirm the first launch. Windows Security does not need to be disabled.
