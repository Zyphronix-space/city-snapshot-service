// CityScope — Compare view: 2-4 cities side by side, plus a small
// temperature comparison chart. Each card's data is its own real snapshot.
const Compare = (() => {
  const MAX_CITIES = 4;
  let cities = []; // { snapshot }

  function unitLabel() {
    return Store.getUnit();
  }
  function tempValue(celsius) {
    return unitLabel() === "F" ? (celsius * 9) / 5 + 32 : celsius;
  }
  function tempLabel(celsius) {
    return `${Math.round(tempValue(celsius))}°${unitLabel()}`;
  }

  function render() {
    const empty = document.getElementById("compare-empty");
    const grid = document.getElementById("compare-grid");
    const chartCard = document.getElementById("compare-chart-card");

    empty.hidden = cities.length > 0;
    grid.hidden = cities.length === 0;
    chartCard.hidden = cities.length === 0;

    grid.innerHTML = cities.map((snapshot, i) => {
      const { location, current, airQuality } = snapshot;
      return `
        <article class="glass-card compare-card">
          <button type="button" class="compare-remove" data-remove-index="${i}" aria-label="Remove ${escapeHtml(location.name)}">✕</button>
          <h3>${escapeHtml(location.name)}</h3>
          <p class="compare-country">${escapeHtml(location.country)}</p>
          <p class="compare-temp">${tempLabel(current.temperatureCelsius)}</p>
          <p class="compare-condition">${escapeHtml(current.condition.description)}</p>
          <ul class="compare-metric-list">
            <li><span>Feels like</span><strong>${tempLabel(current.feelsLikeCelsius)}</strong></li>
            <li><span>Humidity</span><strong>${current.humidityPercent}%</strong></li>
            <li><span>Wind</span><strong>${Math.round(current.windSpeedKmh)} km/h</strong></li>
            <li><span>Rain prob.</span><strong>${snapshot.daily[0]?.precipitationProbabilityPercent ?? "—"}%</strong></li>
            <li><span>AQI</span><strong>${airQuality ? airQuality.usAqi : "—"}</strong></li>
          </ul>
        </article>`;
    }).join("");

    grid.querySelectorAll("[data-remove-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cities.splice(Number(btn.dataset.removeIndex), 1);
        render();
      });
    });

    if (cities.length > 0) {
      GlassChart.bars(document.getElementById("compare-chart"), {
        labels: cities.map((s) => s.location.name),
        values: cities.map((s) => tempValue(s.current.temperatureCelsius)),
        max: Math.max(40, ...cities.map((s) => tempValue(s.current.temperatureCelsius))) * 1.15,
        formatValue: (v) => `${Math.round(v)}°`,
      });
    }
  }

  async function addCity(name, locationHint) {
    if (cities.length >= MAX_CITIES) {
      Main.showToast(`You can compare up to ${MAX_CITIES} cities. Remove one first.`, true);
      return;
    }
    try {
      const snapshot = await Api.snapshot(name, { location: locationHint });
      if (cities.some((s) => s.location.name === snapshot.location.name && s.location.country === snapshot.location.country)) {
        Main.showToast(`${snapshot.location.name} is already added.`, true);
        return;
      }
      cities.push(snapshot);
      render();
    } catch (err) {
      Main.showToast(err.message, true);
    }
  }

  function init() {
    createCitySearch({
      input: document.getElementById("compare-search-input"),
      form: document.getElementById("compare-search-form"),
      list: document.getElementById("compare-suggestions"),
      onSelect: (r) => addCity(r.name, r),
    });
    render();
  }

  return { init, refreshUnits: render };
})();
