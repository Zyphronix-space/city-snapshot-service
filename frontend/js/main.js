// CityScope — app shell: view routing, theme, units, toasts, atmosphere.
const Main = (() => {
  function getSystemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  // "system" mode normally means "OS preference" — here it instead means
  // "follow the searched city's own day/night", set from that city's
  // sunrise/sunset by Home.updateDaypart(). Falls back to OS preference
  // only before the first city has loaded.
  let cityDaypart = null; // "day" | "night" | null
  function setDaypart(isDay) {
    const next = isDay ? "day" : "night";
    if (next === cityDaypart) return;
    cityDaypart = next;
    if (Store.getTheme() === "system") applyTheme("system");
  }
  function resolveTheme(mode) {
    if (mode !== "system") return mode;
    if (cityDaypart) return cityDaypart === "night" ? "dark" : "light";
    return getSystemPrefersDark() ? "dark" : "light";
  }
  function applyTheme(mode) {
    // tokens.css keys its dark-mode overrides off :root (the <html> element),
    // while base.css's weather atmosphere is keyed off <body> — both need
    // the attribute for the theme to actually apply everywhere.
    const resolved = resolveTheme(mode);
    document.documentElement.setAttribute("data-theme", resolved);
    document.body.setAttribute("data-theme", resolved);
    document.getElementById("theme-icon").innerHTML = THEME_ICONS[mode];
    document.getElementById("theme-toggle").setAttribute("aria-label", `Theme: ${mode}. Tap to change.`);
    GlassChart.redrawAll();
  }
  function initTheme() {
    applyTheme(Store.getTheme());
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (Store.getTheme() === "system") applyTheme("system");
      });
    }
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const order = ["light", "dark", "system"];
      const next = order[(order.indexOf(Store.getTheme()) + 1) % order.length];
      Store.setTheme(next);
      applyTheme(next);
    });
  }

  function applyUnit(unit) {
    document.getElementById("unit-toggle").textContent = `°${unit}`;
  }
  function initUnit() {
    applyUnit(Store.getUnit());
    document.getElementById("unit-toggle").addEventListener("click", () => {
      const next = Store.getUnit() === "C" ? "F" : "C";
      Store.setUnit(next);
      applyUnit(next);
      Home.refreshUnits();
      Compare.refreshUnits();
    });
  }

  function setWeatherAtmosphere(icon) {
    document.body.setAttribute("data-weather", icon);
    RainFX.setActive(icon === "rain" || icon === "thunderstorm");
  }

  function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    // Error toasts get role="alert" so assistive tech announces them
    // immediately, instead of relying on the container's aria-live="polite"
    // (which is appropriate for routine status toasts, but too easy to miss
    // for an error).
    toast.setAttribute("role", isError ? "alert" : "status");
    if (isError) toast.style.color = "var(--danger)";
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  let activeView = null;
  function switchView(view) {
    document.querySelectorAll(".view").forEach((el) => {
      el.hidden = el.dataset.view !== view;
    });
    document.querySelectorAll("[data-view-link]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.viewLink === view);
    });
    document.getElementById("nav-mobile").hidden = true;
    document.getElementById("nav-burger").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    // The globe's render loop only costs CPU/GPU while its view is actually
    // visible — pause it the instant Map is navigated away from.
    if (activeView === "map" && view !== "map") MapView.onHidden();
    activeView = view;
    if (view === "map") MapView.onShown();
    // Charts on the view being shown may have skipped drawing while hidden
    // (a resize while off-screen would otherwise bake in a wrong-size bitmap).
    GlassChart.redrawAll();
  }

  function initNav() {
    document.querySelectorAll("[data-view-link]").forEach((el) => {
      el.addEventListener("click", () => switchView(el.dataset.viewLink));
    });
    const burger = document.getElementById("nav-burger");
    const mobileNav = document.getElementById("nav-mobile");
    burger.addEventListener("click", () => {
      const open = mobileNav.hidden;
      mobileNav.hidden = !open;
      mobileNav.dataset.open = String(open);
      burger.setAttribute("aria-expanded", String(open));
    });
  }

  function init() {
    RainFX.init();
    initTheme();
    initUnit();
    initNav();
    Home.init();
    MapView.init();
    Compare.init();
    LocationFeature.init();
    switchView("home");
    // No city is auto-loaded: the hero (search + "Use my location" + any
    // recent/favorite/popular chips) is the deliberate first-run state, not
    // a placeholder that flashes before Colombo loads.
    const footerYear = document.getElementById("footer-year");
    if (footerYear) footerYear.textContent = new Date().getFullYear();
  }

  return { init, switchView, showToast, setWeatherAtmosphere, setDaypart, syncUnitButton: () => applyUnit(Store.getUnit()) };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Main.init);
} else {
  Main.init();
}
