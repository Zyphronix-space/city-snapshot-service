// CityScope — API client
// Talks to the Ballerina backend's /api/v1 surface. No mock data anywhere:
// every value rendered by the app comes from a real response here.
const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://localhost:8080/api/v1"
  : "https://city-snapshot-api-stephan.azurewebsites.net/api/v1";

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  let res;
  try {
    res = await fetch(url.toString());
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0, "NETWORK");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty/non-JSON body — handled below via res.ok */
  }
  if (!res.ok) {
    const message = body?.error?.message || "Something went wrong.";
    const code = body?.error?.code || "UNKNOWN";
    throw new ApiError(message, res.status, code);
  }
  return body;
}

// A location object carries enough of a search result to let the backend
// skip re-geocoding and use these exact coordinates (see `resolveCityOrExplicit`
// server-side) — required so picking "Colombo, Brazil" from a suggestion list
// can't silently resolve back to "Colombo, Sri Lanka".
function locationParams(location) {
  if (!location) return {};
  return {
    lat: location.latitude,
    lon: location.longitude,
    country: location.country,
    countryCode: location.countryCode,
    region: location.region,
    timezone: location.timezone,
  };
}

const Api = {
  health: () => apiGet("/health"),
  metrics: () => apiGet("/metrics"),
  searchCities: (q, max = 6) => apiGet("/city/search", { q, max }),
  snapshot: (city, { currency, location } = {}) =>
    apiGet(`/snapshot/${encodeURIComponent(city)}`, { currency, ...locationParams(location) }),
  weather: (city, { location } = {}) =>
    apiGet(`/weather/${encodeURIComponent(city)}`, locationParams(location)),
  airQuality: (city, { location } = {}) =>
    apiGet(`/air-quality/${encodeURIComponent(city)}`, locationParams(location)),
  convertCurrency: (amount, from, to) =>
    apiGet("/currency/convert", { amount, from, to }),
};
