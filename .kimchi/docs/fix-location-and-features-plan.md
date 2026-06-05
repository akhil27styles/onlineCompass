# Online Compass: Fix Location Detection + Feature Additions

## Goal
Fix the sun/moon position location detection bug (always "detecting") and add monetization-attractive features.

## Root Cause
1. `sun-position.astro` and `moon-position.astro` do not call `prefetchLocationSilently()` on load (unlike `index.astro`).
2. `bindSkyDialFromLocation()` reads cached coords but does nothing if cache is empty.
3. Browser geolocation without prior permission can be slow (8s timeout) or fail silently on some devices.
4. No fallback exists when browser geolocation is unavailable.

## Architecture
- **IP Geolocation First**: Use a free IP geolocation API (ipapi.co, ipgeolocation.io) for instant approximate location (~200ms). This provides immediate sun/moon data while browser geolocation refines it in the background.
- **Parallel Fetching**: Request IP location and browser geolocation simultaneously; use whichever returns first, then upgrade to more precise coords when available.
- **Cached City**: Already exists. City name persists in localStorage.

---

## Chunk 1: IP Geolocation Fallback + Faster Browser Geolocation

### Files to modify:
- `src/lib/geo.ts` — add `fetchLocationFromIP()` and `requestLocationWithFallback()`
- `src/scripts/location-manager.ts` — use fallback on init

### Details:
1. **Add `fetchLocationFromIP()`** in `geo.ts`:
   - Try `https://ipapi.co/json/` (free, no key, CORS enabled)
   - Fallback to `https://ipgeolocation.io/api/v1/ipgeo?apiKey=demo` if first fails
   - Returns `{ latitude, longitude, source: 'ip' }`
   - Cache IP-derived coords separately (less precise, but instant)

2. **Add `requestLocationWithFallback()`** in `geo.ts`:
   - Spawns both `requestLocation({ precise: false })` and `fetchLocationFromIP()` in parallel via `Promise.race` for first result
   - Also keep both running in background; if browser geo returns later with better accuracy, dispatch update event
   - This ensures fraction-of-second response

3. **Reduce `geoOptionsFast.timeout`** from `8_000` to `4_000` (faster fail → faster fallback)

4. **Update `location-manager.ts`**:
   - In `init()`, if no cached coords, call new `requestLocationWithFallback()` instead of `requestLocation()`
   - Handle IP-derived coords as "approximate" — show city/approx location immediately, mark as "refining…"
   - When precise coords arrive later, silently upgrade

### Acceptance Criteria:
- IP geolocation returns within 500ms on typical connection
- Sun/moon pages show approximate location within 1 second even without browser permission
- Browser geolocation still works when permission is granted
- No UI stuck in "Detecting…" for more than 2 seconds

---

## Chunk 2: Fix Sun/Moon Pages to Initiate Location

### Files to modify:
- `src/pages/sun-position.astro`
- `src/pages/moon-position.astro`

### Details:
1. Add `import { prefetchLocationSilently } from '../lib/geo';` and call it at top of `<script>` (like index.astro)
2. This ensures cached coords exist when `bindSkyDialFromLocation` runs
3. Also add `document.addEventListener` for `oc:location-needs-permission` to update the SkyDial status to show a clear "Tap Allow to enable location" message

### Acceptance Criteria:
- Direct navigation to `/sun-position/` or `/moon-position/` triggers location fetching immediately
- SkyDial shows initial data from IP fallback within 1 second
- Permission prompt handler is wired correctly

---

## Chunk 3: Weather Widget (Attractive Feature)

### Files to create:
- `src/components/WeatherWidget.astro` — displays current weather
- `src/lib/weather.ts` — fetches weather from Open-Meteo (free, no key)

### Details:
1. **Open-Meteo API**: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
2. **Weather codes**: Map WMO codes to icons/text (sunny, cloudy, rain, snow, etc.)
3. **Display**: Temperature, condition text, humidity %, wind speed
4. **Placement**: Add to sun-position.astro and moon-position.astro sidebar, below location panel

### Acceptance Criteria:
- Weather loads within 1 second of location being known
- Displays meaningful weather data
- Gracefully handles API failures
- Matches Vercel dark-first design

---

## Chunk 4: Google AdSense Ad Slots

### Files to create:
- `src/components/AdSlot.astro` — reusable ad container

### Files to modify:
- `src/layouts/Layout.astro` — add AdSense script placeholder
- `src/pages/index.astro` — add 2 ad slots (mid-page, bottom)
- `src/pages/sun-position.astro` — add 1 ad slot in sidebar
- `src/pages/moon-position.astro` — add 1 ad slot in sidebar
- Generate `public/ads.txt` with placeholder

### Details:
1. **AdSlot component**: Styled container with fixed dimensions, supports `format` prop (`responsive`, `horizontal`, `vertical`)
2. **Script**: Add commented-out AdSense script block in Layout.astro head with clear instructions for the user to insert their publisher ID
3. **Ad placements**:
   - Home page: Between features grid and FAQ section
   - Home page: Above footer
   - Sun page: In sidebar below weather widget
   - Moon page: In sidebar below weather widget
4. **ads.txt**: Placeholder file explaining the user needs to add their AdSense ID

### Acceptance Criteria:
- Ad containers render without breaking layout
- Responsive sizing works on mobile and desktop
- User can activate by uncommenting one line in Layout.astro

---

## Chunk 5: New SEO Utility Pages

### Files to create:
- `src/pages/gps-coordinates.astro` — What's My GPS Coordinates page
- `src/pages/compass-bearings.astro` — Compass Bearings Reference page

### Details:
1. **GPS Coordinates page**: Shows live coordinates with copy-to-clipboard, lat/lon converter (DMS ↔ decimal), map link. This drives search traffic for "what is my gps coordinates."
2. **Compass Bearings page**: Reference table of compass bearings (0-360°), cardinal/intercardinal directions with explanations. Drives educational search traffic.
3. Both use existing SiteShell, SiteFooter, LocationPrompt, follow DESIGN.md
4. Add links in SiteShell nav and SiteFooter

### Acceptance Criteria:
- Pages render correctly and are mobile-friendly
- GPS page shows coordinates and allows copy
- Bearings page shows a clean reference table
- Navigation links work

---

## Chunks Summary
| Chunk | Files | Complexity |
|-------|-------|------------|
| 1 | `src/lib/geo.ts`, `src/scripts/location-manager.ts` | Medium |
| 2 | `src/pages/sun-position.astro`, `src/pages/moon-position.astro` | Low |
| 3 | `src/components/WeatherWidget.astro`, `src/lib/weather.ts`, pages | Medium |
| 4 | `src/components/AdSlot.astro`, `src/layouts/Layout.astro`, pages, `public/ads.txt` | Low |
| 5 | `src/pages/gps-coordinates.astro`, `src/pages/compass-bearings.astro`, navs | Medium |
