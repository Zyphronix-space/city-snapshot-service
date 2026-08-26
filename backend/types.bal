// Shapes of the JSON returned by the two upstream APIs, and the shape
// this service returns to its own callers.
//
// The four types below are intentionally OPEN records (no `|}` closing),
// because they only capture the subset of fields we actually use out of
// each upstream response — Open-Meteo and open.er-api.com both return
// extra fields (id, generationtime_ms, winddirection, provider, ...) that
// a closed record would reject with "undefined field" during data binding.

public type GeoResult record {
    string name;
    float latitude;
    float longitude;
    string country;
    string country_code;
};

public type GeoSearchResponse record {
    GeoResult[] results?;
};

public type CurrentWeather record {
    float temperature;
    float windspeed;
    int weathercode;
    string time;
};

public type ForecastResponse record {
    CurrentWeather current_weather;
};

public type ExchangeRateResponse record {
    string result;
    string base_code;
    map<float> rates;
};

public type CitySnapshot record {|
    string city;
    string country;
    float latitude;
    float longitude;
    float temperature_celsius;
    float windspeed_kmh;
    string weather_description;
    string base_currency;
    string target_currency;
    float exchange_rate;
|};

public type ErrorBody record {|
    string message;
|};
