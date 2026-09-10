# Performance and company workflow audit — 11 September 2026

## Changes

- Removed 89 perpetual animation declarations, including overrides that reenabled
  previously disabled particle and glow animation. Kept short page and interaction
  transitions. Removed persistent layer-promotion hints and expensive mobile
  backdrop filters; reduced-motion preferences take precedence.
- Used native document scrolling on touch screens, safe-area padding, larger touch
  controls, bounded popup/dialog scrolling and keyboard focus traps. Deferred
  offscreen operation panels on mobile.
- Split authentication and secondary dashboard pages into lazy chunks. The main
  page module is 83,678 bytes versus the previous 248,232 bytes; shared framework
  and Firebase dependencies still load separately. This is a module-size comparison,
  not a measured cold-start or FPS claim.
- Replaced two eagerly loaded decorative PNGs (5,210,700 bytes combined) with a
  theme-selected WebP (99,602 bytes dark / 139,732 bytes light). Mobile screens do
  not request this artwork. Removed unsupported login uptime/speed claims.
- Kept cached dashboards visible during network failure, added retry and online
  recovery, bounded API wait times, guarded workspace races, and fixed toast timers.
- Added persistent company/workspace names and business objectives, role enforcement
  and audit records. Added actionable setup guidance and honest demo labels.
- Replaced naive CSV splitting and silent 100-row truncation with validated parsing,
  batches, progress, stable retry keys, row errors and an in-place dashboard refresh.
- Scoped experiment approval to the explicit workspace even when another browser
  tab changes the saved active-workspace preference.
- Fixed simulations rejecting newly measured recommendations because they compared
  them with an old saved snapshot. Simulation validation now uses current evidence.
- Corrected chart endpoint spacing, duplicate axis keys and the empty-workspace
  recommendation status type.
- Updated static caching to reuse immutable assets without background refetches,
  retain cache writes correctly, bound cache growth and handle network failures.
- Android 0.2.0 adds a local reconnect page, a shorter splash, keyboard resizing,
  readable status-bar icons and explicit hardware acceleration.
- Deployment now installs locked dependencies and validates code before publishing.

## Verification

- 62 frontend/domain tests pass, including CSV parsing, validation and retry behavior.
- 19 live local API groups pass, including company settings, tenant isolation,
  event deduplication, simulations, policy enforcement, assignments, exposure,
  outcomes and automatic guardrail rollback. The suite seeds explicitly synthetic
  local Sandbox evidence and refuses hosted targets.
- Local 50-request concurrent dashboard smoke: all returned HTTP 200 in 5,729 ms
  total. This is a local development-server smoke, not a production latency SLO.
- Python API suite passes (62 tests).
- TypeScript, lint (zero warnings) and production web build pass. Cloudflare's
  deployment dry run passes. Android 0.2.0 builds successfully and APK signature
  verification passes. Deployment results are recorded in the delivery message.

No Android device was attached during this audit, so physical-device scrolling,
thermal behavior, FPS, provider sign-in and real customer ingestion still require
device/customer validation. Existing external integration adapters require company
delivery configuration; they do not connect third-party accounts automatically.

## References consulted

- [MDN: CSS performance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS)
- [MDN: content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)
- [Cloudflare: Worker deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- Installed Capacitor 8.5.0 configuration declarations and Cloudflare Wrangler 4.127.1 schema.
