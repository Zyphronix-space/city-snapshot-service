// CityScope — "Use my location". This is a consent step in front of the
// browser's native geolocation prompt, then a normal Home.loadCity() call
// down the same lat/lon-only path the backend already uses for a
// disambiguated search result (resolveCityOrExplicit() in service.bal skips
// geocoding whenever lat/lon are both present). No new endpoint, no
// reverse geocoding, no third-party geocoding provider, and the
// coordinates are never written to storage — see privacy.html.
const LocationFeature = (() => {
  const CONSENT_TEXT = "CityScope can use your device location to show weather and air-quality information for where you are. Your location is used for this request and isn't saved in your CityScope history.";
  const BLOCKED_TEXT = "Location access is blocked for CityScope. Re-enable location access in your browser's site settings.";

  let triggerEl = null;

  function els() {
    return {
      overlay: document.getElementById("location-modal-overlay"),
      modal: document.getElementById("location-modal"),
      desc: document.getElementById("location-modal-desc"),
      allowBtn: document.getElementById("location-allow-btn"),
      notNowBtn: document.getElementById("location-not-now-btn"),
      closeBtn: document.getElementById("location-modal-close"),
    };
  }

  function getFocusable(container) {
    return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null && !el.disabled);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const { modal } = els();
    const focusable = getFocusable(modal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function setBlockedState(isBlocked) {
    const { desc, allowBtn, notNowBtn } = els();
    desc.textContent = isBlocked ? BLOCKED_TEXT : CONSENT_TEXT;
    allowBtn.hidden = isBlocked;
    notNowBtn.textContent = isBlocked ? "Close" : "Not now";
  }

  function showModal() {
    const { overlay, modal } = els();
    overlay.hidden = false;
    document.addEventListener("keydown", onKeydown);
    const focusable = getFocusable(modal);
    (focusable[0] || modal).focus();
  }

  function close() {
    const { overlay } = els();
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    if (triggerEl) triggerEl.focus();
  }

  function open(trigger) {
    triggerEl = trigger;

    if (!("geolocation" in navigator)) {
      Main.showToast("Location isn't supported by this browser. Search for a city instead.", true);
      return;
    }

    // Checking current permission state first means we never show an
    // "Allow" button that the browser would just silently refuse to act
    // on — and we never re-prompt beyond what the user asks for by
    // clicking this button themselves.
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" })
        .then((status) => {
          setBlockedState(status.state === "denied");
          showModal();
        })
        .catch(() => {
          setBlockedState(false);
          showModal();
        });
    } else {
      setBlockedState(false);
      showModal();
    }
  }

  function requestLocation() {
    close();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Same shape locationParams() already sends for a disambiguated
        // search result — country/region/countryCode are left unset
        // rather than guessed, since we don't reverse geocode.
        Home.loadCity(MY_LOCATION_LABEL, { latitude, longitude, timezone });
        Main.switchView("home");
      },
      (error) => {
        const messages = {
          1: "Location access was denied. You can search for a city instead.",
          2: "Your location couldn't be determined. Please try again or search for a city.",
          3: "Location request timed out. Please try again or search for a city.",
        };
        Main.showToast(messages[error.code] || "Couldn't get your location. Please try again or search for a city.", true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  }

  function init() {
    const { overlay, allowBtn, notNowBtn, closeBtn } = els();
    document.querySelectorAll("[data-open-location]").forEach((btn) => {
      btn.addEventListener("click", () => open(btn));
    });
    allowBtn.addEventListener("click", requestLocation);
    notNowBtn.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  return { init };
})();
