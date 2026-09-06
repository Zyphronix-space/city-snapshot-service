// CityScope — all persistence is localStorage only (no backend account
// system). Recent searches, favorites and UI preferences live here and
// nowhere else.
const STORAGE_KEYS = {
  recent: "cityscope.recent",
  favorites: "cityscope.favorites",
  theme: "cityscope.theme",
  unit: "cityscope.unit",
  unitManual: "cityscope.unit.manual",
};

const MAX_RECENT = 8;
const MAX_FAVORITES = 10;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — feature just won't persist */
  }
}

function sameCity(a, b) {
  return a.name === b.name && a.country === b.country;
}

const Store = {
  getRecent() {
    return readJson(STORAGE_KEYS.recent, []);
  },
  addRecent(location) {
    const list = Store.getRecent().filter((c) => !sameCity(c, location));
    list.unshift(location);
    writeJson(STORAGE_KEYS.recent, list.slice(0, MAX_RECENT));
  },
  clearRecent() {
    writeJson(STORAGE_KEYS.recent, []);
  },

  getFavorites() {
    return readJson(STORAGE_KEYS.favorites, []);
  },
  isFavorite(location) {
    return Store.getFavorites().some((c) => sameCity(c, location));
  },
  toggleFavorite(location) {
    const list = Store.getFavorites();
    const idx = list.findIndex((c) => sameCity(c, location));
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift(location);
    }
    writeJson(STORAGE_KEYS.favorites, list.slice(0, MAX_FAVORITES));
    return idx < 0;
  },

  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.theme) || "system";
  },
  setTheme(mode) {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, mode);
    } catch { /* ignore */ }
  },

  getUnit() {
    return localStorage.getItem(STORAGE_KEYS.unit) || "C";
  },
  // A manual toggle sticks for the rest of the session (the user has
  // stated a preference); until then, each new city defaults to whichever
  // unit its own region actually uses (see unitForCountry in home.js).
  setUnit(unit) {
    try {
      localStorage.setItem(STORAGE_KEYS.unit, unit);
      localStorage.setItem(STORAGE_KEYS.unitManual, "1");
    } catch { /* ignore */ }
  },
  setUnitAuto(unit) {
    if (Store.hasManualUnit()) return;
    try {
      localStorage.setItem(STORAGE_KEYS.unit, unit);
    } catch { /* ignore */ }
  },
  hasManualUnit() {
    return localStorage.getItem(STORAGE_KEYS.unitManual) === "1";
  },
};
