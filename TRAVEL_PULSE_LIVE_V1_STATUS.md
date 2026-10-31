# Travel Pulse Live — V1 status

## Implemented in this increment
- New `/live` experience and bottom navigation entry `Pulso`.
- Signal types for transport, safety, crowds, new places, weather, accessibility, prices and other observations.
- Report form with input validation and expiry rules by signal type.
- Freshness states (`reciente`, `por confirmar`, `caducada`) and explainable confidence indicator.
- Filters by city and category, example feed, schematic map, and local persistence for community reports.
- `POST /api/signals` validation endpoint.
- Unit tests for the deterministic signal engine.

## Important limitations (do not present as live production data)
- The visible seed observations are illustrative demo content, not verified reports from current travelers.
- User reports and confirmations are stored only in the browser's local storage in this version; they do not synchronize between users or devices.
- The map is schematic and does not use GPS or a mapping provider.
- The confidence percentage is a transparent heuristic, not a statistically calibrated probability.
- The API endpoint validates and returns a signal but does not persist it to a shared database, authenticate users, moderate content, or rate-limit abuse.
- This increment does not yet automatically inject signals into Trip Twin's replanning engine.
- Full build/typecheck/tests were not verified because the local dependency tree is incomplete and `npm ci` timed out in this environment. Re-run `npm ci`, `npm run typecheck`, and `npm test` in a network-enabled environment.

## Next engineering milestone
Persist reports in Supabase with schema/migrations, authenticated and rate-limited submissions, moderation and duplicate detection, then expose only active and appropriately corroborated signals to Trip Twin with explicit explanations of which itinerary decision changed.
