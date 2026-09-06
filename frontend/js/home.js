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
    activeIndex = -1;
    // Invalidate any in-flight debounced search so its response can't
    // reopen the list after the box has already been closed/submitted.
    clearTimeout(debounceTimer);
    requestToken++;
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.classList.toggle("is-active", i === activeIndex));
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;
    list.innerHTML = "";
    if (results.length === 0) {
      list.innerHTML = `<li class="suggestion-empty">No cities found — press Enter to search anyway</li>`;
    } else {
      results.forEach((r) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        const meta = [r.region, r.country].filter(Boolean).join(", ");
        li.innerHTML = `<span class="suggestion-name">${escapeHtml(r.name)}</span><span class="suggestion-meta">${escapeHtml(meta)}</span>`;
        li.addEventListener("click", () => selectResult(r));
        list.appendChild(li);
      });
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
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
        const results = await Api.searchCities(q, 6);
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
  let currentLocationQuery = "Colombo";
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
      Store.addRecent(snapshot.location);
      renderRecentChips();
      Main.setWeatherAtmosphere(snapshot.current.condition.icon);
      Main.showToast(`Showing ${snapshot.location.name}, ${snapshot.location.country}`);
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

    GlassChart.line(document.getElementById("hourly-chart"), {
      labels: next24.map((h) => h.time.split("T")[1]?.slice(0, 5) || ""),
      values: next24.map((h) => tempValue(h.temperatureCelsius)),
      formatValue: (v) => `${Math.round(v)}°`,
    });
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
      "Very Unhealthy": "Health effects are likely — limit outdoor exertion.",
      Hazardous: "Serious health risk — avoid outdoor activity.",
    };
    document.getElementById("aqi-explainer").textContent = explainers[airQuality.category] || "";
    document.getElementById("aqi-pm25").textContent = `${airQuality.pm25.toFixed(1)} μg/m³`;
    document.getElementById("aqi-pm10").textContent = `${airQuality.pm10.toFixed(1)} μg/m³`;
    document.getElementById("aqi-ozone").textContent = `${airQuality.ozone.toFixed(1)} μg/m³`;
  }

  function renderCurrency(currency) {
    if (!currency) {
      document.getElementById("currency-base-line").textContent = "Unavailable";
      document.getElementById("currency-target-line").textContent = "—";
      document.getElementById("currency-updated").textContent = "Currency data couldn't be retrieved right now.";
      return;
    }
    document.getElementById("currency-base-line").textContent = `1 ${currency.baseCurrency}`;
    document.getElementById("currency-target-line").textContent = `${currency.exchangeRate.toFixed(2)} ${currency.targetCurrency}`;
    document.getElementById("currency-updated").textContent = `Last updated ${currency.lastUpdatedUtc}`;

    const fromSelect = document.getElementById("converter-from");
    const toSelect = document.getElementById("converter-to");
    const codes = new Set([...COMMON_CURRENCIES, currency.baseCurrency, currency.targetCurrency]);
    const options = [...codes].sort().map((c) => `<option value="${c}">${c}</option>`).join("");
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    fromSelect.value = currency.baseCurrency;
    toSelect.value = currency.targetCurrency;
    document.getElementById("converter-result").textContent = "";
  }

  function renderTravelSnapshot(snapshot) {
    const { current, daily, airQuality } = snapshot;
    const rainProb = daily[0]?.precipitationProbabilityPercent ?? 0;
    const reasons = [];
    let cautionCount = 0;

    const temp = current.temperatureCelsius;
    if (temp < 10 || temp > 35) {
      reasons.push("Extreme temperature — dress accordingly");
      cautionCount += 2;
    } else if (temp > 30) {
      reasons.push("Warm weather — stay hydrated");
      cautionCount += 1;
    } else if (temp < 18) {
      reasons.push("Cool weather — bring a jacket");
      cautionCount += 1;
    } else {
      reasons.push("Comfortable temperature");
    }

    if (rainProb < 30) {
      reasons.push("Low rain probability");
    } else if (rainProb < 60) {
      reasons.push("Moderate rain probability — carry an umbrella");
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
      reasons.push("Very high UV — sun protection recommended");
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
    badge.textContent = level === "good" ? "GOOD" : level === "caution" ? "CAUTION" : "POOR";
    document.getElementById("travel-reasons").innerHTML = reasons.slice(0, 4).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  }

  function renderAnalytics(daily) {
    const labels = daily.map((d, i) => (i === 0 ? "Today" : new Date(`${d.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })));
    GlassChart.line(document.getElementById("temp-trend-chart"), {
      labels,
      values: daily.map((d) => tempValue(d.tempMaxCelsius)),
      formatValue: (v) => `${Math.round(v)}°`,
    });
    GlassChart.bars(document.getElementById("rain-chart"), {
      labels,
      values: daily.map((d) => d.precipitationProbabilityPercent),
      max: 100,
    });

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

    document.getElementById("hero-city").textContent = location.name;
    document.getElementById("hero-country").textContent = [location.region, location.country].filter(Boolean).join(", ");
    document.getElementById("hero-icon").innerHTML = weatherIconSvg(current.condition.icon);
    document.getElementById("hero-temp").textContent = tempLabel(current.temperatureCelsius);
    document.getElementById("hero-condition").textContent = current.condition.description;
    document.getElementById("hero-feels").textContent = `Feels like ${tempLabel(current.feelsLikeCelsius)}`;
    renderFavoriteButton(location);

    clearInterval(timeInterval);
    updateLocalTime();
    timeInterval = setInterval(updateLocalTime, 30000);

    renderMetricsGrid(current);
    renderHourly(hourly);
    renderDaily(daily);
    renderAirQuality(airQuality);
    renderCurrency(currency);
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
  }

  function init() {
    document.getElementById("home-error-retry").addEventListener("click", () => loadCity(currentLocationQuery));

    document.getElementById("favorite-btn").addEventListener("click", () => {
      if (!currentSnapshot) return;
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
