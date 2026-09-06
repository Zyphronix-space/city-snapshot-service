// CityScope — GlassChart: minimal canvas line/bar charts, no library.
// Every value plotted comes straight from the API response passed in by
// the caller; nothing here invents or smooths data.
const GlassChart = (() => {
  const registry = new Map();

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function prepareCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssHeight = canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) : canvas.clientHeight || 120;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = "100%";
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: cssWidth, height: cssHeight };
  }

  function line(canvas, { labels, values, formatValue = (v) => `${Math.round(v)}` }) {
    registry.set(canvas.id, () => line(canvas, { labels, values, formatValue }));
    // A canvas whose view is currently hidden ([hidden] ancestor) has
    // clientWidth 0 — drawing now would bake a wrong, tiny bitmap in that
    // then looks stretched/blurry once its view becomes visible again.
    // Skip silently; switchView() redraws once the view is shown.
    if (!values.length || canvas.offsetParent === null) return;
    const { ctx, width, height } = prepareCanvas(canvas);
    const padTop = 22, padBottom = 22, padX = 8;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;
    const stepX = values.length > 1 ? plotW / (values.length - 1) : 0;
    const points = values.map((v, i) => ({
      x: padX + i * stepX,
      y: padTop + plotH - ((v - min) / range) * plotH,
    }));

    ctx.clearRect(0, 0, width, height);

    const primary = themeColor("--primary", "#3d7bf0");
    const muted = themeColor("--muted", "rgba(100,110,120,0.6)");

    // filled area under the line
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padBottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - padBottom);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    grad.addColorStop(0, `${primary}33`);
    grad.addColorStop(1, `${primary}00`);
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // points
    ctx.fillStyle = primary;
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // min/max labels, kept on the right so they never collide with the
    // x-axis time labels (which read left-to-right starting at padX)
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(formatValue(max), width - padX, padTop - 6);

    // sparse x labels. The first/last labels sit exactly at the plot's
    // left/right edge (points[0].x === padX, points[last].x === width-padX)
    // — center-aligning them there would overflow half the text past the
    // canvas boundary and clip it, so anchor those two inward instead.
    const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
    ctx.textBaseline = "top";
    labels.forEach((label, i) => {
      if (i % labelEvery !== 0 && i !== labels.length - 1) return;
      ctx.textAlign = i === 0 ? "left" : i === labels.length - 1 ? "right" : "center";
      ctx.fillText(label, points[i].x, height - padBottom + 6);
    });
  }

  function bars(canvas, { labels, values, max = 100, formatValue = (v) => `${Math.round(v)}%` }) {
    registry.set(canvas.id, () => bars(canvas, { labels, values, max, formatValue }));
    if (!values.length || canvas.offsetParent === null) return;
    const { ctx, width, height } = prepareCanvas(canvas);
    // Extra top padding (vs. the line chart) so the tallest bar always
    // keeps clear headroom below the card title instead of crowding it.
    const padTop = 30, padBottom = 20, padX = 6, gap = 4;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;
    const barW = plotW / values.length - gap;

    ctx.clearRect(0, 0, width, height);
    const primary = themeColor("--primary", "#3d7bf0");
    const muted = themeColor("--muted", "rgba(100,110,120,0.6)");

    ctx.font = "10px system-ui, sans-serif";
    values.forEach((v, i) => {
      const x = padX + i * (barW + gap);
      const barH = Math.max(2, (v / max) * plotH);
      const y = padTop + plotH - barH;
      ctx.fillStyle = primary;
      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y, x + barW, y + r, r);
      ctx.lineTo(x + barW, y + barH);
      ctx.closePath();
      ctx.fill();

      const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
      if (i % labelEvery === 0 || i === labels.length - 1) {
        ctx.fillStyle = muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(labels[i], x + barW / 2, height - padBottom + 5);
      }
    });
  }

  window.addEventListener("resize", () => {
    for (const redraw of registry.values()) redraw();
  });

  return { line, bars, redrawAll: () => { for (const redraw of registry.values()) redraw(); } };
})();
