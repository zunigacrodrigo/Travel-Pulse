# Travel Pulse — Global city search increment

## What changed
- Removed the hard-coded three-city allowlist from `GET /api/live-data`.
- Added global city geocoding through Open-Meteo Geocoding; city names can be entered freely, ideally as `City, Country` to disambiguate names.
- Weather is requested for resolved coordinates, and OpenStreetMap/Overpass is queried around those coordinates.
- Replaced the fixed city dropdown with a searchable city field and examples across continents.
- Set Santiago as the initial exploration city, matching the immediate travel context.

## Coverage and honesty
- This supports any city the geocoding provider can resolve; it does not mean all cities have equal data coverage.
- Weather availability is generally broad but still depends on provider/model coverage.
- Place results depend on OpenStreetMap completeness and Overpass availability/rate limits.
- No reliable global real-time safety, crowd, opening-hours, or transit feed has been integrated yet. The app must not infer those facts from map data.
- Traveler reports remain browser-local and are not synchronized across users.
- The visual map in Live is still schematic, not a true interactive map.

## Validation
- `npm run typecheck` attempted and currently fails before checking application code because the existing `node_modules` installation is incomplete (missing type definition packages such as `react`, `node`, `chai`, and others).
- Must run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` in a network-enabled environment before deployment.
