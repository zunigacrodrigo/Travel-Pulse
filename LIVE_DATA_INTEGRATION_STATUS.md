# Travel Pulse — Live Data Integration increment

## Added
- Server endpoint `GET /api/live-data?city=São Paulo|Santiago|Antofagasta`.
- Current conditions and same-day forecast from Open-Meteo (no API key in this prototype).
- Nearby mapped points of interest via OpenStreetMap Overpass.
- City selector drives live-data queries on `/live`.
- UI displays source attribution, last query time, and limitations; API gracefully tolerates an unavailable provider.
- Server response caching: 15 minutes, stale-while-revalidate up to 1 hour.

## Important limits
- External provider availability/rate limits are outside this app's control. Overpass is a community service, not an SLA-backed production API.
- OpenStreetMap points do not establish opening hours, current crowd levels, safety, or live operational status.
- Weather is model/provider data, not an official emergency warning.
- This does not yet add shared user reports, authentication, a commercial mapping provider, or automatic Trip Twin replanning.
- `npm run typecheck` could not complete in this workspace because `node_modules` is incomplete (missing type definitions including React, Node, and Vitest dependencies). Run `npm ci` in a network-enabled environment, then typecheck/build/test before deployment.

## Data sources
- Open-Meteo: https://open-meteo.com/
- OpenStreetMap attribution: https://www.openstreetmap.org/copyright
- Overpass API: https://overpass-api.de/
