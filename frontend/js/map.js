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
    // subdomains) 403s embedded apps that don't follow OSM's volunteer tile
    // usage policy, and CARTO's basemaps now require a signed-up API key
    // (see carto.com/basemaps/apikey). Esri's World Dark Gray Base is free
    // and keyless for basemap display, no registration needed.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community",
        maxZoom: 16,
      }
    ).addTo(map);
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
