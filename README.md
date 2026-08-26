# City Snapshot Service

A small integration API built with **Ballerina** (WSO2's own language) for the
WSO2 Engineering Intern application's "real-world project implementation"
contribution (2 points). Give it a city name, it returns live weather and a
currency exchange rate in one response.

## Why this counts as an "integration" project

Ballerina's whole pitch is that it's a language *built for* talking to
multiple services and combining the results — which is exactly what WSO2
sells (API Manager, Integrator, etc.). This project does that literally:

```
GET /api/snapshot/Colombo?currency=LKR
        │
        ▼
1. Geocode "Colombo" → lat/lon + country      (geocoding-api.open-meteo.com)
        │
        ├──▶ 2a. Fetch current weather  ──┐   (api.open-meteo.com)
        │                                  ├─▶ 3. Merge → JSON response
        └──▶ 2b. Fetch USD exchange rates ┘   (open.er-api.com)
```

Steps 2a and 2b don't depend on each other, so they run **concurrently**
using Ballerina's `start` / `wait` — that's the one Ballerina-specific idea
worth understanding cold (see Q&A below).

No API keys needed — all three upstream APIs are free and public.

## Project layout

```
backend/
  Ballerina.toml     package metadata
  types.bal          record (struct) definitions for every JSON shape involved
  weather.bal         WMO weather-code → human string helper
  service.bal         the actual HTTP service (the file to read first)
frontend/
  index.html, style.css, script.js   plain HTML/JS page that calls the API
```

## Running it

1. Install Ballerina: https://ballerina.io/downloads/ (Windows installer, then restart your terminal).
2. Verify: `bal version`
3. Start the backend:
   ```
   cd backend
   bal run
   ```
   It listens on `http://localhost:8080`.
4. Open `frontend/index.html` directly in a browser (or serve it with
   `npx serve frontend` if `fetch` complains about `file://` origins).

Note: I wrote this without a local Ballerina install to test against, so if
`bal run` throws a syntax error, it's most likely a small one — Ballerina's
compiler errors point at the exact line, so paste it back to me and I'll fix
it with you.

## Interview prep — questions they could actually ask

**"Why Ballerina instead of Node/Express or Spring Boot?"**
Ballerina treats network calls and data shapes as first-class language
features (`http:Client`, records that map directly onto JSON) instead of
library add-ons. For a service whose whole job is calling other services and
reshaping their responses, that removes a lot of boilerplate you'd otherwise
write by hand.

**"Walk me through what happens on a request."**
`GET /api/snapshot/{city}` — the path parameter `city` binds straight into
the function signature. First it geocodes the name via Open-Meteo's
geocoding API to get latitude/longitude. Then, since the weather call and
the currency call are independent, it kicks both off with `start` (which
returns a `future` immediately without blocking) and `wait`s on both. Once
both come back it merges the fields into one `CitySnapshot` record and
returns it — the HTTP layer serializes it to JSON automatically.

**"What is `start`/`wait` actually doing?"**
`start someCall()` runs `someCall()` on a separate lightweight worker and
immediately gives you back a `future` handle instead of blocking. `wait`
pauses until that future resolves. Doing `start` on both calls before
`wait`-ing on either means the two HTTP round-trips happen in parallel
instead of one after another — if each call takes ~200ms, sequential is
~400ms total, concurrent is ~200ms.

**"How do you handle a city that doesn't exist, or an upstream API being down?"**
The geocoding response's `results` field is typed as optional
(`GeoResult[]?`) because Open-Meteo omits it when nothing matches — if it's
`()` or empty, the service returns `404 Not Found` with a JSON message
instead of crashing. Each of the two concurrent calls is checked for
`error` separately after `wait`, and returns `502 Bad Gateway` naming which
upstream failed, rather than a generic 500.

**"Why define `record` types instead of just using raw JSON?"**
Records give compile-time checking of field names and types — if Open-Meteo
renamed `current_weather` I'd get a compile error, not a runtime `null`
somewhere three functions later. The HTTP client also uses the record type
to deserialize automatically (`GeoSearchResponse geoData = check
geoClient->get(path)`), so there's no manual JSON parsing code at all.

**"Did you hit any real bugs building this? Walk me through one."**
Yes — the geocoding call failed every time with `Payload binding failed:
undefined field 'id'`. I'd declared `GeoResult` etc. as **closed** records
(`record {| ... |}`), which reject any JSON field not explicitly listed.
Open-Meteo's actual response includes extra fields I hadn't declared (`id`,
`generationtime_ms`, `winddirection`, ...), so Ballerina's automatic
JSON-to-record binding errored on every field it didn't recognize. Fix was
switching those four upstream-response types to **open** records
(`record { ... }`, no closing `|}`), which only validates the fields you
declare and ignores the rest. Rule of thumb: keep records for data *you*
define closed (catches typos/shape drift early), keep records mirroring a
*third-party* API's response open, since you don't control their schema and
don't want new fields on their end to break your service.

**"What would you add if you kept working on this?"**
Caching (weather/FX data doesn't need to be fetched fresh every request),
a real currency-code list instead of trusting the caller's `currency` query
param, and probably rate-limiting since all three upstream APIs are free
tiers with usage limits.

## Next step toward the 3-point minimum

This project is worth 2 points. The fastest legitimate way to the remaining
1 point is a small **documentation fix PR** merged into a WSO2 repo (e.g.
`wso2/docs-apim`, `ballerina-platform/ballerina-lang`, or a product doc
under `wso2/product-*`) — find a typo, a broken link, or an outdated code
sample, fix it, open the PR yourself. I can help you find candidates and
review your fix before you submit, but the PR needs to be opened from your
own GitHub account since it's reviewed by a real WSO2 maintainer.
