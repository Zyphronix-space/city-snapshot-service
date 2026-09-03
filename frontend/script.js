// City Snapshot — frontend logic
// Talks to the Ballerina backend at API_BASE. No mock data: every value
// rendered comes from a real /api/snapshot, /api/health, or reverse
// geocoding response.

// The backend is hosted separately (Azure App Service) from this static
// frontend (Azure Static Web Apps), so this always points at a fixed origin
// rather than a relative path — localhost during local dev, the deployed
// backend everywhere else.
const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://localhost:8080/api"
  : "https://city-snapshot-api-stephan.azurewebsites.net/api";
const DEFAULT_CITY = "Colombo";
const DEFAULT_CURRENCY = "LKR";
const THEME_STORAGE_KEY = "city-snapshot-theme"; // "light" | "dark" | "system"
const REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

// Real-world currency for each suggested city, so picking one also picks
// the currency you'd actually use there instead of leaving the previous
// selection in place.
const CITY_CURRENCY = {
  Colombo: "LKR",
  London: "GBP",
  Tokyo: "JPY",
  "New York": "USD",
  Singapore: "SGD",
  Dubai: "AED",
};

// ISO 3166-1 alpha-2 country code -> currency code, used to pick a sensible
// currency when the city comes from "Use my location" rather than the
// suggested-city list. Falls back to USD for anything not listed here.
const COUNTRY_CURRENCY = {
  US: "USD", GB: "GBP", LK: "LKR", IN: "INR", JP: "JPY", SG: "SGD", AE: "AED", AU: "AUD",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", IE: "EUR", PT: "EUR", FI: "EUR",
  BE: "EUR", AT: "EUR", GR: "EUR",
  CA: "CAD", CN: "CNY", HK: "HKD", MY: "MYR", TH: "THB", ID: "IDR", PH: "PHP", VN: "VND",
  KR: "KRW", PK: "PKR", BD: "BDT", NP: "NPR", NZ: "NZD", ZA: "ZAR", BR: "BRL", MX: "MXN",
  RU: "RUB", SA: "SAR", QA: "QAR", KW: "KWD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
  PL: "PLN", TR: "TRY", EG: "EGP", NG: "NGN", KE: "KES",
};

const els = {
  body: document.body,
  themeToggle: document.getElementById("theme-toggle"),
  themeIcon: document.getElementById("theme-icon"),

  cityName: document.getElementById("city-name"),
  countryName: document.getElementById("country-name"),
  weatherIcon: document.getElementById("weather-icon"),
  temperature: document.getElementById("temperature"),
  condition: document.getElementById("condition"),
  metaLine: document.getElementById("meta-line"),

  detailsPanel: document.getElementById("details-panel"),
  detailWind: document.getElementById("detail-wind"),
  detailLat: document.getElementById("detail-lat"),
  detailLon: document.getElementById("detail-lon"),

  currencyCard: document.getElementById("currency-card"),
  currencyBase: document.getElementById("currency-base"),
  currencyTarget: document.getElementById("currency-target"),
  currencySub: document.getElementById("currency-sub"),

  loadingState: document.getElementById("loading-state"),
  errorState: document.getElementById("error-state"),
  errorTitle: document.getElementById("error-title"),
  errorMessage: document.getElementById("error-message"),
  errorRetry: document.getElementById("error-retry"),

  searchFab: document.getElementById("search-fab"),
  searchBackdrop: document.getElementById("search-backdrop"),
  searchPanel: document.getElementById("search-panel"),
  searchClose: document.getElementById("search-close"),
  searchForm: document.getElementById("search-form"),
  searchSubmit: document.getElementById("search-submit"),
  cityInput: document.getElementById("city-input"),
  suggestedCities: document.getElementById("suggested-cities"),

  currencyPicker: document.getElementById("currency-picker"),
  currencyPickerBtn: document.getElementById("currency-picker-btn"),
  currencyPickerValue: document.getElementById("currency-picker-value"),
  currencyPickerList: document.getElementById("currency-picker-list"),

  locateBtn: document.getElementById("locate-btn"),
  locateBtnLabel: document.getElementById("locate-btn-label"),
  locateStatus: document.getElementById("locate-status"),

  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
};

let lastQuery = { city: DEFAULT_CITY, currency: DEFAULT_CURRENCY };
let currentCurrency = DEFAULT_CURRENCY;

/* ----------------------------------------------------------------
   Weather icon + category mapping
   ---------------------------------------------------------------- */

const WEATHER_ICONS = {
  clear: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <circle cx="50" cy="50" r="20"/>
    <g>
      <line x1="50" y1="8" x2="50" y2="20"/>
      <line x1="50" y1="80" x2="50" y2="92"/>
      <line x1="8" y1="50" x2="20" y2="50"/>
      <line x1="80" y1="50" x2="92" y2="50"/>
      <line x1="19.3" y1="19.3" x2="27.6" y2="27.6"/>
      <line x1="72.4" y1="72.4" x2="80.7" y2="80.7"/>
      <line x1="19.3" y1="80.7" x2="27.6" y2="72.4"/>
      <line x1="72.4" y1="27.6" x2="80.7" y2="19.3"/>
    </g>
  </svg>`,
  "partly-cloudy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="38" cy="38" r="15"/>
    <line x1="38" y1="10" x2="38" y2="17"/>
    <line x1="14" y1="38" x2="21" y2="38"/>
    <line x1="17.6" y1="17.6" x2="22.6" y2="22.6"/>
    <path d="M32 62h34a14 14 0 0 0 1-27.9A19 19 0 0 0 31 46.4 12 12 0 0 0 32 62Z"/>
  </svg>`,
  cloudy: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 68h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 44 14 14 0 0 0 27 68Z"/>
  </svg>`,
  fog: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 46h36a14 14 0 0 0 1-27.9A19 19 0 0 0 31 30.4 12 12 0 0 0 32 46Z"/>
    <line x1="18" y1="62" x2="82" y2="62"/>
    <line x1="24" y1="74" x2="76" y2="74"/>
    <line x1="30" y1="86" x2="70" y2="86"/>
  </svg>`,
  rain: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 54h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 30 14 14 0 0 0 27 54Z"/>
    <path d="M34 65 Q30 74 30 79 A3 3 0 1 0 36 79 Q36 74 34 65Z" fill="currentColor" stroke="none"/>
    <path d="M50 68 Q46 77 46 82 A3 3 0 1 0 52 82 Q52 77 50 68Z" fill="currentColor" stroke="none"/>
    <path d="M66 65 Q62 74 62 79 A3 3 0 1 0 68 79 Q68 74 66 65Z" fill="currentColor" stroke="none"/>
  </svg>`,
  thunderstorm: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 50h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 26 14 14 0 0 0 27 50Z"/>
    <path d="M54 62 42 80h12L48 92l16-22H52Z" fill="currentColor" stroke="none"/>
  </svg>`,
  snow: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 50h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 26 14 14 0 0 0 27 50Z"/>
    <g stroke-width="3.4">
      <line x1="34" y1="66" x2="34" y2="86"/>
      <line x1="26" y1="76" x2="42" y2="76"/>
      <line x1="66" y1="66" x2="66" y2="86"/>
      <line x1="58" y1="76" x2="74" y2="76"/>
      <line x1="50" y1="70" x2="50" y2="90"/>
      <line x1="43" y1="80" x2="57" y2="80"/>
    </g>
  </svg>`,
  unknown: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 68h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 44 14 14 0 0 0 27 68Z"/>
  </svg>`,
};

function getWeatherCategory(description) {
  const d = (description || "").toLowerCase();
  if (d.includes("thunder")) return "thunderstorm";
  if (d.includes("snow")) return "snow";
  if (d.includes("shower") || d.includes("rain")) return "rain";
  if (d.includes("fog")) return "fog";
  if (d.includes("partly")) return "partly-cloudy";
  if (d.includes("clear")) return "clear";
  if (d.includes("overcast") || d.includes("cloud")) return "cloudy";
  return "unknown";
}

function updateWeatherTheme(description) {
  const category = getWeatherCategory(description);
  els.body.setAttribute("data-weather", category);
  els.weatherIcon.innerHTML = WEATHER_ICONS[category] || WEATHER_ICONS.unknown;
}

/* ----------------------------------------------------------------
   Theme (light / dark / system)
   ---------------------------------------------------------------- */

const THEME_ICONS = {
  light: `<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/>`,
  dark: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>`,
  system: `<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>`,
};

function getSystemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode) {
  if (mode === "system") return getSystemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  els.body.setAttribute("data-theme", resolved);
  els.themeIcon.innerHTML = THEME_ICONS[mode];
  els.themeToggle.setAttribute(
    "aria-label",
    `Theme: ${mode}. Tap to change.`
  );
}

function getThemeMode() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
}

function setThemeMode(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* localStorage unavailable — theme just won't persist */
  }
  applyTheme(mode);
}

function initTheme() {
  applyTheme(getThemeMode());

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getThemeMode() === "system") applyTheme("system");
    });
  }

  els.themeToggle.addEventListener("click", () => {
    const order = ["light", "dark", "system"];
    const next = order[(order.indexOf(getThemeMode()) + 1) % order.length];
    setThemeMode(next);
  });
}

/* ----------------------------------------------------------------
   Currency picker (custom dropdown — native <select> popups are
   rendered by the OS and ignore the app's theme entirely)
   ---------------------------------------------------------------- */

function ensureCurrencyOption(code) {
  if (!code || els.currencyPickerList.querySelector(`li[data-value="${code}"]`)) return;
  const li = document.createElement("li");
  li.setAttribute("role", "option");
  li.dataset.value = code;
  li.textContent = code;
  els.currencyPickerList.appendChild(li);
}

function setCurrency(code) {
  currentCurrency = code;
  els.currencyPickerValue.textContent = code;
  els.currencyPickerList.querySelectorAll("li[data-value]").forEach((li) => {
    li.setAttribute("aria-selected", String(li.dataset.value === code));
  });
}

function getCurrency() {
  return currentCurrency;
}

function openCurrencyPicker() {
  els.currencyPickerList.hidden = false;
  els.currencyPickerBtn.setAttribute("aria-expanded", "true");
}

function closeCurrencyPicker() {
  els.currencyPickerList.hidden = true;
  els.currencyPickerBtn.setAttribute("aria-expanded", "false");
}

function initCurrencyPicker() {
  els.currencyPickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (els.currencyPickerList.hidden) openCurrencyPicker();
    else closeCurrencyPicker();
  });

  els.currencyPickerList.addEventListener("click", (e) => {
    const opt = e.target.closest("li[data-value]");
    if (!opt) return;
    setCurrency(opt.dataset.value);
    closeCurrencyPicker();
  });

  document.addEventListener("click", (e) => {
    if (!els.currencyPicker.contains(e.target)) closeCurrencyPicker();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCurrencyPicker();
  });
}

/* ----------------------------------------------------------------
   API status
   ---------------------------------------------------------------- */

function updateApiStatus(isLive) {
  els.statusDot.classList.toggle("is-live", isLive === true);
  els.statusDot.classList.toggle("is-offline", isLive === false);
  els.statusText.textContent = isLive === null
    ? "Checking status…"
    : isLive
      ? "Live"
      : "Offline";
}

async function checkApiHealth() {
  updateApiStatus(null);
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    updateApiStatus(res.ok);
    return res.ok;
  } catch {
    updateApiStatus(false);
    return false;
  }
}

/* ----------------------------------------------------------------
   Loading / error / rendering
   ---------------------------------------------------------------- */

function showLoading() {
  els.loadingState.hidden = false;
  els.errorState.hidden = true;
  els.searchSubmit.disabled = true;
}

function hideLoading() {
  els.loadingState.hidden = true;
  els.searchSubmit.disabled = false;
}

function showError(kind, detailMessage) {
  const copy = {
    "not-found": {
      title: "City not found",
      message: "Try checking the spelling or searching for another city.",
    },
    "bad-gateway": {
      title: "Weather data unavailable",
      message: "Live data could not be retrieved right now.",
    },
    network: {
      title: "Connection problem",
      message: "Check your connection and try again.",
    },
  };

  const { title, message } = copy[kind] || copy.network;
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = detailMessage ? `${message} (${detailMessage})` : message;

  els.errorState.hidden = false;
  els.detailsPanel.hidden = true;
  els.currencyCard.hidden = true;
}

function hideError() {
  els.errorState.hidden = true;
}

// Backend doesn't return a timezone, so this derives a rough local time
// from the real longitude it does return (15 degrees longitude ~= 1 hour
// of offset). It's an estimate, not authoritative — labelled with "~".
function estimateLocalTime(longitude) {
  const offsetHours = Math.round(longitude / 15);
  const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const local = new Date(nowUtcMs + offsetHours * 3600000);
  return local.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderSnapshot(data) {
  els.cityName.textContent = data.city;
  els.countryName.textContent = data.country;

  els.temperature.textContent = `${Math.round(data.temperature_celsius)}°`;
  els.condition.textContent = data.weather_description;
  els.metaLine.textContent = `Local time ~${estimateLocalTime(data.longitude)}`;

  els.detailWind.textContent = `${Math.round(data.windspeed_kmh)} km/h`;
  els.detailLat.textContent = data.latitude.toFixed(4);
  els.detailLon.textContent = data.longitude.toFixed(4);
  els.detailsPanel.hidden = false;

  els.currencyBase.textContent = `1 ${data.base_currency}`;
  els.currencyTarget.textContent = `${data.exchange_rate.toFixed(2)} ${data.target_currency}`;
  els.currencySub.textContent = data.base_currency === data.target_currency
    ? "Base currency"
    : "Live exchange rate";
  els.currencyCard.hidden = false;

  updateWeatherTheme(data.weather_description);
  hideError();
}

/* ----------------------------------------------------------------
   Fetching
   ---------------------------------------------------------------- */

async function fetchSnapshot(city, currency) {
  showLoading();
  lastQuery = { city, currency };

  try {
    const url = `${API_BASE}/snapshot/${encodeURIComponent(city)}?currency=${encodeURIComponent(currency)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 404) {
        showError("not-found", data.message);
      } else {
        showError("bad-gateway", data.message);
      }
      updateApiStatus(true); // server answered, so it's reachable
      return;
    }

    renderSnapshot(data);
    updateApiStatus(true);
    closeSearchPanel();
  } catch (err) {
    showError("network");
    updateApiStatus(false);
  } finally {
    hideLoading();
  }
}

/* ----------------------------------------------------------------
   "Use my location"
   ---------------------------------------------------------------- */

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation isn't supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}

async function reverseGeocodeCity(latitude, longitude) {
  const url = `${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("reverse geocoding failed");
  const data = await res.json();
  const city = data.city || data.locality || data.principalSubdivision;
  if (!city) throw new Error("could not identify a city for this location");
  return { city, countryCode: data.countryCode };
}

function locateErrorMessage(err) {
  if (err && err.code === 1) return "Location access denied — search for a city instead.";
  if (err && err.code === 2) return "Your location couldn't be determined.";
  if (err && err.code === 3) return "Location request timed out — try again.";
  return (err && err.message) || "Something went wrong finding your location.";
}

async function handleUseLocation() {
  els.locateBtn.disabled = true;
  els.locateBtnLabel.textContent = "Locating…";
  els.locateStatus.hidden = true;

  try {
    const pos = await getCurrentPosition();
    const { city, countryCode } = await reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude);
    const currency = COUNTRY_CURRENCY[countryCode] || "USD";

    ensureCurrencyOption(currency);
    setCurrency(currency);
    els.cityInput.value = city;

    await fetchSnapshot(city, currency);
  } catch (err) {
    els.locateStatus.textContent = locateErrorMessage(err);
    els.locateStatus.hidden = false;
  } finally {
    els.locateBtn.disabled = false;
    els.locateBtnLabel.textContent = "Use my location";
  }
}

/* ----------------------------------------------------------------
   Search panel
   ---------------------------------------------------------------- */

function openSearchPanel() {
  els.searchPanel.hidden = false;
  els.searchBackdrop.hidden = false;
  els.searchFab.classList.add("is-hidden");
  els.searchFab.setAttribute("aria-expanded", "true");
  els.cityInput.value = lastQuery.city;
  setCurrency(lastQuery.currency);
  els.locateStatus.hidden = true;
  checkApiHealth();
  window.setTimeout(() => els.cityInput.focus(), 50);
}

function closeSearchPanel() {
  els.searchPanel.hidden = true;
  els.searchBackdrop.hidden = true;
  els.searchFab.classList.remove("is-hidden");
  els.searchFab.setAttribute("aria-expanded", "false");
  closeCurrencyPicker();
}

function initSearch() {
  els.searchFab.addEventListener("click", openSearchPanel);
  els.searchClose.addEventListener("click", closeSearchPanel);
  els.searchBackdrop.addEventListener("click", closeSearchPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.searchPanel.hidden) closeSearchPanel();
  });

  els.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const city = els.cityInput.value.trim();
    if (!city) return;
    fetchSnapshot(city, getCurrency());
  });

  els.suggestedCities.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-city]");
    if (!btn) return;
    const city = btn.dataset.city;
    const currency = CITY_CURRENCY[city] || getCurrency();
    els.cityInput.value = city;
    setCurrency(currency);
    fetchSnapshot(city, currency);
  });

  els.locateBtn.addEventListener("click", handleUseLocation);

  els.errorRetry.addEventListener("click", () => {
    fetchSnapshot(lastQuery.city, lastQuery.currency);
  });
}

/* ----------------------------------------------------------------
   Init
   ---------------------------------------------------------------- */

function init() {
  initTheme();
  initCurrencyPicker();
  initSearch();
  setCurrency(DEFAULT_CURRENCY);
  checkApiHealth();
  fetchSnapshot(DEFAULT_CITY, DEFAULT_CURRENCY);
  window.setInterval(checkApiHealth, 60000);
}

init();
