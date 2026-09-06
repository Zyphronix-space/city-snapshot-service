// CityScope — Map view. Leaflet + OpenStreetMap tiles, lazily initialised
// the first time the Map view is opened. Search for a city and it jumps
// straight to that city's full dashboard on the Home view — a tiny map
// popup can't usefully show an hourly/daily forecast.
const MapView = (() => {
  let map = null;

  function ensureMap() {
    if (map) return map;
    map = L.map("map-container", { scrollWheelZoom: true }).setView([20, 10], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);
    return map;
  }

  async function selectCity(name, locationHint) {
    Main.showToast(`Loading ${name}…`);
    await Home.loadCity(name, locationHint);
    Main.switchView("home");
  }

  function onShown() {
    ensureMap();
    // Leaflet needs a resize nudge if its container was `display:none` when created.
    setTimeout(() => map && map.invalidateSize(), 50);
  }

  function init() {
    createCitySearch({
      input: document.getElementById("map-search-input"),
      form: document.getElementById("map-search-form"),
      list: document.getElementById("map-suggestions"),
      onSelect: (r) => selectCity(r.name, r),
    });
  }

  return { init, onShown };
})();
