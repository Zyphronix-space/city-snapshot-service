// CityScope — search box behaviour (shared across Home/Map/Compare) and the
// Home dashboard: hero, metrics, hourly/daily forecast, air quality,
// currency + converter, travel snapshot, and weather analytics.

const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "LKR", "INR", "AUD", "CAD", "SGD", "AED",
  "CNY", "HKD", "CHF", "SEK", "NOK", "NZD", "ZAR", "THB", "MYR", "PHP",
  "IDR", "KRW", "TRY", "MXN", "BRL", "PKR", "BDT", "NPR", "SAR", "QAR",
];

// Countries that actually use Fahrenheit day-to-day (everywhere else uses
// Celsius) — so a city's default display unit matches what a local would
// actually see, until the user manually overrides it with the °C/°F toggle.
const FAHRENHEIT_COUNTRIES = new Set(["US", "BS", "BZ", "KY", "PW", "LR", "FM", "MH"]);
function unitForCountry(countryCode) {
  return FAHRENHEIT_COUNTRIES.has((countryCode || "").toUpperCase()) ? "F" : "C";
}

// Synthetic "city" label used only for browser-geolocation results (see
// location.js). The backend's resolveCityOrExplicit() skips geocoding
// entirely whenever lat/lon are both present, so this string is never
// looked up — it's just the display name. Never reverse-geocoded, never
// added to Recent/Favorites, never persisted.
const MY_LOCATION_LABEL = "My Location";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ----------------------------------------------------------------
   Shared search-as-you-type combobox, reused by Home/Map/Compare.
   ---------------------------------------------------------------- */
function createCitySearch({ input, form, list, onSelect }) {
  let debounceTimer = null;
  let currentResults = [];
  let activeIndex = -1;
  let requestToken = 0;

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    // Invalidate any in-flight debounced search so its response can't
    // reopen the list after the box has already been closed/submitted.
    clearTimeout(debounceTimer);
    requestToken++;
  }

  function highlight() {
    let activeId = null;
    [...list.children].forEach((li, i) => {
      const active = i === activeIndex;
      li.classList.toggle("is-active", active);
      if (li.getAttribute("role") === "option") {
        li.setAttribute("aria-selected", String(active));
        if (active) activeId = li.id;
      }
    });
    if (activeId) {
      input.setAttribute("aria-activedescendant", activeId);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;
    list.innerHTML = "";
    if (results.length === 0) {
      list.innerHTML = `<li class="suggestion-empty">No cities found. Press Enter to search anyway</li>`;
    } else {
      results.forEach((r, i) => {
        const li = document.createElement("li");
        li.id = `${list.id}-option-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        const meta = [r.region, r.country].filter(Boolean).join(", ");
        li.innerHTML = `<span class="suggestion-name">${escapeHtml(r.name)}</span><span class="suggestion-meta">${escapeHtml(meta)}</span>`;
        li.addEventListener("click", () => selectResult(r));
        list.appendChild(li);
      });
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight();
  }

  function selectResult(result) {
    close();
    input.value = result.name;
    onSelect(result);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      close();
      return;
    }
    list.hidden = false;
    list.innerHTML = `<li class="suggestion-loading">Searching…</li>`;
    input.setAttribute("aria-expanded", "true");
    const token = ++requestToken;
    debounceTimer = setTimeout(async () => {
      try {
        const results = await Api.searchCities(q, 10);
        if (token !== requestToken) return; // stale response — a newer keystroke already fired
        renderResults(results);
      } catch (err) {
        if (token !== requestToken) return;
        list.innerHTML = `<li class="suggestion-empty">${escapeHtml(err.message)}</li>`;
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      highlight();
    } else if (e.key === "Enter" && activeIndex >= 0 && currentResults[activeIndex]) {
      e.preventDefault();
      selectResult(currentResults[activeIndex]);
    } else if (e.key === "Escape") {
      close();
    }
  });

  document.addEventListener("click", (e) => {
    if (form && !form.contains(e.target) && !list.contains(e.target)) close();
  });

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      close();
      onSelect({ name: q });
    });
  }

  return { close, setValue: (v) => { input.value = v; } };
}

/* ----------------------------------------------------------------
   Home dashboard
   ---------------------------------------------------------------- */
const Home = (() => {
  let currentSnapshot = null;
  let currentLocationQuery = null;
  let timeInterval = null;

  function tempValue(celsius) {
    return Store.getUnit() === "F" ? (celsius * 9) / 5 + 32 : celsius;
  }
  function tempLabel(celsius) {
    return `${Math.round(tempValue(celsius))}°${Store.getUnit()}`;
  }

  function showLoading() {
    document.getElementById("home-loading").hidden = false;
    document.getElementById("home-error").hidden = true;
    document.getElementById("dashboard").hidden = true;
    document.getElementById("search-hero").hidden = true;
  }

  function showError(err) {
    const titles = {
      CITY_NOT_FOUND: "City not found",
      INVALID_CITY: "That doesn't look like a city name",
      UPSTREAM_UNAVAILABLE: "Live data unavailable",
      RATE_LIMITED: "Too many requests",
      NETWORK: "Connection problem",
    };
    document.getElementById("home-loading").hidden = true;
    document.getElementById("dashboard").hidden = true;
    document.getElementById("search-hero").hidden = false;
    const errEl = document.getElementById("home-error");
    errEl.hidden = false;
    document.getElementById("home-error-title").textContent = titles[err.code] || "Something went wrong";
    document.getElementById("home-error-message").textContent = err.message;
  }

  function hideStates() {
    document.getElementById("home-loading").hidden = true;
    document.getElementById("home-error").hidden = true;
  }

  async function loadCity(query, locationHint) {
    showLoading();
    currentLocationQuery = query;
    try {
      const snapshot = await Api.snapshot(query, { location: locationHint });
      currentSnapshot = snapshot;
      Store.setUnitAuto(unitForCountry(snapshot.location.countryCode));
      Main.syncUnitButton();
      hideStates();
      document.getElementById("search-hero").hidden = true;
      document.getElementById("dashboard").hidden = false;
      renderDashboard(snapshot);
      // "My Location" is deliberately never written to Recent Searches or
      // Favorites — those are named-city history, and this is raw
      // coordinates for a single request (see location.js / privacy.html).
      if (snapshot.location.name !== MY_LOCATION_LABEL) {
        Store.addRecent(snapshot.location);
        renderRecentChips();
      }
      Main.setWeatherAtmosphere(snapshot.current.condition.icon);
      const toastLabel = snapshot.location.country
        ? `${snapshot.location.name}, ${snapshot.location.country}`
        : snapshot.location.name;
      Main.showToast(`Showing ${toastLabel}`);
    } catch (err) {
      showError(err);
    }
  }

  function updateLocalTime() {
    if (!currentSnapshot) return;
    const { utcOffsetSeconds, timezone } = currentSnapshot.location;
    const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const local = new Date(nowUtcMs + utcOffsetSeconds * 1000);
    document.getElementById("hero-local-time").textContent = local.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    document.getElementById("hero-local-date").textContent = local.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    const offsetHours = utcOffsetSeconds / 3600;
    const sign = offsetHours >= 0 ? "+" : "-";
    document.getElementById("hero-timezone").textContent = `${timezone || "UTC"} (UTC${sign}${Math.abs(offsetHours)})`;
    updateDaypart();
  }

  // Minutes-since-midnight for an ISO-local "...THH:MM..." string (sunrise/
  // sunset come back already expressed in the city's own local time).
  function minutesOfDay(isoLike) {
    if (!isoLike) return null;
    const [, time] = isoLike.split("T");
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0);
  }

  // Day/night for the *searched city*, from its own sunrise/sunset — not
  // the visiting device's clock or OS theme. Epoch is shifted by the
  // city's UTC offset and read back with UTC getters (never local/device
  // getters) so this is correct regardless of what timezone the browser
  // itself is in.
  function updateDaypart() {
    if (!currentSnapshot) return;
    const { utcOffsetSeconds } = currentSnapshot.location;
    const { sunrise, sunset } = currentSnapshot.current;
    const sunriseMin = minutesOfDay(sunrise);
    const sunsetMin = minutesOfDay(sunset);
    if (sunriseMin == null || sunsetMin == null) return;
    const cityNow = new Date(Date.now() + utcOffsetSeconds * 1000);
    const nowMin = cityNow.getUTCHours() * 60 + cityNow.getUTCMinutes();
    const isDay = nowMin >= sunriseMin && nowMin < sunsetMin;
    Main.setDaypart(isDay);
  }

  function renderMetricsGrid(current) {
    const metrics = [
      { label: "Humidity", value: `${current.humidityPercent}%` },
      { label: "Wind", value: `${Math.round(current.windSpeedKmh)} km/h` },
      { label: "Pressure", value: `${Math.round(current.pressureMsl)} hPa` },
      { label: "Visibility", value: `${current.visibilityKm.toFixed(1)} km` },
      { label: "UV Index", value: current.uvIndex.toFixed(1) },
      { label: "Sunrise", value: formatTimeOnly(current.sunrise) },
      { label: "Sunset", value: formatTimeOnly(current.sunset) },
    ];
    const grid = document.getElementById("metrics-grid");
    grid.innerHTML = metrics.map((m) => `
      <div class="metric-card">
        <span class="metric-label">${escapeHtml(m.label)}</span>
        <span class="metric-value">${escapeHtml(m.value)}</span>
      </div>`).join("");
  }

  function formatTimeOnly(isoLike) {
    if (!isoLike) return "—";
    const [, time] = isoLike.split("T");
    return time || isoLike;
  }

  function renderHourly(hourly) {
    const scroll = document.getElementById("hourly-scroll");
    const next24 = hourly.slice(0, 24);
    scroll.innerHTML = next24.map((h) => {
      const hour = h.time.split("T")[1]?.slice(0, 5) || h.time;
      return `
        <div class="hourly-item">
          <span class="hourly-time">${escapeHtml(hour)}</span>
          <span class="hourly-icon">${weatherIconSvg(h.condition.icon)}</span>
          <span class="hourly-temp">${tempLabel(h.temperatureCelsius)}</span>
        </div>`;
    }).join("");

    const hourlyLabels = next24.map((h) => h.time.split("T")[1]?.slice(0, 5) || "");
    const hourlyValues = next24.map((h) => tempValue(h.temperatureCelsius));
    const hourlyFormat = (v) => `${Math.round(v)}°${Store.getUnit()}`;
    GlassChart.line(document.getElementById("hourly-chart"), {
      labels: hourlyLabels,
      values: hourlyValues,
      formatValue: (v) => `${Math.round(v)}°`,
    });
    fillChartTable("hourly-chart-table-body", hourlyLabels, hourlyValues, hourlyFormat);
  }

  function renderDaily(daily) {
    const list = document.getElementById("daily-list");
    list.innerHTML = daily.map((d, i) => {
      const label = i === 0 ? "Today" : new Date(`${d.date}T00:00:00`).toLocaleDateString([], { weekday: "short" });
      return `
        <li class="daily-row">
          <span class="daily-day">${escapeHtml(label)}</span>
          <span class="daily-icon">${weatherIconSvg(d.condition.icon)}</span>
          <span class="daily-rain">${d.precipitationProbabilityPercent}% rain</span>
          <span class="daily-temps"><span class="temp-max">${tempLabel(d.tempMaxCelsius)}</span> / <span class="temp-min">${tempLabel(d.tempMinCelsius)}</span></span>
        </li>`;
    }).join("");
  }

  function renderAirQuality(airQuality) {
    const card = document.getElementById("air-quality-card");
    if (!airQuality) {
      document.getElementById("aqi-value").textContent = "—";
      document.getElementById("aqi-category").textContent = "Unavailable";
      document.getElementById("aqi-explainer").textContent = "Air quality data couldn't be retrieved for this city right now.";
      document.getElementById("aqi-pm25").textContent = "—";
      document.getElementById("aqi-pm10").textContent = "—";
      document.getElementById("aqi-ozone").textContent = "—";
      return;
    }
    document.getElementById("aqi-value").textContent = airQuality.usAqi;
    document.getElementById("aqi-category").textContent = airQuality.category;
    const explainers = {
      Good: "Air quality is currently good.",
      Moderate: "Air quality is acceptable for most people.",
      "Unhealthy for Sensitive Groups": "Sensitive groups may experience mild effects.",
      Unhealthy: "Air quality may affect health with prolonged exposure.",
      "Very Unhealthy": "Health effects are likely. Limit outdoor exertion.",
      Hazardous: "Serious health risk. Avoid outdoor activity.",
    };
    document.getElementById("aqi-explainer").textContent = explainers[airQuality.category] || "";
    document.getElementById("aqi-pm25").textContent = `${airQuality.pm25.toFixed(1)} μg/m³`;
    document.getElementById("aqi-pm10").textContent = `${airQuality.pm10.toFixed(1)} μg/m³`;
    document.getElementById("aqi-ozone").textContent = `${airQuality.ozone.toFixed(1)} μg/m³`;
  }

  // The manual converter (pick any two currencies) is independent of the
  // detected base/target above, so it stays usable even when there's no
  // detected currency at all — previously this only got populated in the
  // success path below, leaving the <select>s empty (no options) whenever
  // currency data was unavailable.
  function populateConverterSelects(preferredFrom, preferredTo) {
    const fromSelect = document.getElementById("converter-from");
    const toSelect = document.getElementById("converter-to");
    const codes = new Set(COMMON_CURRENCIES);
    if (preferredFrom) codes.add(preferredFrom);
    if (preferredTo) codes.add(preferredTo);
    const options = [...codes].sort().map((c) => `<option value="${c}">${c}</option>`).join("");
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    fromSelect.value = preferredFrom || "USD";
    toSelect.value = preferredTo || "USD";
  }

  function renderCurrency(currency, isMyLocation) {
    document.getElementById("converter-result").textContent = "";
    // The backend has no country for a raw-coordinate lookup, so its
    // currency block (if any) would just be the USD fallback — showing
    // that as "your" currency would misleadingly imply it's local to you.
    // Rather than fabricate a country from coordinates, we simply don't
    // show a detected currency for My Location; the manual converter below
    // still works for any pair.
    const arrow = document.getElementById("currency-arrow");
    if (isMyLocation) {
      document.getElementById("currency-base-line").textContent = "Currency";
      document.getElementById("currency-target-line").textContent = "Unavailable";
      document.getElementById("currency-updated").textContent = "Unavailable for this location — CityScope doesn't determine a country from device location. Use the converter below for any currency pair.";
      arrow.hidden = true;
      populateConverterSelects();
      return;
    }
    if (!currency) {
      document.getElementById("currency-base-line").textContent = "Unavailable";
      document.getElementById("currency-target-line").textContent = "—";
      document.getElementById("currency-updated").textContent = "Currency data couldn't be retrieved right now.";
      arrow.hidden = true;
      populateConverterSelects();
      return;
    }
    arrow.hidden = false;
    document.getElementById("currency-base-line").textContent = `1 ${currency.baseCurrency}`;
    document.getElementById("currency-target-line").textContent = `${currency.exchangeRate.toFixed(2)} ${currency.targetCurrency}`;
    document.getElementById("currency-updated").textContent = `Last updated ${currency.lastUpdatedUtc}`;
    populateConverterSelects(currency.baseCurrency, currency.targetCurrency);
  }

  // "Outdoor window" implicitly means daylight — a technically-dry, mild
  // 1 AM doesn't answer "when should I go outside". Each daily entry
  // carries its own real sunrise/sunset, so hours are checked against the
  // sunrise/sunset of whichever calendar day they actually fall on (the
  // 24h hourly range can cross into tomorrow), rather than guessed.
  function isDaylightHour(h, daily) {
    const [datePart] = h.time.split("T");
    const dayEntry = daily.find((d) => d.date === datePart);
    const toMin = (iso) => {
      const t = iso && iso.split("T")[1];
      if (!t) return null;
      const [hh, mm] = t.split(":").map(Number);
      return hh * 60 + (mm || 0);
    };
    const hMin = toMin(h.time);
    const sunrise = dayEntry && toMin(dayEntry.sunrise);
    const sunset = dayEntry && toMin(dayEntry.sunset);
    if (hMin == null || sunrise == null || sunset == null) return true; // unknown day -> don't exclude it
    return hMin >= sunrise && hMin <= sunset;
  }

  // Scores each of the next 24 hourly readings for outdoor comfort (lower
  // rain chance and moderate temperature/wind score higher), then finds the
  // best-scoring 2-hour daylight block. Returns null rather than a
  // low-confidence guess when nothing clears a reasonable bar — the caller
  // must not invent a "best window" when the data doesn't support one.
  function findBestOutdoorWindow(hourly, daily) {
    if (!hourly || hourly.length < 2 || !daily) return null;
    const next24 = hourly.slice(0, 24).filter((h) => isDaylightHour(h, daily));
    const scoreOf = (h) => {
      let score = 100;
      const t = h.temperatureCelsius;
      if (t < 10 || t > 35) score -= 60;
      else if (t < 15 || t > 32) score -= 30;
      else if (t < 18 || t > 28) score -= 10;
      score -= h.precipitationProbabilityPercent * 0.8;
      if (h.windSpeedKmh > 40) score -= 20;
      else if (h.windSpeedKmh > 25) score -= 8;
      return score;
    };
    let best = null;
    for (let i = 0; i < next24.length - 1; i++) {
      const a = next24[i];
      const b = next24[i + 1];
      // Only pair genuinely adjacent hours — filtering to daylight can
      // leave gaps (e.g. today's last daylight hour next to tomorrow's
      // first), which would otherwise claim a contiguous window that isn't.
      if (new Date(b.time) - new Date(a.time) > 3600 * 1000) continue;
      const avgScore = (scoreOf(a) + scoreOf(b)) / 2;
      if (!best || avgScore > best.avgScore) best = { start: a, end: b, avgScore };
    }
    if (!best || best.avgScore < 55) return null;
    const timeOf = (h) => h.time.split("T")[1]?.slice(0, 5) || h.time;
    return { startLabel: timeOf(best.start), endLabel: timeOf(best.end) };
  }

  function renderTravelSnapshot(snapshot) {
    const { current, daily, airQuality, hourly } = snapshot;
    const rainProb = daily[0]?.precipitationProbabilityPercent ?? 0;
    const reasons = [];
    let cautionCount = 0;

    const temp = current.temperatureCelsius;
    if (temp < 10 || temp > 35) {
      reasons.push("Extreme temperature: dress accordingly");
      cautionCount += 2;
    } else if (temp > 30) {
      reasons.push("Warm weather: stay hydrated");
      cautionCount += 1;
    } else if (temp < 18) {
      reasons.push("Cool weather: bring a jacket");
      cautionCount += 1;
    } else {
      reasons.push("Comfortable temperature");
    }

    if (rainProb < 30) {
      reasons.push("Low rain probability");
    } else if (rainProb < 60) {
      reasons.push("Moderate rain probability: carry an umbrella");
      cautionCount += 1;
    } else {
      reasons.push("High rain probability");
      cautionCount += 2;
    }

    if (current.windSpeedKmh > 40) {
      reasons.push("Strong winds");
      cautionCount += 1;
    }

    if (current.uvIndex >= 8) {
      reasons.push("Very high UV: sun protection recommended");
      cautionCount += 1;
    } else if (current.uvIndex >= 6) {
      reasons.push("Moderate-high UV");
    }

    if (airQuality && airQuality.usAqi > 100) {
      reasons.push(`Air quality: ${airQuality.category}`);
      cautionCount += 1;
    }

    const level = cautionCount >= 4 ? "poor" : cautionCount >= 2 ? "caution" : "good";
    const badge = document.getElementById("travel-badge");
    badge.className = `travel-badge is-${level}`;
    // Pair the state color with both an icon and text, never color alone.
    const badgeIcons = {
      good: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      caution: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
      poor: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    };
    const badgeLabel = level === "good" ? "GOOD" : level === "caution" ? "CAUTION" : "POOR";
    badge.innerHTML = `${badgeIcons[level]}<span>${badgeLabel}</span>`;
    document.getElementById("travel-reasons").innerHTML = reasons.slice(0, 4).map((r) => `<li>${escapeHtml(r)}</li>`).join("");

    const windowEl = document.getElementById("travel-window");
    const window_ = findBestOutdoorWindow(hourly, daily);
    if (window_) {
      document.getElementById("travel-window-value").textContent = `${window_.startLabel} – ${window_.endLabel}`;
      windowEl.hidden = false;
    } else {
      windowEl.hidden = true;
    }
  }

  function renderAnalytics(daily) {
    const labels = daily.map((d, i) => (i === 0 ? "Today" : new Date(`${d.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })));
    const trendValues = daily.map((d) => tempValue(d.tempMaxCelsius));
    GlassChart.line(document.getElementById("temp-trend-chart"), {
      labels,
      values: trendValues,
      formatValue: (v) => `${Math.round(v)}°`,
    });
    fillChartTable("temp-trend-chart-table-body", labels, trendValues, (v) => `${Math.round(v)}°${Store.getUnit()}`);

    const rainValues = daily.map((d) => d.precipitationProbabilityPercent);
    GlassChart.bars(document.getElementById("rain-chart"), {
      labels,
      values: rainValues,
      max: 100,
    });
    fillChartTable("rain-chart-table-body", labels, rainValues, (v) => `${Math.round(v)}%`);

    const highs = daily.map((d) => d.tempMaxCelsius);
    const lows = daily.map((d) => d.tempMinCelsius);
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const average = (highs.reduce((a, b) => a + b, 0) + lows.reduce((a, b) => a + b, 0)) / (highs.length + lows.length);
    document.getElementById("range-row").innerHTML = `
      <div class="range-item"><div class="range-label">Highest</div><div class="range-value">${tempLabel(highest)}</div></div>
      <div class="range-item"><div class="range-label">Lowest</div><div class="range-value">${tempLabel(lowest)}</div></div>
      <div class="range-item"><div class="range-label">Average</div><div class="range-value">${tempLabel(average)}</div></div>`;
  }

  function renderFavoriteButton(location) {
    const btn = document.getElementById("favorite-btn");
    const isFav = Store.isFavorite(location);
    btn.setAttribute("aria-pressed", String(isFav));
    btn.setAttribute("aria-label", isFav ? "Remove from my cities" : "Pin this city");
  }

  function renderDashboard(snapshot) {
    const { location, current, hourly, daily, airQuality, currency } = snapshot;
    const isMyLocation = location.name === MY_LOCATION_LABEL;

    document.getElementById("hero-city").textContent = location.name;
    // For My Location there's no city/country to show (no reverse geocoding
    // — see location.js) — say so plainly instead of leaving a blank line
    // that reads as missing data.
    document.getElementById("hero-country").textContent = isMyLocation
      ? "Current conditions based on your device location"
      : [location.region, location.country].filter(Boolean).join(", ");
    document.getElementById("hero-icon").innerHTML = weatherIconSvg(current.condition.icon);
    document.getElementById("hero-temp").textContent = tempLabel(current.temperatureCelsius);
    document.getElementById("hero-condition").textContent = current.condition.description;
    // Compact glanceable line right under the temperature — the same
    // values also appear in the detailed metrics grid below; this isn't a
    // second data source, just a more prominent restatement of it.
    document.getElementById("hero-feels").textContent =
      `Feels like ${tempLabel(current.feelsLikeCelsius)} · Humidity ${current.humidityPercent}% · Wind ${Math.round(current.windSpeedKmh)} km/h`;
    const hiloEl = document.getElementById("hero-hilo");
    const today = daily && daily[0];
    if (today) {
      hiloEl.textContent = `H:${tempLabel(today.tempMaxCelsius)} L:${tempLabel(today.tempMinCelsius)}`;
      hiloEl.hidden = false;
    } else {
      hiloEl.hidden = true;
    }
    // Pinning "My Location" would write raw coordinates into Favorites —
    // not allowed (see privacy.html) — so the control isn't offered at all.
    const favBtn = document.getElementById("favorite-btn");
    favBtn.hidden = isMyLocation;
    if (!isMyLocation) renderFavoriteButton(location);
    renderMyCitiesCard();

    clearInterval(timeInterval);
    updateLocalTime();
    timeInterval = setInterval(updateLocalTime, 30000);

    renderMetricsGrid(current);
    renderHourly(hourly);
    renderDaily(daily);
    renderAirQuality(airQuality);
    renderCurrency(currency, isMyLocation);
    renderTravelSnapshot(snapshot);
    renderAnalytics(daily);
  }

  function renderRecentChips() {
    const recent = Store.getRecent();
    const block = document.getElementById("recent-searches-block");
    const row = document.getElementById("recent-chip-row");
    block.hidden = recent.length === 0;
    row.innerHTML = recent.map((c, i) => `<button type="button" class="chip" data-recent-index="${i}">${escapeHtml(c.name)}</button>`).join("");
    row.querySelectorAll("[data-recent-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = recent[Number(btn.dataset.recentIndex)];
        loadCity(loc.name, loc);
      });
    });
    renderFavoriteChips();
  }

  function renderFavoriteChips() {
    const favs = Store.getFavorites();
    const block = document.getElementById("favorite-cities-block");
    const row = document.getElementById("favorite-chip-row");
    block.hidden = favs.length === 0;
    row.innerHTML = favs.map((c, i) => `<button type="button" class="chip" data-fav-index="${i}">${escapeHtml(c.name)}</button>`).join("");
    row.querySelectorAll("[data-fav-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = favs[Number(btn.dataset.favIndex)];
        loadCity(loc.name, loc);
      });
    });
    renderMyCitiesCard();
  }

  // "My Cities" as it appears on the dashboard itself, not just the hero —
  // pinned cities were previously only reachable before a city was loaded.
  // Deliberately name-only (no live temperature per pin): showing a live
  // temp for every pinned city would mean fetching a fresh snapshot for
  // each one on every dashboard render, which doesn't scale and isn't
  // worth the extra API load for a "quick open" list.
  function renderMyCitiesCard() {
    const favs = Store.getFavorites();
    const card = document.getElementById("my-cities-card");
    const row = document.getElementById("my-cities-row");
    card.hidden = favs.length === 0;
    row.innerHTML = favs.map((c, i) => `
      <span class="my-city-pill">
        <button type="button" class="my-city-open" data-open-index="${i}">${escapeHtml(c.name)}</button>
        <button type="button" class="my-city-unpin" data-unpin-index="${i}" aria-label="Unpin ${escapeHtml(c.name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>`).join("");
    row.querySelectorAll("[data-open-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = favs[Number(btn.dataset.openIndex)];
        loadCity(loc.name, loc);
      });
    });
    row.querySelectorAll("[data-unpin-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = favs[Number(btn.dataset.unpinIndex)];
        Store.toggleFavorite(loc);
        if (currentSnapshot && currentSnapshot.location.name === loc.name && currentSnapshot.location.country === loc.country) {
          renderFavoriteButton(currentSnapshot.location);
        }
        renderFavoriteChips();
      });
    });
  }

  function init() {
    document.getElementById("home-error-retry").addEventListener("click", () => {
      if (currentLocationQuery) loadCity(currentLocationQuery);
    });

    document.getElementById("favorite-btn").addEventListener("click", () => {
      if (!currentSnapshot || currentSnapshot.location.name === MY_LOCATION_LABEL) return;
      const nowFav = Store.toggleFavorite(currentSnapshot.location);
      renderFavoriteButton(currentSnapshot.location);
      renderFavoriteChips();
      Main.showToast(nowFav ? "Added to My Cities" : "Removed from My Cities");
    });

    document.getElementById("popular-cities").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-city]");
      if (btn) loadCity(btn.dataset.city);
    });

    document.getElementById("clear-recent").addEventListener("click", () => {
      Store.clearRecent();
      renderRecentChips();
    });

    document.getElementById("converter-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById("converter-amount").value);
      const from = document.getElementById("converter-from").value;
      const to = document.getElementById("converter-to").value;
      const resultEl = document.getElementById("converter-result");
      if (!amount || amount <= 0) {
        resultEl.textContent = "Enter an amount greater than zero.";
        return;
      }
      resultEl.textContent = "Converting…";
      try {
        const result = await Api.convertCurrency(amount, from, to);
        resultEl.textContent = `${result.amount} ${result.fromCurrency} ≈ ${result.convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${result.toCurrency}`;
      } catch (err) {
        resultEl.textContent = err.message;
      }
    });

    createCitySearch({
      input: document.getElementById("hero-search-input"),
      form: document.getElementById("hero-search-form"),
      list: document.getElementById("hero-suggestions"),
      onSelect: (r) => loadCity(r.name, r),
    });

    createCitySearch({
      input: document.getElementById("dashboard-search-input"),
      form: document.getElementById("dashboard-search-form"),
      list: document.getElementById("dashboard-suggestions"),
      onSelect: (r) => loadCity(r.name, r),
    });

    renderRecentChips();
  }

  return { init, loadCity, refreshUnits: () => currentSnapshot && renderDashboard(currentSnapshot) };
})();
