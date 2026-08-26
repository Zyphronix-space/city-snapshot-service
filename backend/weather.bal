// WMO weather codes (used by Open-Meteo) collapsed into a few
// human-readable buckets. Full table: https://open-meteo.com/en/docs
function weatherDescription(int code) returns string {
    if code == 0 {
        return "Clear sky";
    } else if code >= 1 && code <= 3 {
        return "Partly cloudy";
    } else if code == 45 || code == 48 {
        return "Fog";
    } else if code >= 51 && code <= 67 {
        return "Rain";
    } else if code >= 71 && code <= 77 {
        return "Snow";
    } else if code >= 80 && code <= 82 {
        return "Rain showers";
    } else if code >= 95 {
        return "Thunderstorm";
    }
    return "Unknown";
}
