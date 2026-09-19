// CityScope — 3D globe for the Map view, replacing the flat tile map with a
// restrained, photo-textured, Apple-Weather-style rotating Earth. Renders
// with js/vendor/earth-renderer.js, a small hand-written WebGL module (a UV
// sphere + one NASA Blue Marble texture + one directional light) — chosen
// over a full three.js/globe.gl stack because that's genuinely all this
// view needs, with none of the scene-graph overhead a real 3D engine would
// carry for what is, here, a decorative-but-useful navigation surface.
//
// The renderer only draws the sphere itself; markers, drag, zoom and "fly
// to a city" are all implemented in this file. Markers are real DOM
// buttons (not drawn on the canvas) positioned each frame by projecting
// lat/lon through the exact same rotation math the renderer's vertex
// shader uses — that keeps them keyboard/AT-reachable and lets each one
// carry a real city label.
//
// This module is an ES module (so it can `import` the vendored renderer)
// but exposes itself as `window.GlobeView` so the rest of the app's plain
// classic scripts (map.js) can call it like any other CityScope module.
import createGlobe from "./vendor/earth-renderer.js";

const GlobeView = (() => {
  // The renderer draws the sphere at radius 0.8*scale inside a canvas that
  // spans -1..1 (NDC). Past scale ~1.25 the sphere's edge exceeds the
  // canvas frame and gets hard-clipped by the canvas boundary itself — not
  // a CSS overflow issue, so the fix is keeping scale inside that frame
  // with a safety margin, not loosening any CSS.
  const MIN_SCALE = 0.8;
  const MAX_SCALE = 1.2;
  const FOCUS_EASE = 0.08;
  const FOCUS_SETTLE_MS = 650;

  let canvas = null;
  let wrap = null;
  let stage = null;
  let markersLayer = null;
  let hintEl = null;
  let zoomInBtn = null;
  let zoomOutBtn = null;

  let globe = null;
  let rafId = null;
  let resizeObserver = null;
  let onSelectCity = null;
  let ready = false;

  let phi = -0.6;
  let theta = 0.3;
  let scale = 1;
  let targetPhi = null;
  let targetTheta = null;
  let needsRedraw = true; // static once settled — no ambient auto-rotate, so redraw only on actual change
  let dragging = false;
  let dragMoved = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let dragPhiStart = 0;
  let dragThetaStart = 0;

  let markers = []; // [{ id, name, country, latitude, longitude, selected }]
  let markerEls = new Map(); // id -> button element

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function isSupported() {
    try {
      const probe = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (probe.getContext("webgl2") || probe.getContext("webgl"))
      );
    } catch {
      return false;
    }
  }

  // -- Lat/lon <-> screen projection, matching the renderer's own vertex
  // shader exactly (same rotation order, same 0.8-radius sphere) so DOM
  // markers trace the rendered globe precisely instead of drifting off it. --
  function toVector(latitude, longitude) {
    const latRad = (latitude * Math.PI) / 180;
    const lonRad = (longitude * Math.PI) / 180 - Math.PI;
    const cosLat = Math.cos(latRad);
    return [-cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)];
  }

  function project([x, y, z]) {
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const c = cosP * x + sinP * z;
    const s = sinP * sinT * x + cosT * y - cosP * sinT * z;
    const depth = -sinP * cosT * x + sinT * y + cosP * cosT * z;
    const px = (c * scale + 1) / 2;
    const py = (-s * scale + 1) / 2;
    // An elevated marker (r=0.85) near the horizon can project outside the
    // canvas box once scale pushes it past the frame — without this it
    // doesn't fade out, it gets hard-clipped by .globe-frame's
    // overflow:hidden mid-zoom, which reads as a city randomly vanishing.
    const inFrame = px >= -0.02 && px <= 1.02 && py >= -0.02 && py <= 1.02;
    const visible = (depth >= 0 || c * c + s * s >= 0.64) && inFrame;
    return { x: px, y: py, visible };
  }

  function markerScreenPos(latitude, longitude) {
    const v = toVector(latitude, longitude);
    const r = 0.85; // sphere radius (0.8) plus a slight elevation so markers sit above the surface
    return project([v[0] * r, v[1] * r, v[2] * r]);
  }

  // Solve the (phi, theta) pair that rotates a given lat/lon to face the
  // viewer dead-on. There are two rotation branches that both zero out the
  // on-screen x/y offset (the point and its antipode); of those we keep the
  // one with positive depth, i.e. the one that actually faces the camera.
  function rotationToFace(latitude, longitude) {
    const [x, y, z] = toVector(latitude, longitude);
    const phi0 = Math.atan2(-x, z);
    let best = null;
    for (const p of [phi0, phi0 + Math.PI]) {
      const cosP = Math.cos(p);
      const sinP = Math.sin(p);
      const k = sinP * x - cosP * z;
      const t0 = Math.abs(k) < 1e-6 && Math.abs(y) < 1e-6 ? 0 : Math.atan2(-y, k);
      for (const t of [t0, t0 + Math.PI]) {
        const cosT = Math.cos(t);
        const sinT = Math.sin(t);
        const depth = -sinP * cosT * x + sinT * y + cosP * cosT * z;
        if (!best || depth > best.depth) best = { phi: p, theta: t, depth };
      }
    }
    return best;
  }

  function sizeCanvas() {
    if (!canvas || !wrap) return 0;
    const size = Math.round(wrap.clientWidth);
    return size;
  }

  function ensureGlobe() {
    if (globe || !canvas) return;
    const size = sizeCanvas() || 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    try {
      globe = createGlobe(canvas, { width: size, height: size, phi, theta, scale, devicePixelRatio: dpr });
      ready = true;
    } catch {
      ready = false;
    }
  }

  // Zoom-based declutter for the world-capitals layer, the way a real map
  // only shows place labels once you zoom in close enough to them, rather
  // than covering the globe in 200+ names at once: at the default view
  // (and anything zoomed further out), no capitals show at all; zooming
  // in past that starts revealing the largest ones first, down to every
  // capital at max zoom. Personal markers (alwaysShow) skip this
  // entirely — your own cities never disappear just because you zoomed
  // out.
  const REVEAL_START_SCALE = 1; // matches the globe's default initial `scale`
  const MIN_ZOOM_POPULATION = 8_000_000;
  function populationThreshold() {
    if (scale <= REVEAL_START_SCALE) return Infinity;
    const t = clamp((scale - REVEAL_START_SCALE) / (MAX_SCALE - REVEAL_START_SCALE), 0, 1);
    return MIN_ZOOM_POPULATION * (1 - t) ** 2;
  }

  function hideMarkerEl(m, el) {
    if (m._lastVisible !== false) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      m._lastVisible = false;
    }
  }

  function showMarkerElAt(m, el, x, y) {
    if (m._lastVisible === false) {
      el.style.opacity = "";
      el.style.pointerEvents = "";
      m._lastVisible = true;
    }
    if (m._lastX !== x || m._lastY !== y) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      m._lastX = x;
      m._lastY = y;
    }
  }

  // Text labels are much wider than the old dots were, so simply showing
  // every population/zoom-eligible city at once produces an unreadable
  // pile of overlapping names (dots at 9px don't collide anywhere near as
  // often as ~70px-wide text does). Real map/globe UIs solve this with
  // greedy label placement: rank candidates by priority, place one only
  // if it doesn't land within MIN_LABEL_DIST (in real CSS pixels, so it
  // scales consistently with the rendered globe) of an already-placed
  // label, skip it otherwise. Personal markers always outrank capitals,
  // and larger capitals outrank smaller ones, so the most useful names
  // win the available space first.
  const MIN_LABEL_DIST = 40;

  function positionMarkers() {
    if (!markersLayer) return;
    const size = (wrap && wrap.clientWidth) || 1;
    const popFloor = populationThreshold();
    const candidates = [];
    for (const m of markers) {
      const el = markerEls.get(m.id);
      if (!el) continue;
      const belowZoomTier = !m.alwaysShow && (m.population || 0) < popFloor;
      const pos = belowZoomTier ? { visible: false } : markerScreenPos(m.latitude, m.longitude);
      if (!pos.visible) {
        hideMarkerEl(m, el);
        continue;
      }
      candidates.push({ m, el, xPct: pos.x, yPct: pos.y, x: pos.x * size, y: pos.y * size });
    }
    candidates.sort((a, b) => {
      if (a.m.alwaysShow !== b.m.alwaysShow) return a.m.alwaysShow ? -1 : 1;
      return (b.m.population || 0) - (a.m.population || 0);
    });
    const placed = [];
    for (const c of candidates) {
      const collides = placed.some((p) => Math.abs(p.x - c.x) < MIN_LABEL_DIST && Math.abs(p.y - c.y) < MIN_LABEL_DIST);
      if (collides) {
        hideMarkerEl(c.m, c.el);
        continue;
      }
      placed.push(c);
      const x = Math.round(c.xPct * 1000) / 10; // 0.1% precision
      const y = Math.round(c.yPct * 1000) / 10;
      showMarkerElAt(c.m, c.el, x, y);
    }
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (!ready) return;

    const easing = targetPhi !== null && !dragging;
    if (easing) {
      const dPhi = normalizeAngle(targetPhi - phi);
      const dTheta = targetTheta - theta;
      phi += dPhi * FOCUS_EASE;
      theta += dTheta * FOCUS_EASE;
      if (Math.abs(dPhi) < 0.003 && Math.abs(dTheta) < 0.003) {
        phi = targetPhi;
        theta = targetTheta;
        targetPhi = null;
        targetTheta = null;
      }
    }

    // The globe sits still until you touch it — no ambient auto-rotate —
    // so once it's settled there's nothing to redraw; skip the WebGL
    // draw call and the marker-layout pass rather than repainting an
    // unchanged frame 60 times a second for no reason.
    if (!dragging && !easing && !needsRedraw) return;
    needsRedraw = false;

    globe.update({ phi, theta, scale });
    positionMarkers();
  }

  // Listens on the whole stage (the full dark card), not just the small
  // canvas — a marker button sitting on top of the canvas would otherwise
  // swallow a pointerdown before it ever reached the globe, and so would
  // any drag starting in the card's padding outside the sphere's tight
  // bounding box. A drag beginning on a marker still resolves as a real
  // click afterwards, via the `dragMoved` check in buildMarkerEl().
  function onPointerDown(e) {
    if (!ready) return;
    dragging = true;
    dragMoved = false;
    targetPhi = null;
    targetTheta = null;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    dragPhiStart = phi;
    dragThetaStart = theta;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* e.g. pointerdown originated on a child that can't be captured from here */
    }
    stage.classList.add("is-grabbing");
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    // A real tap/click always has a little wobble between press and
    // release (touch imprecision, mouse jitter, or just how some browsers
    // synthesize the pointer sequence) — 3px was tight enough that
    // ordinary clicks on a city label were getting misread as a drag and
    // silently swallowed (see buildMarkerEl's dragMoved check).
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragMoved = true;
    phi = dragPhiStart + dx / 180;
    theta = clamp(dragThetaStart - dy / 220, -1.1, 1.1);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    // dragging=true already forces a redraw every frame while it's held,
    // but that stops the instant it flips back to false here — force one
    // more so the very last pointermove's position is guaranteed to reach
    // the screen even if no animation frame landed between it and this
    // pointerup (drags stay live-in-sync via `dragging` itself; this is
    // just the final settle).
    needsRedraw = true;
    stage.classList.remove("is-grabbing");
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    // stage.setPointerCapture() above retargets every pointer event for
    // this gesture to `stage`, including — critically — the mousedown the
    // browser derives pointerdown from. mouseup fires after capture is
    // released here, so it targets the real element again; the resulting
    // mousedown/mouseup target mismatch means the browser's synthesized
    // "click" can land on `stage` instead of the marker button that was
    // actually tapped, and silently never reach its click listener. Hit-
    // test the release point ourselves instead of trusting that click.
    if (!dragMoved) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const markerBtn = el && el.closest(".globe-marker");
      if (markerBtn) selectMarkerEl(markerBtn);
    }
  }

  function onWheel(e) {
    if (!ready) return;
    e.preventDefault();
    scale = clamp(scale - e.deltaY * 0.0004, MIN_SCALE, MAX_SCALE);
    needsRedraw = true;
  }

  function zoomBy(delta) {
    scale = clamp(scale + delta, MIN_SCALE, MAX_SCALE);
    needsRedraw = true;
  }

  function markerId(loc) {
    return `${loc.name}|${loc.country || ""}`;
  }

  // Guards against a marker being opened twice when a click both gets
  // hit-tested manually in onPointerUp AND still reaches the button's own
  // "click" listener natively (browser/timing dependent — see onPointerUp).
  let lastPointerSelectAt = 0;

  function selectMarkerEl(markerBtn) {
    const m = markers.find((mk) => mk.id === markerBtn.dataset.markerId);
    if (!m) return;
    lastPointerSelectAt = Date.now();
    onSelectCity && onSelectCity(m);
  }

  function buildMarkerEl(m) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "globe-marker" + (m.selected ? " is-selected" : "");
    btn.style.left = "-100%"; // parked off-frame until the first position pass
    btn.style.top = "-100%";
    btn.dataset.markerId = m.id;
    const metaLabel = m.country ? `${m.name}, ${m.country}` : m.name;
    btn.setAttribute("aria-label", `Open ${metaLabel}`);
    btn.title = metaLabel;
    const label = document.createElement("span");
    label.className = "globe-marker-label";
    label.textContent = m.name; // just the city name on the globe itself — full "City, Country" is in the title/aria-label
    btn.append(label);
    // Handles keyboard activation (Enter/Space on a focused marker), which
    // fires a genuine "click" with no pointer capture involved. Pointer/
    // mouse/touch clicks are handled in onPointerUp instead — see there
    // for why this listener alone isn't reliable for those.
    btn.addEventListener("click", () => {
      if (dragMoved) return;
      if (Date.now() - lastPointerSelectAt < 500) return; // already handled via onPointerUp
      onSelectCity && onSelectCity(m);
    });
    return btn;
  }

  // list: real location objects only (recent/favorite/currently-loaded
  // cities from Store/Home) — never synthetic placeholder markers.
  function setMarkers(list) {
    markers = list.filter((m) => Number.isFinite(m.latitude) && Number.isFinite(m.longitude));
    markersLayer.innerHTML = "";
    markerEls = new Map();
    markers.forEach((m) => {
      m.id = markerId(m);
      const el = buildMarkerEl(m);
      markerEls.set(m.id, el);
      markersLayer.appendChild(el);
    });
    positionMarkers();
  }

  function focusOn(latitude, longitude) {
    if (!ready || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Promise.resolve();
    }
    // rotationToFace's theta pitches the WHOLE sphere (poles included)
    // around the target's own local east-west axis, by exactly its
    // latitude, to put that single point dead center. For a high-latitude
    // city (London, Moscow, ...) that swings a pole into view and rolls
    // every other meridian with it — the rest of the map ends up looking
    // rotated/upside-down-ish relative to what "north stays up" leads
    // people to expect, even though the target itself is technically
    // centered. Yaw (phi) doesn't have this problem — spinning around the
    // vertical axis never tilts the poles — so we take the full yaw but
    // only a damped, tightly-capped slice of the pitch: enough to nudge
    // toward the target's hemisphere without ever tipping into a
    // pole-on view. The target ends up close to center horizontally and
    // approximately placed vertically, not pixel-exact, in exchange for
    // the map always staying recognisable.
    const rot = rotationToFace(latitude, longitude);
    targetPhi = rot.phi;
    targetTheta = clamp(rot.theta * 0.45, -0.5, 0.5);
    return new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));
  }

  function handleResize() {
    if (!globe || !canvas) return;
    const size = sizeCanvas();
    if (size > 0) globe.update({ width: size, height: size });
    positionMarkers();
  }

  function init({ canvasEl, wrapEl, stageEl, markersEl, hint, zoomIn, zoomOut, onSelect }) {
    canvas = canvasEl;
    wrap = wrapEl;
    stage = stageEl;
    markersLayer = markersEl;
    hintEl = hint;
    zoomInBtn = zoomIn;
    zoomOutBtn = zoomOut;
    onSelectCity = onSelect;

    // The whole card is the drag/zoom surface (see onPointerDown for why),
    // not just the canvas — but exclude the zoom buttons themselves so
    // clicking them doesn't also start a drag.
    stage.addEventListener("pointerdown", (e) => {
      if (e.target === zoomInBtn || e.target === zoomOutBtn) return;
      onPointerDown(e);
    });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    zoomInBtn.addEventListener("click", () => zoomBy(0.08));
    zoomOutBtn.addEventListener("click", () => zoomBy(-0.08));

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(wrap);
    } else {
      window.addEventListener("resize", handleResize);
    }
  }

  function onShown() {
    if (!canvas) return;
    if (!globe) ensureGlobe();
    if (rafId === null) frame();
    // A container that was `display:none` reports a 0-width client rect;
    // now that the view is visible, size against the real layout.
    requestAnimationFrame(handleResize);
  }

  function onHidden() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { isSupported, init, onShown, onHidden, setMarkers, focusOn };
})();

window.GlobeView = GlobeView;
