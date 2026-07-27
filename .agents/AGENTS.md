# WalletVibe — Multi-Layer & Play Store (.aab) Development & Deployment Standards

This document establishes mandatory rules for all updates to the WalletVibe project across Web, PWA, and Play Store Native Android App Bundle (.aab) targets.

---

## 1. Google Play Store Android App Bundle (.aab) Mandates
- **Format Requirement**: All Android builds for Google Play Store MUST be packaged in the official `.aab` (Android App Bundle) format. APK format is strictly prohibited for Play Store releases.
- **Packaging Mechanism**: Built via Trusted Web Activity (TWA) / Bubblewrap (`bubblewrap build`).
- **Digital Asset Links Verification**:
  - `public/.well-known/assetlinks.json` MUST be published at `https://walletvibe.netlify.app/.well-known/assetlinks.json`.
  - Must include the package name (`app.netlify.walletvibe.twa`) and SHA-256 fingerprint generated from the upload keystore so Android hides the browser address bar for a 100% fullscreen native app experience.
- **Target API Version**: Android 14 (API level 34+).
- **Play App Signing**: Managed by Google Play Console.

---

## 2. Multi-Layer Synchronization Protocol (Whenever WebApp is Updated)
Whenever any feature, bug fix, or UI change is made to the React codebase:

1. **Layer 1 (Web App - Netlify CDN)**:
   - Code committed & pushed to GitHub (`git push origin main`). Netlify builds and deploys to global edge nodes.
2. **Layer 2 (PWA Browser & Home Screen Install)**:
   - Service Worker version bump in `public/sw.js` and `manifest.json` so installed PWAs auto-fetch updated bundles without requiring manual clear cache.
3. **Layer 3 (Play Store .aab Bundle)**:
   - Update `versionCode` (e.g. `101 -> 102`) and `versionName` (e.g. `1.0.1 -> 1.0.2`) in `twa-manifest.json` / `build.gradle`.
   - Run `bubblewrap build` to compile the signed `app-release-signed.aab`.
   - Upload `.aab` to Google Play Console Production Track.
4. **Layer 4 (Multi-Device Viewport Parity)**:
   - Ensure responsive flexbox/grid layout parity across:
     - Mobile Portrait & Landscape (360px - 480px)
     - Tablets & Foldables (768px - 1024px)
     - Laptops & Desktops (1280px+)
     - ChromeOS & Android Tablets.

---

## 3. Strict Code & UX Guidelines
- **No Browser Native Dialogs**: Never use `window.alert()` or `window.confirm()`. Always use `showConfirm()` or `showAlert()` from `CustomDialogModal.jsx`.
- **User-Friendly Error Messages**: Always wrap raw exceptions with `getUserFriendlyError()` from `userFriendlyError.js`.
- **Offline-First Snapshot Syncing**: Always write data mutations to `saveSnapshot('bank'|'expenses'|'lending', ...)` alongside Firestore `writeBatch` queries.
- **Deterministic Duplicate Scanner**: Enforce 5-step verification (Amount, DR/CR, Date <= 1d, 12-digit UPI RRN match, Merchant token match).
