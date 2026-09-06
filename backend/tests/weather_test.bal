import ballerina/test;

@test:Config {}
function testKnownWeatherCodesMapToExpectedCategories() {
    test:assertEquals(mapWeatherCode(0).icon, "clear");
    test:assertEquals(mapWeatherCode(2).icon, "partly-cloudy");
    test:assertEquals(mapWeatherCode(3).icon, "cloudy");
    test:assertEquals(mapWeatherCode(45).icon, "fog");
    test:assertEquals(mapWeatherCode(61).icon, "rain");
    test:assertEquals(mapWeatherCode(71).icon, "snow");
    test:assertEquals(mapWeatherCode(95).icon, "thunderstorm");
}

@test:Config {}
function testUnrecognisedWeatherCodeFallsBackToUnknown() {
    WeatherCondition condition = mapWeatherCode(-1);
    test:assertEquals(condition.icon, "unknown");
    test:assertEquals(condition.condition, "Unknown");
}

@test:Config {}
function testWeatherConditionPreservesOriginalCode() {
    WeatherCondition condition = mapWeatherCode(63);
    test:assertEquals(condition.code, 63);
}

@test:Config {}
function testAqiCategoryBoundaries() {
    test:assertEquals(categorizeAqi(0), "Good");
    test:assertEquals(categorizeAqi(50), "Good");
    test:assertEquals(categorizeAqi(51), "Moderate");
    test:assertEquals(categorizeAqi(100), "Moderate");
    test:assertEquals(categorizeAqi(101), "Unhealthy for Sensitive Groups");
    test:assertEquals(categorizeAqi(151), "Unhealthy");
    test:assertEquals(categorizeAqi(201), "Very Unhealthy");
    test:assertEquals(categorizeAqi(301), "Hazardous");
}

@test:Config {}
function testBuildCurrentWeatherPullsSunriseSunsetFromDaily() {
    CurrentBlock current = {
        time: "2026-01-01T12:00",
        temperature_2m: 28.5,
        relative_humidity_2m: 70,
        apparent_temperature: 31.0,
        is_day: 1,
        precipitation: 0.0,
        weather_code: 2,
        pressure_msl: 1012.0,
        wind_speed_10m: 10.0,
        wind_direction_10m: 180,
        wind_gusts_10m: 20.0,
        uv_index: 6.5,
        visibility: 12000.0
    };
    DailyBlock daily = {
        time: ["2026-01-01"],
        weather_code: [2],
        temperature_2m_max: [30.0],
        temperature_2m_min: [24.0],
        sunrise: ["2026-01-01T06:00"],
        sunset: ["2026-01-01T18:00"],
        uv_index_max: [7.0],
        precipitation_sum: [0.0],
        precipitation_probability_max: [10],
        wind_speed_10m_max: [15.0]
    };

    CurrentWeather result = buildCurrentWeather(current, daily);
    test:assertEquals(result.sunrise, "2026-01-01T06:00");
    test:assertEquals(result.sunset, "2026-01-01T18:00");
    test:assertEquals(result.visibilityKm, 12.0);
    test:assertEquals(result.isDay, true);
    test:assertEquals(result.condition.icon, "partly-cloudy");
}

@test:Config {}
function testBuildHourlyEntriesProducesOneRowPerHour() {
    HourlyBlock hourly = {
        time: ["2026-01-01T00:00", "2026-01-01T01:00"],
        temperature_2m: [20.0, 21.0],
        apparent_temperature: [19.0, 20.0],
        precipitation_probability: [10, 15],
        precipitation: [0.0, 0.1],
        weather_code: [1, 2],
        wind_speed_10m: [5.0, 6.0]
    };
    HourlyEntry[] entries = buildHourlyEntries(hourly);
    test:assertEquals(entries.length(), 2);
    test:assertEquals(entries[1].temperatureCelsius, 21.0);
    test:assertEquals(entries[1].condition.icon, "partly-cloudy");
}

@test:Config {}
function testBuildDailyEntriesMapsEachDay() {
    DailyBlock daily = {
        time: ["2026-01-01", "2026-01-02"],
        weather_code: [61, 0],
        temperature_2m_max: [30.0, 29.0],
        temperature_2m_min: [24.0, 23.0],
        sunrise: ["2026-01-01T06:00", "2026-01-02T06:01"],
        sunset: ["2026-01-01T18:00", "2026-01-02T18:01"],
        uv_index_max: [7.0, 6.0],
        precipitation_sum: [5.0, 0.0],
        precipitation_probability_max: [80, 5],
        wind_speed_10m_max: [15.0, 10.0]
    };
    DailyEntry[] entries = buildDailyEntries(daily);
    test:assertEquals(entries.length(), 2);
    test:assertEquals(entries[0].condition.icon, "rain");
    test:assertEquals(entries[1].condition.icon, "clear");
    test:assertEquals(entries[0].precipitationProbabilityPercent, 80);
}
