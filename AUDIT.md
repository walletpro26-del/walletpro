# UI, startup performance, and security review

Local changes, 15 October 2026. Not deployed.

## Changes

- One persistent HTML startup spinner remains visible until Firebase auth resolves. Removed the second React startup spinner.
- Recent transaction descriptions have a 38-character-width preview with ellipsis. Full details remain in the transaction modal and the desktop tooltip. Long titles shrink without pushing out amounts. Rows support Enter and Space; focus indicators and reduced-motion styles are available.
- Sharing opens a lazy-loaded modal. PDF exports and their dependencies no longer appear in the production HTML preload list. Shared Vite helpers have their own chunk so they cannot pull PDF code into startup.
- Hashed assets use cache-first loading. API requests and authenticated requests bypass the service worker; API responses specify no-store. Old service-worker caches are purged on activation without deleting unrelated caches or version metadata.
- Financial snapshots use an explicit or authenticated UID, without scanning other users' caches. Empty snapshots replace deleted records. Offline queues are UID-scoped; legacy unscoped pending queues are deliberately not replayed because their owner is unknown. Account changes reset financial UI state and reject late dashboard results.
- Firestore rules require verified admin email, prevent review takeover, restrict audit-log mutation, and prevent clients from granting paid/admin subscription privileges. A single bounded three-day trial remains permitted. These rules need emulator validation and deployment before production enforcement changes.
- Bank consent callbacks must match the authenticated user's stored consent. Bank sync requires authentication, and consent creation checks an unexpired Ultra/trial entitlement. Removed development authentication bypass and the hardcoded encryption-key fallback. ENCRYPTION_KEY must be exactly 64 hexadecimal characters.
- Fixed invalid `FI Types` JavaScript in the Setu request and missing subscription modal imports. Removed the modal's attempt to list every user's subscription.
- Removed startup keyboard/context-menu interception; these did not provide a server-side security boundary.

## Verification and limits

- `npm run build` succeeds.
- `node --test tests/security-regressions.test.mjs` covers snapshot isolation, queue isolation/cleanup, encryption failures/tamper detection, service-worker API exclusion/cache-first behavior, and PDF preload exclusion. Build first.
- Syntax checks passed for modified bank handlers and service worker.
- Browser preview attempts to localhost timed out, so desktop/mobile visual behavior and authenticated CRUD, imports, exports, and bank provider flows have not been verified end to end.
- Dependency audit could not reach registry.npmjs.org (DNS failure). No dependency vulnerability clearance is claimed.
- Firestore emulator/rules integration tests were not available. Live rules, provider permissions, deployment headers, and external service behavior were not tested.

## Release requirements and remaining work

- Paid Razorpay checkout is intentionally blocked before any charge: the existing implementation activated access from a browser payment ID without server-side verification. Admin activation remains available. Before restoring checkout, implement server-created orders, signature/payment verification, trusted pricing, and idempotent entitlement updates. Do not simply restore the old client activation path.
- Deploy the app, functions, and Firestore rules together after emulator and authenticated staging checks. Provision a private ENCRYPTION_KEY; inspect/migrate any bank handles encrypted using the former default key.
- Legacy unscoped offline writes remain stored and are not automatically migrated; recover only after confirming ownership.
- Existing subscription records should be audited for unauthorized grants predating these rule changes.
- Firebase remains the largest startup dependency (about 195 KB gzip). The removed PDF preload was about 139 KB gzip; this is a bundle reduction, not a measured loading-time improvement. Measure cold/warm starts and Web Vitals on a real mobile connection before further tuning.
- Repository contains Android signing material (`android.keystore`). Confirm its storage and repository history access; no key contents were read or changed during this review.

Rule field restrictions follow Firebase's documented `diff().affectedKeys()` approach: https://firebase.google.com/docs/firestore/security/rules-fields

## Follow-up UI refinement

- Replaced the duplicate-search combobox with one editable input, explicit Clear controls, keyboard navigation, and optional multi-selection. Empty edits now immediately update the form instead of restoring the old value on blur.
- Details use a multiline editor with category-specific history suggestions. Recurring descriptions group reference changes, prefer matching recipients, and reuse the most recent original description. Auto-fill only applies to empty or previously auto-filled details when the category/recipient changes; user edits are preserved. Clear remains empty until the user changes context or explicitly reuses a suggestion.
- Added reference-value selection, compact rounded field focus, and payment-mode persistence between consecutive saves.
- Simplified the Admin badge and rebuilt Accounts, Settings, and Storage with neutral styling, compact action menus, plain section headings, and fewer decorative panels. Existing account management and settings handlers remain connected. Document scan estimates no longer overwrite the manually entered cloud storage metric.
- Verified the actual entry form and admin presentation components in isolated local fixtures using sample data, at desktop and mobile widths. Confirmed automatic reuse, reference selection, clearing across blur, preservation of custom text, and payment mode retention after consecutive saves. No live account changes, messages, or admin writes were performed.
- Lending contacts are reused from history and collapsed behind Edit contact for known people. Contact corrections are stored with the saved record and take precedence even when the edited transaction has an older date. New people can add contacts, and explicit contact clearing is preserved. Remarks suggest prior descriptions ranked by person and transaction type.
- Moved lending attachments beside Amount. For whom and Category share one expense-form row; payment is a compact control above the auto-sizing details editor. Removed duplicate detail suggestions and empty helper spacing. The header uses less vertical space.
- Replaced bright blue/purple surfaces with warm neutrals, a charcoal header and restrained green accents. Bank History has compact toolbars, neutral filters, expandable descriptions and aligned amounts. Reports use a single period selector, smaller summaries and simpler breakdown rows.
- `node --test tests/expense-detail-suggestions.test.mjs tests/person-contacts.test.mjs tests/security-regressions.test.mjs` passes all twelve checks after building.


### Mobile-first and tools-menu follow-up — 15 October 2026

- Replaced duplicate mouse-down/click menu actions with native buttons and one click handler. Removed the decorative menu tiles, badges, and repeated icons.
- Added a shared body-portal popup for entry suggestions, global search, and report filters. It uses VisualViewport bounds, follows page/nested scrolling and keyboard resize/pan, switches above the anchor when space is limited, and constrains list scrolling to the visible area. Entry lists no longer close on blur before a selection click arrives.
- Reduced mobile form spacing and control typography, retaining separate clear/toggle targets and iOS 16px editing text to avoid focus zoom. Kept context fields side by side.
- Simplified Settings, Import, Reviews, and Subscription headers; retained all existing workflows and the earlier compact admin panel. Added dialog names, focus containment, Escape dismissal, focus restoration, and body scroll locking. Blocking subscription screens retain their explicit close restrictions.
- Made review stars keyboard-operable buttons and connected review labels to their fields.
- Fixed settings backup to export the current account’s scoped cached records. Clear cache now clears only that account’s snapshots and preserves preferences and pending offline writes. Backup is a cached-record export; it does not fetch uncached cloud records or include attachment bytes.

Validation: production build and the existing 12 regression tests pass. Browser fixture checks cover 320px and 390px phone widths, successful category/person selection, report filtering (Fuel → one transaction / ₹3,300), tools-menu navigation, settings/import/reviews, and a 390×420 reduced-height viewport with the suggestion panel entirely within bounds. No real accounts, imports, reviews, payments, refreshes, or logout were submitted. A reduced-height desktop viewport does not reproduce an actual Android/iOS keyboard; verify keyboard resize/panning on physical devices before release.


### Installed-phone startup follow-up — 15 October 2026

The phone screenshots show the packaged/installed launch splash followed by the HTML auth-initialization loader. The earlier form palette changes had not covered the hardcoded HTML startup colors, web manifest, Android TWA colors, or packaged splash artwork.

Changed the launch background/status/navigation colors to charcoal (#202b27), replaced the second branded splash with one 30px neutral spinner, and simplified lazy-view loading to a plain 28px spinner. Updated the web and Android icon/splash exports from reproducible code geometry (`scripts/generate-brand-icons.py`), and switched React/favicons to green. Removed the wrapper's extra 300ms splash fade. Android's own launch screen remains a distinct platform-controlled stage.

Bumped service-worker cache to v11 and the deployed version marker; service-worker registration bypasses its HTTP cache, and Netlify entry/manifest/worker headers now request revalidation. These source changes have not been deployed during this task. Existing installed native artwork/colors require an updated Android package; clearing website cache alone cannot replace those packaged resources.

Validation: production web build passes, all 15 regression tests pass, and diff whitespace check passes. Inspected the rendered 512px icon. Android debug build was attempted using the existing offline Gradle cache, then retried without custom daemon JVM arguments; both executions failed before Android compilation with `java.io.IOException: Unable to establish loopback connection`. No new APK/AAB was produced or installed, and physical-phone launch transitions remain unverified.
