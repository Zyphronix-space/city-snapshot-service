// WMO weather-code mapping (used by every Open-Meteo endpoint: current,
// hourly, daily). Centralised here so the whole service — and the
// frontend's icon set, which reuses these exact `icon` category names —
// shares one source of truth. Full WMO table: https://open-meteo.com/en/docs
//
// `icon` deliberately collapses ~28 WMO codes into 8 buckets (clear,
// partly-cloudy, cloudy, fog, rain, thunderstorm, snow, unknown) because
// that's the level of detail a weather *icon* can actually represent;
// `condition` and `description` keep the WMO-level precision.
isolated function mapWeatherCode(int code) returns WeatherCondition {
    match code {
        0 => {
            return {code, condition: "Clear", description: "Clear sky", icon: "clear"};
        }
        1 => {
            return {code, condition: "Mainly clear", description: "Mainly clear skies", icon: "partly-cloudy"};
        }
        2 => {
            return {code, condition: "Partly cloudy", description: "Partly cloudy skies", icon: "partly-cloudy"};
        }
        3 => {
            return {code, condition: "Overcast", description: "Overcast skies", icon: "cloudy"};
        }
        45 => {
            return {code, condition: "Fog", description: "Fog", icon: "fog"};
        }
        48 => {
            return {code, condition: "Fog", description: "Depositing rime fog", icon: "fog"};
        }
        51 => {
            return {code, condition: "Light drizzle", description: "Light drizzle", icon: "rain"};
        }
        53 => {
            return {code, condition: "Drizzle", description: "Moderate drizzle", icon: "rain"};
        }
        55 => {
            return {code, condition: "Dense drizzle", description: "Dense drizzle", icon: "rain"};
        }
        56 => {
            return {code, condition: "Freezing drizzle", description: "Light freezing drizzle", icon: "rain"};
        }
        57 => {
            return {code, condition: "Freezing drizzle", description: "Dense freezing drizzle", icon: "rain"};
        }
        61 => {
            return {code, condition: "Light rain", description: "Slight rain", icon: "rain"};
        }
        63 => {
            return {code, condition: "Rain", description: "Moderate rain", icon: "rain"};
        }
        65 => {
            return {code, condition: "Heavy rain", description: "Heavy rain", icon: "rain"};
        }
        66 => {
            return {code, condition: "Freezing rain", description: "Light freezing rain", icon: "rain"};
        }
        67 => {
            return {code, condition: "Freezing rain", description: "Heavy freezing rain", icon: "rain"};
        }
        71 => {
            return {code, condition: "Light snow", description: "Slight snow fall", icon: "snow"};
        }
        73 => {
            return {code, condition: "Snow", description: "Moderate snow fall", icon: "snow"};
        }
        75 => {
            return {code, condition: "Heavy snow", description: "Heavy snow fall", icon: "snow"};
        }
        77 => {
            return {code, condition: "Snow grains", description: "Snow grains", icon: "snow"};
        }
        80 => {
            return {code, condition: "Rain showers", description: "Slight rain showers", icon: "rain"};
        }
        81 => {
            return {code, condition: "Rain showers", description: "Moderate rain showers", icon: "rain"};
        }
        82 => {
            return {code, condition: "Violent showers", description: "Violent rain showers", icon: "rain"};
        }
        85 => {
            return {code, condition: "Snow showers", description: "Slight snow showers", icon: "snow"};
        }
        86 => {
            return {code, condition: "Snow showers", description: "Heavy snow showers", icon: "snow"};
        }
        95 => {
            return {code, condition: "Thunderstorm", description: "Thunderstorm", icon: "thunderstorm"};
        }
        96 => {
            return {code, condition: "Thunderstorm", description: "Thunderstorm with slight hail", icon: "thunderstorm"};
        }
        99 => {
            return {code, condition: "Thunderstorm", description: "Thunderstorm with heavy hail", icon: "thunderstorm"};
        }
        _ => {
            return {code, condition: "Unknown", description: "Unrecognised weather code", icon: "unknown"};
        }
    }
}

// Builds this service's CurrentWeather shape from Open-Meteo's current +
// daily blocks (sunrise/sunset only exist on the daily block, so today's
// first daily entry supplies them for "current").
isolated function buildCurrentWeather(CurrentBlock current, DailyBlock? daily) returns CurrentWeather {
    string sunrise = "";
    string sunset = "";
    if daily is DailyBlock && daily.sunrise.length() > 0 && daily.sunset.length() > 0 {
        sunrise = daily.sunrise[0];
        sunset = daily.sunset[0];
    }
    return {
        temperatureCelsius: current.temperature_2m,
        feelsLikeCelsius: current.apparent_temperature,
        humidityPercent: current.relative_humidity_2m,
        precipitationMm: current.precipitation,
        windSpeedKmh: current.wind_speed_10m,
        windDirectionDeg: current.wind_direction_10m,
        windGustsKmh: current.wind_gusts_10m,
        pressureMsl: current.pressure_msl,
        uvIndex: current.uv_index,
        visibilityKm: current.visibility / 1000.0,
        isDay: current.is_day == 1,
        condition: mapWeatherCode(current.weather_code),
        sunrise,
        sunset,
        observedAt: current.time
    };
}

// Open-Meteo's hourly block is column-oriented (parallel arrays indexed by
// time) — this reshapes it into one row per hour, which is what the
// frontend's forecast strip and chart actually want to iterate over.
isolated function buildHourlyEntries(HourlyBlock hourly) returns HourlyEntry[] {
    HourlyEntry[] entries = [];
    foreach int i in 0 ..< hourly.time.length() {
        entries.push({
            time: hourly.time[i],
            temperatureCelsius: hourly.temperature_2m[i],
            feelsLikeCelsius: hourly.apparent_temperature[i],
            precipitationProbabilityPercent: hourly.precipitation_probability[i],
            precipitationMm: hourly.precipitation[i],
            windSpeedKmh: hourly.wind_speed_10m[i],
            condition: mapWeatherCode(hourly.weather_code[i])
        });
    }
    return entries;
}

isolated function buildDailyEntries(DailyBlock daily) returns DailyEntry[] {
    DailyEntry[] entries = [];
    foreach int i in 0 ..< daily.time.length() {
        entries.push({
            date: daily.time[i],
            tempMaxCelsius: daily.temperature_2m_max[i],
            tempMinCelsius: daily.temperature_2m_min[i],
            precipitationMm: daily.precipitation_sum[i],
            precipitationProbabilityPercent: daily.precipitation_probability_max[i],
            windSpeedMaxKmh: daily.wind_speed_10m_max[i],
            uvIndexMax: daily.uv_index_max[i],
            sunrise: daily.sunrise[i],
            sunset: daily.sunset[i],
            condition: mapWeatherCode(daily.weather_code[i])
        });
    }
    return entries;
}

// US EPA AQI breakpoints (real standard, not invented) — six categories,
// applied to the `us_aqi` value Open-Meteo's Air Quality API already
// computes for us. https://www.airnow.gov/aqi/aqi-basics/
isolated function categorizeAqi(int usAqi) returns string {
    if usAqi <= 50 {
        return "Good";
    } else if usAqi <= 100 {
        return "Moderate";
    } else if usAqi <= 150 {
        return "Unhealthy for Sensitive Groups";
    } else if usAqi <= 200 {
        return "Unhealthy";
    } else if usAqi <= 300 {
        return "Very Unhealthy";
    }
    return "Hazardous";
}
