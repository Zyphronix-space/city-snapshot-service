// CityScope — Map view. Leaflet + OpenStreetMap tiles, lazily initialised
// the first time the Map view is opened. Search for a city and it jumps
// straight to that city's full dashboard on the Home view — a tiny map
// popup can't usefully show an hourly/daily forecast.
const MapView = (() => {
  let map = null;

  function ensureMap() {
    if (map) return map;
    map = L.map("map-container", { scrollWheelZoom: true }).setView([20, 10], 2);
    // Raw tile.openstreetmap.org (especially the deprecated {s} lettered
    // subdomains) now 403s embedded apps that don't follow OSM's volunteer
    // tile usage policy. CARTO's basemaps are explicitly free for this use
    // and its dark style matches the rest of the UI.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
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
