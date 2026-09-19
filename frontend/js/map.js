// CityScope — Map view. A 3D globe (GlobeView, js/globe.js) is the primary
// experience; a flat Leaflet + OpenStreetMap-tile map is kept as a graceful
// fallback for the rare browser/device without usable WebGL. Search for a
// city and it jumps straight to that city's full dashboard on the Home
// view — a tiny map popup can't usefully show an hourly/daily forecast.
const MapView = (() => {
  let map = null;
  let usingGlobe = false;
  let globeInited = false;

  function ensureLeaflet() {
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
    // Esri's companion "Reference" layer for this same basemap — place
    // names, borders, and other labels, more of them revealed at higher
    // zoom (the standard Esri Canvas base/reference pairing). Same free,
    // keyless Esri service as the base layer above, so it doesn't add a
    // new attribution line or a new third party.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, pane: "overlayPane" }
    ).addTo(map);
    return map;
  }

  function ensureGlobe() {
    if (globeInited) return;
    globeInited = true;
    GlobeView.init({
      canvasEl: document.getElementById("globe-canvas"),
      wrapEl: document.getElementById("globe-canvas-wrap"),
      stageEl: document.getElementById("globe-stage"),
      markersEl: document.getElementById("globe-markers"),
      hint: document.getElementById("globe-hint"),
      zoomIn: document.getElementById("globe-zoom-in"),
      zoomOut: document.getElementById("globe-zoom-out"),
      onSelect: (m) => selectCity(m.name, m),
    });
  }

  // The hero's "Popular" chips are real cities but only carry a name, not
  // coordinates — resolved once via the same search API the rest of the
  // app already uses, then cached forever (these six never change), so a
  // first-time visitor with empty Recent/Favorites still sees real,
  // clickable cities on the globe instead of a bare sphere.
  async function popularCityMarkers() {
    const names = [...document.querySelectorAll("#popular-cities [data-city]")].map((b) => b.dataset.city);
    const cache = readJson(STORAGE_KEYS.popularCoords, {});
    const missing = names.filter((n) => !cache[n]);
    if (missing.length) {
      const results = await Promise.all(
        missing.map((n) => Api.searchCities(n, 1).then((r) => r[0] || null).catch(() => null))
      );
      missing.forEach((n, i) => {
        const r = results[i];
        if (r) cache[n] = { name: r.name, country: r.country, latitude: r.latitude, longitude: r.longitude };
      });
      writeJson(STORAGE_KEYS.popularCoords, cache);
    }
    return names.map((n) => cache[n]).filter(Boolean);
  }

  // Only data CityScope actually has: recent searches, favorites, the city
  // currently open on Home, the hero's own Popular chips, and — as a
  // baseline world-coverage layer — one real capital/major city per
  // country from js/data/world-capitals.js (static data, not invented).
  // Personal history (recent/favorite/current) takes priority over a
  // same-named capital entry.
  async function collectMarkers() {
    const byId = new Map();
    const popular = await popularCityMarkers();
    const current = Home.getCurrentLocation();
    // alwaysShow: a personal/popular city stays visible at every zoom
    // level; the world-capitals layer is what GlobeView progressively
    // reveals by population as you zoom in (see positionMarkers()).
    for (const loc of [...popular, ...Store.getFavorites(), ...Store.getRecent()]) {
      if (loc.name === MY_LOCATION_LABEL) continue;
      const key = `${loc.name}|${loc.country || ""}`;
      if (!byId.has(key)) byId.set(key, { ...loc, selected: false, alwaysShow: true });
    }
    for (const loc of WORLD_CAPITALS) {
      const key = `${loc.name}|${loc.country || ""}`;
      if (!byId.has(key)) byId.set(key, { ...loc, selected: false, alwaysShow: false });
    }
    if (current && current.name !== MY_LOCATION_LABEL) {
      const key = `${current.name}|${current.country || ""}`;
      byId.set(key, { ...current, selected: true, alwaysShow: true });
    }
    return [...byId.values()];
  }

  async function selectCity(name, locationHint) {
    Main.showToast(`Loading ${name}…`);
    const focus =
      usingGlobe && locationHint && Number.isFinite(locationHint.latitude)
        ? GlobeView.focusOn(locationHint.latitude, locationHint.longitude)
        : Promise.resolve();
    await Promise.all([focus, Home.loadCity(name, locationHint)]);
    Main.switchView("home");
  }

  function onShown() {
    if (usingGlobe) {
      ensureGlobe();
      GlobeView.onShown();
      collectMarkers().then((markers) => GlobeView.setMarkers(markers));
    } else {
      ensureLeaflet();
      // Leaflet needs a resize nudge if its container was `display:none` when created.
      setTimeout(() => map && map.invalidateSize(), 50);
    }
  }

  function onHidden() {
    if (usingGlobe) GlobeView.onHidden();
  }

  function init() {
    usingGlobe = window.GlobeView && GlobeView.isSupported();
    document.getElementById("globe-frame").hidden = !usingGlobe;
    document.getElementById("map-frame").hidden = usingGlobe;

    createCitySearch({
      input: document.getElementById("map-search-input"),
      form: document.getElementById("map-search-form"),
      list: document.getElementById("map-suggestions"),
      onSelect: (r) => selectCity(r.name, r),
    });
  }

  return { init, onShown, onHidden };
})();
