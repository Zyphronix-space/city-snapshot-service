// Icon set keyed by the same 8 category names the backend's weatherCode
// mapping already returns on every `condition.icon` field (clear,
// partly-cloudy, cloudy, fog, rain, thunderstorm, snow, unknown) — the
// frontend never re-derives a category from text, it just looks this up.
const WEATHER_ICONS = {
  clear: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <circle cx="50" cy="50" r="20"/>
    <g>
      <line x1="50" y1="8" x2="50" y2="20"/>
      <line x1="50" y1="80" x2="50" y2="92"/>
      <line x1="8" y1="50" x2="20" y2="50"/>
      <line x1="80" y1="50" x2="92" y2="50"/>
      <line x1="19.3" y1="19.3" x2="27.6" y2="27.6"/>
      <line x1="72.4" y1="72.4" x2="80.7" y2="80.7"/>
      <line x1="19.3" y1="80.7" x2="27.6" y2="72.4"/>
      <line x1="72.4" y1="27.6" x2="80.7" y2="19.3"/>
    </g>
  </svg>`,
  "partly-cloudy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="38" cy="38" r="15"/>
    <line x1="38" y1="10" x2="38" y2="17"/>
    <line x1="14" y1="38" x2="21" y2="38"/>
    <line x1="17.6" y1="17.6" x2="22.6" y2="22.6"/>
    <path d="M32 62h34a14 14 0 0 0 1-27.9A19 19 0 0 0 31 46.4 12 12 0 0 0 32 62Z"/>
  </svg>`,
  cloudy: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 68h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 44 14 14 0 0 0 27 68Z"/>
  </svg>`,
  fog: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 46h36a14 14 0 0 0 1-27.9A19 19 0 0 0 31 30.4 12 12 0 0 0 32 46Z"/>
    <line x1="18" y1="62" x2="82" y2="62"/>
    <line x1="24" y1="74" x2="76" y2="74"/>
    <line x1="30" y1="86" x2="70" y2="86"/>
  </svg>`,
  rain: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 54h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 30 14 14 0 0 0 27 54Z"/>
    <path d="M34 65 Q30 74 30 79 A3 3 0 1 0 36 79 Q36 74 34 65Z" fill="currentColor" stroke="none"/>
    <path d="M50 68 Q46 77 46 82 A3 3 0 1 0 52 82 Q52 77 50 68Z" fill="currentColor" stroke="none"/>
    <path d="M66 65 Q62 74 62 79 A3 3 0 1 0 68 79 Q68 74 66 65Z" fill="currentColor" stroke="none"/>
  </svg>`,
  thunderstorm: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 50h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 26 14 14 0 0 0 27 50Z"/>
    <path d="M54 62 42 80h12L48 92l16-22H52Z" fill="currentColor" stroke="none"/>
  </svg>`,
  snow: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 50h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 26 14 14 0 0 0 27 50Z"/>
    <g stroke-width="3.4">
      <line x1="34" y1="66" x2="34" y2="86"/>
      <line x1="26" y1="76" x2="42" y2="76"/>
      <line x1="66" y1="66" x2="66" y2="86"/>
      <line x1="58" y1="76" x2="74" y2="76"/>
      <line x1="50" y1="70" x2="50" y2="90"/>
      <line x1="43" y1="80" x2="57" y2="80"/>
    </g>
  </svg>`,
  unknown: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 68h44a16 16 0 0 0 1.2-32A22 22 0 0 0 30 44 14 14 0 0 0 27 68Z"/>
  </svg>`,
};

function weatherIconSvg(category) {
  return WEATHER_ICONS[category] || WEATHER_ICONS.unknown;
}

const THEME_ICONS = {
  light: `<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/>`,
  dark: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>`,
  system: `<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>`,
};

// Falling-streak rain effect drawn on the atmosphere canvas — per-particle
// state (position/speed/fade) needs a canvas; a CSS background can only
// repeat a static pattern, which reads as straight diagonal lines instead
// of rain.
const RainFX = (() => {
  let canvas, ctx;
  let streaks = [];
  let beads = [];
  let running = false;
  let rafId = null;
  let clock = 0;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function makeStreak() {
    return {
      x: Math.random() * canvas.clientWidth,
      y: Math.random() * -canvas.clientHeight,
      len: 16 + Math.random() * 22,
      speed: 2.6 + Math.random() * 3.6,
      drift: 0.5 + Math.random() * 0.5,
      width: 1 + Math.random() * 1.3,
      alpha: 0.18 + Math.random() * 0.32,
    };
  }

  function makeBead() {
    return {
      x: Math.random() * canvas.clientWidth,
      y: Math.random() * canvas.clientHeight,
      r: 2 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    const area = canvas.clientWidth * canvas.clientHeight;
    streaks = Array.from({ length: Math.min(Math.round(area / 8500), 160) }, makeStreak);
    beads = Array.from({ length: Math.min(Math.round(area / 22000), 55) }, makeBead);
  }

  function frame() {
    clock += 0.016;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    for (const b of beads) {
      const a = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(clock * 0.6 + b.phase));
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(255,255,255,${a + 0.25})`);
      g.addColorStop(0.6, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const d of streaks) {
      const x2 = d.x + d.drift * d.len * 0.35;
      const y2 = d.y + d.len;
      const g = ctx.createLinearGradient(d.x, d.y, x2, y2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.75, `rgba(255,255,255,${d.alpha})`);
      g.addColorStop(1, `rgba(255,255,255,${d.alpha * 1.5})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = d.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      d.y += d.speed;
      d.x += d.drift * 0.35;
      if (d.y > canvas.clientHeight) {
        d.y = -d.len - Math.random() * 60;
        d.x = Math.random() * canvas.clientWidth;
      }
    }

    if (running) rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || prefersReducedMotion()) return;
    running = true;
    resize();
    seed();
    frame();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  return {
    init() {
      canvas = document.getElementById("rain-canvas");
      if (!canvas) return;
      ctx = canvas.getContext("2d");
      window.addEventListener("resize", () => {
        if (running) { resize(); seed(); }
      });
    },
    setActive(active) {
      if (!canvas) return;
      if (active) start();
      else stop();
    },
  };
})();
