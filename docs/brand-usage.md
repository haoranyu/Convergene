# Convergene Brand Asset Handoff

## Concept

The mark shows three open discussion paths converging into one focused outcome. Its intentionally open silhouette avoids the eye/lens appearance of earlier explorations and stays readable at small sizes.

## Design tokens

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary path | `--color-primary` | `#1D4ED8` | Mark strokes and app-icon background |
| Outcome accent | `--color-accent` | `#D97706` | Endpoint in the color mark only |
| Wordmark | `--color-foreground` | `#0F172A` | Product name and monochrome mark |
| Surface | `--color-surface` | `#FFFFFF` | Light background and inverse icon mark |

All production assets use flat colors. Do not add gradients, glows, shadows, outlines, or 3D effects.

## Asset map

| File | Intended use |
| --- | --- |
| `convergene-mark.svg` | Default color mark on a light surface |
| `convergene-mark-monochrome.svg` | Single-color print, disabled-color, or constrained contexts |
| `convergene-logo-horizontal.svg` | Documentation and static brand lockups; the product UI should prefer the mark plus live text |
| `convergene-app-icon.svg` | Source for rounded app icons and social/profile avatars |
| `convergene-app-icon-maskable.svg` | Source for PWA maskable and Apple touch assets |
| `convergene-app-icon-1024.png` | High-resolution app-store/profile source |
| `convergene-app-icon-512.png` | PWA icon |
| `convergene-app-icon-192.png` | PWA icon |
| `apple-touch-icon-180.png` | Apple touch icon |
| `favicon-32.png` / `favicon.ico` | Browser favicon fallback |
| `convergene-logo-horizontal-1280.png` | Issue, README, and social preview where SVG is unsuitable |

## Product implementation

1. Put the source SVGs in a dedicated public brand-assets directory; do not duplicate the path geometry inside feature components.
2. Use the color mark beside a live `Convergene` text label in the application shell. Live text preserves localization-independent accessibility and follows the existing font stack.
3. Render the shell mark at `24 × 24px`, with an `8px` gap before the wordmark. Use `18px / 700` live text and `#0F172A` unless the surrounding component specifies a stronger heading size.
4. Use `convergene-app-icon-192.png` and `convergene-app-icon-512.png` in the web app manifest. Mark the maskable source/output with `purpose: "maskable"`.
5. Use `apple-touch-icon-180.png` for the Apple touch link and `favicon-32.png` plus `favicon.ico` as browser fallbacks.
6. The logo is decorative when immediately followed by the visible product name: use empty alt text for an image or `aria-hidden="true"` for inline SVG. A standalone icon link/button must have a localized accessible name.

## Clear space and sizing

- Keep clear space around the standalone mark equal to at least one endpoint diameter.
- Minimum recommended mark size: `20px`; default shell size: `24px`.
- Use the simplified white monochrome mark inside the blue app icon. The amber endpoint is reserved for the larger color mark because blue/orange contrast is insufficient at favicon sizes.
- Do not crop or independently reposition the three paths and endpoint.
- Do not place the color mark on the Primary blue background; use the white inverse app-icon mark instead.

## Acceptance criteria

- The app shell, metadata, favicon, manifest, and touch icon use the supplied sources rather than reconstructed geometry.
- The mark is optically centered at 16, 24, 32, 64, 192, and 512px.
- Asset colors match the documented tokens exactly.
- The horizontal wordmark is spelled `Convergene`.
- No eye/lens silhouette, outgoing arrow, gradient, shadow, or extra decoration is introduced.
- Accessible naming follows the rules above.
