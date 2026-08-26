import ballerina/http;
import ballerina/log;

// Three upstream services this API integrates. All three are free
// and require no API key, so the project runs with zero config.
final http:Client geoClient = check new ("https://geocoding-api.open-meteo.com");
final http:Client weatherClient = check new ("https://api.open-meteo.com");
final http:Client fxClient = check new ("https://open.er-api.com");

// start needs the future's element type fully resolved before it reaches
// the client call, so each concurrent call gets its own function with an
// explicit return type rather than being called inline inside `start`.
function fetchWeather(string path) returns ForecastResponse|error {
    return weatherClient->get(path);
}

function fetchExchangeRate(string path) returns ExchangeRateResponse|error {
    return fxClient->get(path);
}

@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET"]
    }
}
service /api on new http:Listener(8080) {

    resource function get health() returns json {
        return { status: "up" };
    }

    // GET /api/snapshot/{city}?currency=LKR
    //
    // 1. Geocode the city name to lat/lon + country (Open-Meteo geocoding).
    // 2. Fetch current weather and the FX rate CONCURRENTLY, since neither
    //    call depends on the other's result — this is where Ballerina's
    //    start/wait (lightweight worker futures) actually pays for itself
    //    over doing two sequential HTTP calls.
    // 3. Merge both responses into one CitySnapshot.
    resource function get snapshot/[string city](string currency = "USD") returns CitySnapshot|http:NotFound|http:BadGateway {
        GeoSearchResponse|error geoData = geoClient->get(string `/v1/search?name=${city}&count=1`);

        if geoData is error {
            log:printError("geocoding request failed", geoData);
            http:BadGateway resp = { body: { message: "geocoding service unavailable" } };
            return resp;
        }

        GeoResult[]? results = geoData.results;
        if results is () || results.length() == 0 {
            http:NotFound resp = { body: { message: string `no city found matching '${city}'` } };
            return resp;
        }
        GeoResult location = results[0];

        string weatherPath = string `/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true`;
        string fxPath = "/v6/latest/USD";

        future<ForecastResponse|error> weatherFuture = start fetchWeather(weatherPath);
        future<ExchangeRateResponse|error> fxFuture = start fetchExchangeRate(fxPath);

        ForecastResponse|error weatherResult = wait weatherFuture;
        ExchangeRateResponse|error fxResult = wait fxFuture;

        if weatherResult is error {
            log:printError("weather request failed", weatherResult);
            http:BadGateway resp = { body: { message: "weather service unavailable" } };
            return resp;
        }
        if fxResult is error {
            log:printError("fx request failed", fxResult);
            http:BadGateway resp = { body: { message: "currency service unavailable" } };
            return resp;
        }

        float? rate = fxResult.rates[currency];
        if rate is () {
            http:BadGateway resp = { body: { message: string `unsupported currency code '${currency}'` } };
            return resp;
        }

        CitySnapshot snapshot = {
            city: location.name,
            country: location.country,
            latitude: location.latitude,
            longitude: location.longitude,
            temperature_celsius: weatherResult.current_weather.temperature,
            windspeed_kmh: weatherResult.current_weather.windspeed,
            weather_description: weatherDescription(weatherResult.current_weather.weathercode),
            base_currency: fxResult.base_code,
            target_currency: currency,
            exchange_rate: rate
        };

        return snapshot;
    }
}
