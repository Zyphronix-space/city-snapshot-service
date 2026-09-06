// Generic TTL cache used in front of every upstream call (geocoding,
// weather, air quality, currency). Deliberately hand-rolled instead of
// pulling in ballerina/cache: that module's cache is process-wide and
// eviction-policy driven, whereas here each upstream needs its own TTL
// (geocoding barely changes, currency changes slowly, weather changes
// often) — a handful of separate instances of this small class is clearer
// than configuring one shared cache's per-entry TTLs.
//
// Caches store the raw upstream response shape (GeoResult[], ForecastResponse,
// AirQualityResponse, ExchangeRateResponse) rather than this service's own
// derived response shapes — that way a cache hit still recomputes weather
// descriptions/AQI categories fresh (cheap, pure functions) while skipping
// the actual network round-trip, which is the expensive part.
import ballerina/time;

type CacheEntry record {|
    json & readonly value;
    decimal expiresAt;
|};

isolated function currentEpochSeconds() returns decimal {
    time:Utc utc = time:utcNow();
    return <decimal>utc[0] + utc[1];
}

isolated class TtlCache {
    private map<CacheEntry> store = {};

    isolated function put(string key, json value, decimal ttlSeconds) {
        json & readonly ro = value.cloneReadOnly();
        decimal expiresAt = currentEpochSeconds() + ttlSeconds;
        lock {
            self.store[key] = {value: ro, expiresAt};
        }
    }

    isolated function get(string key) returns json? {
        decimal now = currentEpochSeconds();
        lock {
            CacheEntry? entry = self.store[key];
            if entry is () {
                return ();
            }
            if entry.expiresAt < now {
                _ = self.store.remove(key);
                return ();
            }
            return entry.value.clone();
        }
    }

    // Only used by /api/v1/metrics — approximate, not a source of truth for
    // correctness (entries aren't purged until they're next read).
    isolated function size() returns int {
        lock {
            return self.store.length();
        }
    }
}

final TtlCache geoCache = new;
final TtlCache weatherCache = new;
final TtlCache airQualityCache = new;
final TtlCache currencyCache = new;

// TTLs (seconds) — see README "Caching strategy" for the reasoning behind
// each of these.
const decimal GEO_TTL_SECONDS = 86400; // 24h — a city's coordinates don't move
const decimal WEATHER_TTL_SECONDS = 300; // 5 min
const decimal AIR_QUALITY_TTL_SECONDS = 600; // 10 min
const decimal CURRENCY_TTL_SECONDS = 1800; // 30 min

// Small typed wrappers around the raw get/put above. Ballerina's
// `cloneWithType()` (no explicit type argument) is a langlib intrinsic that
// infers its target type from the call site's expected type — that's what
// makes these one-liners work without a hand-rolled generic helper (a
// user-defined function can't do the same trick unless it's `external`).

isolated function getCachedGeoResults(string key) returns GeoResult[]? {
    json? cached = geoCache.get(key);
    if cached is () {
        return ();
    }
    GeoResult[]|error result = cached.cloneWithType();
    return result is GeoResult[] ? result : ();
}

isolated function getCachedForecast(string key) returns ForecastResponse? {
    json? cached = weatherCache.get(key);
    if cached is () {
        return ();
    }
    ForecastResponse|error result = cached.cloneWithType();
    return result is ForecastResponse ? result : ();
}

isolated function getCachedAirQuality(string key) returns AirQualityResponse? {
    json? cached = airQualityCache.get(key);
    if cached is () {
        return ();
    }
    AirQualityResponse|error result = cached.cloneWithType();
    return result is AirQualityResponse ? result : ();
}

isolated function getCachedExchangeRates(string key) returns ExchangeRateResponse? {
    json? cached = currencyCache.get(key);
    if cached is () {
        return ();
    }
    ExchangeRateResponse|error result = cached.cloneWithType();
    return result is ExchangeRateResponse ? result : ();
}
