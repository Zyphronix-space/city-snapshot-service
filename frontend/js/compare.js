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

  // Same "shift to UTC, then shift again by the city's own offset" trick
  // Home.updateLocalTime() uses — kept identical so the two never disagree.
  // This is a snapshot at render time, not a ticking clock (a live per-row
  // interval for up to 4 cities isn't worth the added complexity here).
  function localTimeLabel(location) {
    const { utcOffsetSeconds } = location;
    if (utcOffsetSeconds == null) return "—";
    const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const local = new Date(nowUtcMs + utcOffsetSeconds * 1000);
    return local.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function render() {
    const empty = document.getElementById("compare-empty");
    const grid = document.getElementById("compare-grid");
    const chartCard = document.getElementById("compare-chart-card");

    empty.hidden = cities.length > 0;
    grid.hidden = cities.length === 0;
    chartCard.hidden = cities.length === 0;

    if (cities.length === 0) {
      grid.innerHTML = "";
    } else {
      const headerCells = cities.map((s, i) => `
        <th scope="col">
          <span class="compare-city-name">${escapeHtml(s.location.name)}</span>
          ${s.location.country ? `<span class="compare-city-country">${escapeHtml(s.location.country)}</span>` : ""}
          <button type="button" class="compare-remove" data-remove-index="${i}" aria-label="Remove ${escapeHtml(s.location.name)} from comparison">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </th>`).join("");

      const rows = [
        { label: "Temperature", cell: (s) => tempLabel(s.current.temperatureCelsius) },
        { label: "Feels like", cell: (s) => tempLabel(s.current.feelsLikeCelsius) },
        { label: "Weather", cell: (s) => escapeHtml(s.current.condition.description) },
        { label: "Air quality", cell: (s) => (s.airQuality ? `${s.airQuality.usAqi} · ${escapeHtml(s.airQuality.category)}` : "Unavailable") },
        { label: "Local time", cell: (s) => localTimeLabel(s.location) },
      ];

      const bodyRows = rows.map((row) => `
        <tr>
          <th scope="row">${row.label}</th>
          ${cities.map((s) => `<td>${row.cell(s)}</td>`).join("")}
        </tr>`).join("");

      grid.innerHTML = `
        <table class="compare-table">
          <caption class="sr-only">Comparing ${cities.map((s) => s.location.name).join(", ")}</caption>
          <thead><tr><th scope="col"><span class="sr-only">Metric</span></th>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>`;
    }

    grid.querySelectorAll("[data-remove-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cities.splice(Number(btn.dataset.removeIndex), 1);
        render();
      });
    });

    if (cities.length > 0) {
      const compareLabels = cities.map((s) => s.location.name);
      const compareValues = cities.map((s) => tempValue(s.current.temperatureCelsius));
      GlassChart.bars(document.getElementById("compare-chart"), {
        labels: compareLabels,
        values: compareValues,
        max: Math.max(40, ...compareValues) * 1.15,
        formatValue: (v) => `${Math.round(v)}°`,
      });
      fillChartTable("compare-chart-table-body", compareLabels, compareValues, (v) => `${Math.round(v)}°${unitLabel()}`);
    } else {
      const body = document.getElementById("compare-chart-table-body");
      if (body) body.innerHTML = "";
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
