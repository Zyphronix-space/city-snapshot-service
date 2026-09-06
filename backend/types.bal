// ============================================================================
// Upstream API response shapes (Open-Meteo geocoding/forecast/air-quality/
// archive, open.er-api.com currency). These are OPEN records (no `|}`
// closing) because each upstream returns extra fields we don't use
// (generationtime_ms, elevation, admin2_id, ...) — a closed record would
// reject the whole payload the moment the provider adds a field we haven't
// declared. Field names intentionally mirror the upstream JSON exactly
// (snake_case) so Ballerina's automatic payload binding needs no manual
// parsing code. Every field below was confirmed against a live response
// before being declared.
// ============================================================================

public type GeoResult record {
    string name;
    float latitude;
    float longitude;
    string country;
    string country_code;
    string? timezone = ();
    string? admin1 = ();
    int? population = ();
};

public type GeoSearchResponse record {
    GeoResult[] results?;
};

public type CurrentBlock record {
    string time;
    float temperature_2m;
    int relative_humidity_2m;
    float apparent_temperature;
    int is_day;
    float precipitation;
    int weather_code;
    float pressure_msl;
    float wind_speed_10m;
    int wind_direction_10m;
    float wind_gusts_10m;
    float uv_index;
    float visibility;
};

public type HourlyBlock record {
    string[] time;
    float[] temperature_2m;
    float[] apparent_temperature;
    int[] precipitation_probability;
    float[] precipitation;
    int[] weather_code;
    float[] wind_speed_10m;
};

public type DailyBlock record {
    string[] time;
    int[] weather_code;
    float[] temperature_2m_max;
    float[] temperature_2m_min;
    string[] sunrise;
    string[] sunset;
    float[] uv_index_max;
    float[] precipitation_sum;
    int[] precipitation_probability_max;
    float[] wind_speed_10m_max;
};

public type ForecastResponse record {
    float latitude;
    float longitude;
    string timezone;
    int utc_offset_seconds;
    CurrentBlock current?;
    HourlyBlock hourly?;
    DailyBlock daily?;
};

public type AirQualityCurrentBlock record {
    string time;
    float pm10;
    float pm2_5;
    float carbon_monoxide;
    float nitrogen_dioxide;
    float ozone;
    int us_aqi;
    int european_aqi;
};

public type AirQualityResponse record {
    float latitude;
    float longitude;
    string timezone;
    AirQualityCurrentBlock current?;
};

public type ExchangeRateResponse record {
    string result;
    string base_code;
    string time_last_update_utc;
    map<float> rates;
};

// ============================================================================
// This service's own response shapes. CLOSED records (`record {| ... |}`) —
// we define these ourselves, so an unexpected field is a bug we want caught
// at compile time, not silently ignored.
// ============================================================================

public type WeatherCondition record {|
    int code;
    string condition;
    string description;
    string icon;
|};

public type CityLocation record {|
    string name;
    string country;
    string countryCode;
    float latitude;
    float longitude;
    string? timezone;
    int utcOffsetSeconds;
    string? region;
|};

public type CitySearchResult record {|
    string name;
    string country;
    string countryCode;
    string? region;
    float latitude;
    float longitude;
    string? timezone;
    int? population;
|};

public type CurrentWeather record {|
    float temperatureCelsius;
    float feelsLikeCelsius;
    int humidityPercent;
    float precipitationMm;
    float windSpeedKmh;
    int windDirectionDeg;
    float windGustsKmh;
    float pressureMsl;
    float uvIndex;
    float visibilityKm;
    boolean isDay;
    WeatherCondition condition;
    string sunrise;
    string sunset;
    string observedAt;
|};

public type HourlyEntry record {|
    string time;
    float temperatureCelsius;
    float feelsLikeCelsius;
    int precipitationProbabilityPercent;
    float precipitationMm;
    float windSpeedKmh;
    WeatherCondition condition;
|};

public type HourlyForecast record {|
    CityLocation location;
    HourlyEntry[] hours;
    string generatedAt;
|};

public type DailyEntry record {|
    string date;
    float tempMaxCelsius;
    float tempMinCelsius;
    float precipitationMm;
    int precipitationProbabilityPercent;
    float windSpeedMaxKmh;
    float uvIndexMax;
    string sunrise;
    string sunset;
    WeatherCondition condition;
|};

public type DailyForecast record {|
    CityLocation location;
    DailyEntry[] days;
    string generatedAt;
|};

public type AirQuality record {|
    int usAqi;
    int europeanAqi;
    string category;
    float pm25;
    float pm10;
    float carbonMonoxide;
    float nitrogenDioxide;
    float ozone;
    string observedAt;
    string 'source;
|};

public type AirQualityReport record {|
    CityLocation location;
    AirQuality airQuality;
|};

public type CurrencyInfo record {|
    string baseCurrency;
    string targetCurrency;
    float exchangeRate;
    string lastUpdatedUtc;
|};

public type ConversionResult record {|
    float amount;
    string fromCurrency;
    string toCurrency;
    float rate;
    float convertedAmount;
    string lastUpdatedUtc;
|};

public type WeatherReport record {|
    CityLocation location;
    CurrentWeather current;
    HourlyEntry[] hourly;
    DailyEntry[] daily;
    string generatedAt;
|};

// The unified dashboard payload — everything the frontend needs to render a
// full city page from a single request, so it never has to fan out several
// requests (and re-geocode) itself. airQuality/currency are optional because
// a snapshot should still be useful when one of those upstreams is down —
// see service.bal's partial-failure handling.
public type CitySnapshot record {|
    CityLocation location;
    CurrentWeather current;
    HourlyEntry[] hourly;
    DailyEntry[] daily;
    AirQuality? airQuality;
    CurrencyInfo? currency;
    string generatedAt;
|};

public type ErrorCode "CITY_NOT_FOUND"|"INVALID_CITY"|"INVALID_CURRENCY"|"INVALID_REQUEST"|
    "UPSTREAM_TIMEOUT"|"UPSTREAM_UNAVAILABLE"|"RATE_LIMITED"|"INTERNAL_ERROR";

public type ErrorDetail record {|
    ErrorCode code;
    string message;
    string requestId;
|};

public type ErrorResponse record {|
    ErrorDetail 'error;
|};

public type UpstreamHealth record {|
    string name;
    string status;
    int? lastLatencyMs;
    string? lastCheckedAt;
    string? lastError;
|};

public type HealthResponse record {|
    string status;
    UpstreamHealth[] upstreams;
    string timestamp;
|};

public type MetricsResponse record {|
    int totalRequests;
    int cacheHits;
    int cacheMisses;
    float cacheHitRatePercent;
    map<int> requestsByEndpoint;
    map<int> errorsByUpstream;
    string startedAt;
|};
