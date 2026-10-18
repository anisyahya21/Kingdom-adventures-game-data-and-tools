# Website branding

Selected: original Kairo & Wairo duo, on its dark circular background. Source PNG: `kairo-wairo-original.png`.

The shared page toolbar uses `/brand/kairo-wairo-v1-64.png`. Browser icons use versioned PNG and SVG URLs so previously cached red icons are not reused. `/favicon.svg` and `/favicon.ico` also provide the original duo for clients that request the conventional paths. The root Apple touch icon uses the 180px PNG. The event-reminder app's manifest and its separate app icon remain unchanged.

The four Sally Prin explorations are preserved in `sally-variants/`, including both early princess interpretations and the corrected square-head, pink-ribbon versions. These are archived alternatives, not the selected website logo. `archive.json` records SHA-256 hashes. They were generated with the built-in image-generation tool from the original duo and the native Sally Prin reference, then refined to remove the hair and crown in favor of a square head and pink ribbon.

Share-card designs remain proposals; this change only applies toolbar branding and site/browser icons.

## Verification

- Vite production bundle builds successfully (`build.log`).
- Frontend typecheck has 48 pre-existing errors; the complete diagnostic set matches the unchanged baseline (`typecheck-comparison.json`).
- Local browser checks cover the homepage and monster-spawn page at 320px, 390px and 1440px, including the original logo, no horizontal overflow or header collisions, and the versioned favicon links (`local-verification.json`).
- PNG, SVG and ICO responses match the intended local asset bytes. Conventional favicon paths also contain the original duo.
- The toolbar's account-retry label becomes “Retry” on mobile, retaining its full accessible name, so an unavailable account connection does not crowd the logo and site name.
