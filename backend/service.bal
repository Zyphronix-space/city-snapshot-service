import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/url;

// Four upstream services this API integrates, all free and keyless.
final http:Client geoClient = check new ("https://geocoding-api.open-meteo.com");
final http:Client weatherClient = check new ("https://api.open-meteo.com");
final http:Client airQualityClient = check new ("https://air-quality-api.open-meteo.com");
final http:Client fxClient = check new ("https://open.er-api.com");

isolated function urlEncode(string s) returns string {
    string|error encoded = url:encode(s, "UTF-8");
    return encoded is string ? encoded : s;
}

isolated function checkRateLimit() returns http:TooManyRequests? {
    int? retryAfter = upstreamRateLimiter.tryAcquire();
    return retryAfter is int ? tooManyRequestsError(retryAfter) : ();
}

isolated function toCityLocation(GeoResult g, ForecastResponse w) returns CityLocation => {
    name: g.name,
    country: g.country,
    countryCode: g.country_code,
    latitude: g.latitude,
    longitude: g.longitude,
    timezone: w.timezone,
    utcOffsetSeconds: w.utc_offset_seconds,
    region: g.admin1
};

// ----------------------------------------------------------------------
// Upstream fetchers. Each is a standalone `isolated function` (rather than
// inline logic) so it can be handed to `start` for concurrent execution —
// `start` needs the future's element type fully resolved up front, which a
// named function with an explicit return type gives it for free. Each one
// checks its own TTL cache first and records success/failure into
// serviceMetrics, so a cache hit never touches the network and every real
// upstream call is reflected in GET /api/v1/health and /api/v1/metrics.
// ----------------------------------------------------------------------

isolated function geocodeSearch(string city) returns GeoResult[]|error {
    string key = city.toLowerAscii();
    GeoResult[]? cached = getCachedGeoResults(key);
    if cached is GeoResult[] {
        serviceMetrics.recordCacheHit();
        return cached;
    }
    serviceMetrics.recordCacheMiss();
    decimal startedAt = time:monotonicNow();
    GeoSearchResponse|error geoData = geoClient->get(string `/v1/search?name=${urlEncode(city)}&count=8&language=en&format=json`);
    int latencyMs = <int>((time:monotonicNow() - startedAt) * 1000);
    if geoData is error {
        serviceMetrics.recordUpstreamFailure(UPSTREAM_GEOCODING, geoData.message());
        log:printError("geocoding request failed", geoData);
        return geoData;
    }
    serviceMetrics.recordUpstreamSuccess(UPSTREAM_GEOCODING, latencyMs);
    GeoResult[] results = geoData.results ?: [];
    geoCache.put(key, results.toJson(), GEO_TTL_SECONDS);
    return results;
}

isolated function resolveCity(string city) returns GeoResult|http:NotFound|http:BadGateway {
    GeoResult[]|error results = geocodeSearch(city);
    if results is error {
        return badGatewayError("UPSTREAM_UNAVAILABLE", "Geocoding service is unavailable right now.");
    }
    if results.length() == 0 {
        return notFoundError("CITY_NOT_FOUND", string `No city found matching '${city}'.`);
    }
    return results[0];
}

// Several cities share a name (Colombo, Sri Lanka vs. Colombo, Brazil), so
// a bare name-only lookup can only ever guess (Open-Meteo's most-populous
// match). Once the frontend's search-as-you-type has shown the caller the
// full disambiguated list and they picked one, it passes that result's own
// coordinates straight back — skipping geocoding entirely instead of
// re-resolving the ambiguous name and risking a different match.
isolated function resolveCityOrExplicit(string city, float? lat, float? lon, string? country, string? countryCode, string? region, string? timezone) returns GeoResult|http:NotFound|http:BadGateway {
    if lat is float && lon is float {
        return {
            name: city,
            latitude: lat,
            longitude: lon,
            country: country ?: "",
            country_code: countryCode ?: "",
            timezone,
            admin1: region,
            population: ()
        };
    }
    return resolveCity(city);
}

isolated function fetchWeatherData(GeoResult location) returns ForecastResponse|error {
    string key = string `${location.latitude},${location.longitude}`;
    ForecastResponse? cached = getCachedForecast(key);
    if cached is ForecastResponse {
        serviceMetrics.recordCacheHit();
        return cached;
    }
    serviceMetrics.recordCacheMiss();
    decimal startedAt = time:monotonicNow();
    string path = string `/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code," +
        "pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility" +
        "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max," +
        "precipitation_sum,precipitation_probability_max,wind_speed_10m_max" +
        "&timezone=auto&forecast_days=7";
    ForecastResponse|error result = weatherClient->get(path);
    int latencyMs = <int>((time:monotonicNow() - startedAt) * 1000);
    if result is error {
        serviceMetrics.recordUpstreamFailure(UPSTREAM_WEATHER, result.message());
        log:printError("weather request failed", result);
        return result;
    }
    serviceMetrics.recordUpstreamSuccess(UPSTREAM_WEATHER, latencyMs);
    weatherCache.put(key, result.toJson(), WEATHER_TTL_SECONDS);
    return result;
}

isolated function fetchAirQualityData(GeoResult location) returns AirQualityResponse|error {
    string key = string `${location.latitude},${location.longitude}`;
    AirQualityResponse? cached = getCachedAirQuality(key);
    if cached is AirQualityResponse {
        serviceMetrics.recordCacheHit();
        return cached;
    }
    serviceMetrics.recordCacheMiss();
    decimal startedAt = time:monotonicNow();
    string path = string `/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}` +
        "&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi,european_aqi";
    AirQualityResponse|error result = airQualityClient->get(path);
    int latencyMs = <int>((time:monotonicNow() - startedAt) * 1000);
    if result is error {
        serviceMetrics.recordUpstreamFailure(UPSTREAM_AIR_QUALITY, result.message());
        log:printError("air quality request failed", result);
        return result;
    }
    serviceMetrics.recordUpstreamSuccess(UPSTREAM_AIR_QUALITY, latencyMs);
    airQualityCache.put(key, result.toJson(), AIR_QUALITY_TTL_SECONDS);
    return result;
}

isolated function fetchExchangeRates(string base) returns ExchangeRateResponse|error {
    string key = base.toUpperAscii();
    ExchangeRateResponse? cached = getCachedExchangeRates(key);
    if cached is ExchangeRateResponse {
        serviceMetrics.recordCacheHit();
        return cached;
    }
    serviceMetrics.recordCacheMiss();
    decimal startedAt = time:monotonicNow();
    ExchangeRateResponse|error result = fxClient->get(string `/v6/latest/${key}`);
    int latencyMs = <int>((time:monotonicNow() - startedAt) * 1000);
    if result is error {
        serviceMetrics.recordUpstreamFailure(UPSTREAM_CURRENCY, result.message());
        log:printError("currency request failed", result);
        return result;
    }
    serviceMetrics.recordUpstreamSuccess(UPSTREAM_CURRENCY, latencyMs);
    currencyCache.put(key, result.toJson(), CURRENCY_TTL_SECONDS);
    return result;
}

isolated function toAirQuality(AirQualityResponse resp) returns AirQuality? {
    AirQualityCurrentBlock? current = resp.current;
    if current is () {
        return ();
    }
    return {
        usAqi: current.us_aqi,
        europeanAqi: current.european_aqi,
        category: categorizeAqi(current.us_aqi),
        pm25: current.pm2_5,
        pm10: current.pm10,
        carbonMonoxide: current.carbon_monoxide,
        nitrogenDioxide: current.nitrogen_dioxide,
        ozone: current.ozone,
        observedAt: current.time,
        'source: "Open-Meteo Air Quality"
    };
}

@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET"]
    }
}
service /api/v1 on new http:Listener(8080) {

    // GET /api/v1/health — real, measured upstream status (not a fixed
    // "ok"): degraded the moment any upstream's most recent call failed.
    resource function get health() returns HealthResponse {
        UpstreamHealth[] upstreams = serviceMetrics.healthSnapshot();
        boolean anyDown = false;
        foreach UpstreamHealth u in upstreams {
            if u.status == "unavailable" {
                anyDown = true;
            }
        }
        return {
            status: anyDown ? "degraded" : "ok",
            upstreams,
            timestamp: time:utcToString(time:utcNow())
        };
    }

    // GET /api/v1/metrics — in-process counters, reset on restart.
    resource function get metrics() returns MetricsResponse {
        return serviceMetrics.snapshot();
    }

    // GET /api/v1/city/search?q=Colombo&max=5
    // Powers the frontend's search-as-you-type and disambiguation UI
    // (several cities can share a name — Colombo, Sri Lanka vs Colombo,
    // Brazil — so this returns candidates rather than guessing one).
    resource function get city/search(string q, int? max) returns CitySearchResult[]|http:BadRequest|http:BadGateway|http:TooManyRequests {
        serviceMetrics.recordRequest("city.search");
        http:TooManyRequests? limited = checkRateLimit();
        if limited is http:TooManyRequests {
            return limited;
        }

        string|ErrorResponse cityResult = validateCityName(q);
        if cityResult is ErrorResponse {
            return <http:BadRequest>{body: cityResult};
        }

        int cap = max is int ? max : 5;
        if cap < 1 {
            cap = 1;
        }
        if cap > 10 {
            cap = 10;
        }

        GeoResult[]|error results = geocodeSearch(cityResult);
        if results is error {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Geocoding service is unavailable right now.");
        }

        CitySearchResult[] mapped = [];
        foreach GeoResult r in results {
            if mapped.length() >= cap {
                break;
            }
            mapped.push({
                name: r.name,
                country: r.country,
                countryCode: r.country_code,
                region: r.admin1,
                latitude: r.latitude,
                longitude: r.longitude,
                timezone: r.timezone,
                population: r.population
            });
        }
        return mapped;
    }

    // GET /api/v1/snapshot/{city}?currency=JPY
    //
    // The unified dashboard endpoint: geocodes the city once, then fetches
    // weather, air quality and currency CONCURRENTLY with start/wait, since
    // none of the three depends on another's result. Weather is essential
    // (its failure fails the whole request); air quality and currency are
    // each optional — if one upstream is down, the snapshot still returns
    // with that field set to null rather than failing outright.
    resource function get snapshot/[string city](string? currency, float? lat, float? lon, string? country, string? countryCode, string? region, string? timezone) returns CitySnapshot|http:BadRequest|http:NotFound|http:BadGateway|http:TooManyRequests {
        serviceMetrics.recordRequest("snapshot");
        http:TooManyRequests? limited = checkRateLimit();
        if limited is http:TooManyRequests {
            return limited;
        }

        string|ErrorResponse cityResult = validateCityName(city);
        if cityResult is ErrorResponse {
            return <http:BadRequest>{body: cityResult};
        }

        GeoResult|http:NotFound|http:BadGateway located = resolveCityOrExplicit(cityResult, lat, lon, country, countryCode, region, timezone);
        if located is http:NotFound|http:BadGateway {
            return located;
        }
        GeoResult location = <GeoResult>located;

        future<ForecastResponse|error> weatherFuture = start fetchWeatherData(location);
        future<AirQualityResponse|error> airFuture = start fetchAirQualityData(location);
        future<ExchangeRateResponse|error> fxFuture = start fetchExchangeRates("USD");

        ForecastResponse|error weatherResult = wait weatherFuture;
        AirQualityResponse|error airResult = wait airFuture;
        ExchangeRateResponse|error fxResult = wait fxFuture;

        if weatherResult is error {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Weather service is unavailable right now.");
        }
        CurrentBlock? currentOpt = weatherResult.current;
        HourlyBlock? hourlyOpt = weatherResult.hourly;
        DailyBlock? dailyOpt = weatherResult.daily;
        if currentOpt is () || hourlyOpt is () || dailyOpt is () {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Weather response was missing expected data.");
        }

        AirQuality? airQuality = airResult is AirQualityResponse ? toAirQuality(airResult) : ();

        CurrencyInfo? currencyInfo = ();
        if fxResult is ExchangeRateResponse {
            string target = currency is string && currency.trim().length() > 0
                ? currency.trim().toUpperAscii()
                : currencyForCountry(location.country_code);
            float? rate = fxResult.rates[target];
            if rate is float {
                currencyInfo = {
                    baseCurrency: fxResult.base_code,
                    targetCurrency: target,
                    exchangeRate: rate,
                    lastUpdatedUtc: fxResult.time_last_update_utc
                };
            }
        }

        CitySnapshot snapshot = {
            location: toCityLocation(location, weatherResult),
            current: buildCurrentWeather(currentOpt, dailyOpt),
            hourly: buildHourlyEntries(hourlyOpt),
            daily: buildDailyEntries(dailyOpt),
            airQuality,
            currency: currencyInfo,
            generatedAt: time:utcToString(time:utcNow())
        };
        return snapshot;
    }

    // GET /api/v1/weather/{city} — weather only, no air quality/currency
    // round trips. Useful on its own and for the automated tests.
    resource function get weather/[string city](float? lat, float? lon, string? country, string? countryCode, string? region, string? timezone) returns WeatherReport|http:BadRequest|http:NotFound|http:BadGateway|http:TooManyRequests {
        serviceMetrics.recordRequest("weather");
        http:TooManyRequests? limited = checkRateLimit();
        if limited is http:TooManyRequests {
            return limited;
        }

        string|ErrorResponse cityResult = validateCityName(city);
        if cityResult is ErrorResponse {
            return <http:BadRequest>{body: cityResult};
        }

        GeoResult|http:NotFound|http:BadGateway located = resolveCityOrExplicit(cityResult, lat, lon, country, countryCode, region, timezone);
        if located is http:NotFound|http:BadGateway {
            return located;
        }
        GeoResult location = <GeoResult>located;

        ForecastResponse|error weatherResult = fetchWeatherData(location);
        if weatherResult is error {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Weather service is unavailable right now.");
        }
        CurrentBlock? currentOpt = weatherResult.current;
        HourlyBlock? hourlyOpt = weatherResult.hourly;
        DailyBlock? dailyOpt = weatherResult.daily;
        if currentOpt is () || hourlyOpt is () || dailyOpt is () {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Weather response was missing expected data.");
        }

        return {
            location: toCityLocation(location, weatherResult),
            current: buildCurrentWeather(currentOpt, dailyOpt),
            hourly: buildHourlyEntries(hourlyOpt),
            daily: buildDailyEntries(dailyOpt),
            generatedAt: time:utcToString(time:utcNow())
        };
    }

    // GET /api/v1/air-quality/{city}
    resource function get air\-quality/[string city](float? lat, float? lon, string? country, string? countryCode, string? region, string? timezone) returns AirQualityReport|http:BadRequest|http:NotFound|http:BadGateway|http:TooManyRequests {
        serviceMetrics.recordRequest("air-quality");
        http:TooManyRequests? limited = checkRateLimit();
        if limited is http:TooManyRequests {
            return limited;
        }

        string|ErrorResponse cityResult = validateCityName(city);
        if cityResult is ErrorResponse {
            return <http:BadRequest>{body: cityResult};
        }

        GeoResult|http:NotFound|http:BadGateway located = resolveCityOrExplicit(cityResult, lat, lon, country, countryCode, region, timezone);
        if located is http:NotFound|http:BadGateway {
            return located;
        }
        GeoResult location = <GeoResult>located;

        AirQualityResponse|error airResult = fetchAirQualityData(location);
        if airResult is error {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Air quality service is unavailable right now.");
        }
        AirQuality? airQuality = toAirQuality(airResult);
        if airQuality is () {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Air quality response was missing expected data.");
        }

        ForecastResponse|error weatherResult = fetchWeatherData(location);
        CityLocation loc = weatherResult is ForecastResponse
            ? toCityLocation(location, weatherResult)
            : {
                name: location.name,
                country: location.country,
                countryCode: location.country_code,
                latitude: location.latitude,
                longitude: location.longitude,
                timezone: location.timezone,
                utcOffsetSeconds: 0,
                region: location.admin1
            };

        return {location: loc, airQuality};
    }

    // GET /api/v1/currency/convert?amount=100&from=USD&to=JPY
    resource function get currency/convert(string 'from, string to, float amount) returns ConversionResult|http:BadRequest|http:BadGateway|http:TooManyRequests {
        serviceMetrics.recordRequest("currency.convert");
        http:TooManyRequests? limited = checkRateLimit();
        if limited is http:TooManyRequests {
            return limited;
        }

        float|ErrorResponse amountResult = validateAmount(amount);
        if amountResult is ErrorResponse {
            return <http:BadRequest>{body: amountResult};
        }
        string|ErrorResponse fromResult = validateCurrencyCode('from);
        if fromResult is ErrorResponse {
            return <http:BadRequest>{body: fromResult};
        }
        string|ErrorResponse toResult = validateCurrencyCode(to);
        if toResult is ErrorResponse {
            return <http:BadRequest>{body: toResult};
        }

        ExchangeRateResponse|error fxResult = fetchExchangeRates(fromResult);
        if fxResult is error {
            return badGatewayError("UPSTREAM_UNAVAILABLE", "Currency service is unavailable right now.");
        }
        float? rate = fxResult.rates[toResult];
        if rate is () {
            return <http:BadRequest>{body: buildError("INVALID_CURRENCY", string `'${toResult}' is not a supported currency code.`)};
        }

        return {
            amount: amountResult,
            fromCurrency: fromResult,
            toCurrency: toResult,
            rate,
            convertedAmount: amountResult * rate,
            lastUpdatedUtc: fxResult.time_last_update_utc
        };
    }
}
