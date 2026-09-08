# Changelog

All notable changes to legroomcompany.com. Format follows Keep a Changelog. Dates are UTC.

## [Unreleased]

## [1.1.0] - 2026-09-08

### Changed
- Logo recolored for the sky: mark in Signal Yellow, wordmark in Bone. The SVG is now inlined so the two parts can be colored in CSS.
- The sign is a static element with an idle press animation (a self-press into its base every 4.6 seconds). It is no longer a mailto link and has no hover or focus states.

### Removed
- The email line under the sign.

## [1.0.0] - 2026-09-08

### Added
- Coming-soon page: art-directed sky background, charcoal logo lockup, yellow arcade-button sign linking to mailto, email line.
- `_headers` cache policy for Cloudflare: immutable assets, uncached HTML.
- Deployed via Cloudflare Workers static assets from GitHub. Custom domains for the apex and www, www redirects to the apex.
