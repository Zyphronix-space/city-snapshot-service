// CityScope — app shell: view routing, theme, units, toasts, atmosphere.
const Main = (() => {
  function getSystemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function resolveTheme(mode) {
    return mode === "system" ? (getSystemPrefersDark() ? "dark" : "light") : mode;
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
    if (isError) toast.style.color = "var(--danger)";
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

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
    switchView("home");
    Home.loadCity("Colombo");
  }

  return { init, switchView, showToast, setWeatherAtmosphere, syncUnitButton: () => applyUnit(Store.getUnit()) };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Main.init);
} else {
  Main.init();
}
