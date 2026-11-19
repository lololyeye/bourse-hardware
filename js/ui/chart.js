// Charts: TradingView Lightweight Charts (pinned) with an SVG fallback. Sparklines are plain SVG.
import { fmtPrice, fmtDate, fmtNum } from "../core/format.js";
import { retailerName } from "../core/catalog.js";
import { esc, raw } from "./dom.js";

const LIB_URL = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
let libPromise = null;
export function loadChartLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  libPromise ||= new Promise(resolve => {
    const s = document.createElement("script");
    s.src = LIB_URL; s.async = true; s.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 8000);
    s.onload = () => { clearTimeout(t); resolve(window.LightweightCharts || null); };
    s.onerror = () => { clearTimeout(t); resolve(null); };
    document.head.append(s);
  });
  return libPromise;
}
export const chartLibStatus = () => (window.LightweightCharts ? "loaded" : libPromise ? "fallback" : "idle");

export const PERIODS = [
  { id: "1d", label: "24H", days: 1 }, { id: "7d", label: "7J", days: 7 }, { id: "30d", label: "30J", days: 30 },
  { id: "90d", label: "90J", days: 90 }, { id: "6m", label: "6M", days: 182 }, { id: "1y", label: "1A", days: 365 }, { id: "all", label: "Tout", days: null },
];
/** A period is offered only if it contains at least 2 observations (never pretend to have data). */
export function periodAvailability(obs, now = Date.now()) {
  return Object.fromEntries(PERIODS.map(p => [p.id, p.days == null ? obs.length > 0 : obs.filter(o => o.ts >= now - p.days * 864e5).length >= 2]));
}

const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
const motion = () => document.documentElement.dataset.motionEffective || "full";
const toTime = ts => Math.floor(ts / 1000) - new Date(ts).getTimezoneOffset() * 60; // local wall-clock on the UTC axis

/** One point per second (lowest price wins); keeps every observation for the tooltip. */
function toSeries(obs) {
  const byT = new Map();
  for (const o of obs) { const t = toTime(o.ts); const cur = byT.get(t); if (!cur) byT.set(t, { time: t, value: o.price, obs: [o] }); else { cur.obs.push(o); if (o.price < cur.value) cur.value = o.price; } }
  return [...byT.values()].sort((a, b) => a.time - b.time);
}
function palette() {
  return { accent: cssVar("--accent") || "#e8b04a", pos: cssVar("--pos") || "#3dbf7e", neg: cssVar("--neg") || "#e5575b", text: cssVar("--text-3") || "#8b919c", grid: cssVar("--grid") || "#1a1d22", line: cssVar("--line") || "#22262d", font: cssVar("--font-mono") || "monospace", fill: cssVar("--accent-fill") || "rgba(232,176,74,.18)" };
}
function tipHTML(pt, currency, isEst) {
  const o = pt.obs.reduce((a, b) => (b.price < a.price ? b : a));
  const extra = pt.obs.length > 1 ? `<div class="tip-sub">${pt.obs.length} relevés · meilleur prix</div>` : "";
  return `<div class="tip-date">${esc(fmtDate(o.ts, "fr", { time: true }))}</div><div class="tip-price">${esc(fmtPrice(o.price, currency, { decimals: o.price % 1 ? 2 : 0 }))}</div>
    <div class="tip-sub">${esc(o.retailer ? retailerName(o.retailer) : "Boutique non précisée")} · ${esc({ estimate: "Estimation", verified: "Vérifié", unverified: "Non vérifié" }[o.status] || o.status)}</div>${extra}`;
}

/**
 * Detailed price chart. Returns a controller: { setData(obs, refs), setPeriod(id), setRefsVisible(map), destroy(), engine }.
 * refs: { target, min, max, avg } (numbers or null)
 */
export async function priceChart(host, { obs, refs = {}, currency = "EUR", style = "area", markers = true, period = "all" }) {
  host.classList.add("chart-host");
  host.innerHTML = `<div class="chart-canvas"></div><div class="chart-tip" hidden></div>`;
  const canvas = host.querySelector(".chart-canvas"), tip = host.querySelector(".chart-tip");
  if (motion() !== "none") { host.classList.remove("chart-reveal"); void host.offsetWidth; host.classList.add("chart-reveal"); }
  const LW = await loadChartLib();
  return LW ? lwChart(LW, host, canvas, tip, { obs, refs, currency, style, markers, period }) : svgChart(host, canvas, tip, { obs, refs, currency, period });
}

function lwChart(LW, host, canvas, tip, o) {
  const c = palette();
  const chart = LW.createChart(canvas, {
    autoSize: true,
    layout: { background: { type: "solid", color: "transparent" }, textColor: c.text, fontFamily: c.font, fontSize: 11, attributionLogo: false },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.18, bottom: 0.12 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, lockVisibleTimeRangeOnResize: true },
    crosshair: { mode: LW.CrosshairMode.Magnet, vertLine: { color: c.line, labelBackgroundColor: c.line, style: LW.LineStyle.Solid }, horzLine: { color: c.line, labelBackgroundColor: c.line } },
    localization: { locale: "fr-FR", priceFormatter: p => fmtPrice(p, o.currency) },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  });
  const common = { priceLineVisible: false, lastValueVisible: true, pointMarkersVisible: o.markers, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: c.accent, priceFormat: { type: "custom", formatter: p => fmtPrice(p, o.currency), minMove: 0.01 } };
  const series = o.style === "line"
    ? chart.addLineSeries({ ...common, color: c.accent, lineWidth: 2 })
    : chart.addAreaSeries({ ...common, lineColor: c.accent, topColor: c.fill, bottomColor: "rgba(0,0,0,0)", lineWidth: 2 });
  let data = [], lines = {}, refsVisible = { target: true, min: true, max: true, avg: true }, refs = o.refs, period = o.period;
  const REF = { target: ["Cible", c.accent, LW.LineStyle.Dashed], min: ["Min", c.pos, LW.LineStyle.Dotted], max: ["Max", c.neg, LW.LineStyle.Dotted], avg: ["Moy.", c.text, LW.LineStyle.LargeDashed] };
  const drawRefs = () => {
    for (const l of Object.values(lines)) series.removePriceLine(l);
    lines = {};
    for (const [k, [title, color, ls]] of Object.entries(REF)) if (refsVisible[k] && Number.isFinite(refs[k])) lines[k] = series.createPriceLine({ price: refs[k], color, lineWidth: 1, lineStyle: ls, axisLabelVisible: true, title });
  };
  const applyPeriod = () => {
    const p = PERIODS.find(x => x.id === period);
    if (!data.length) return;
    if (!p || p.days == null || data.length < 2) { chart.timeScale().fitContent(); return; }
    const to = data[data.length - 1].time, from = to - p.days * 86400;
    try { chart.timeScale().setVisibleRange({ from: Math.max(from, data[0].time), to }); } catch { chart.timeScale().fitContent(); }
  };
  const ctl = {
    engine: "lightweight-charts",
    setData(obs, newRefs = refs, { animateAppend = true } = {}) {
      const next = toSeries(obs);
      const appended = animateAppend && data.length && next.length === data.length + 1 && next[next.length - 2]?.time === data[data.length - 1].time;
      if (appended) series.update(next[next.length - 1]); else series.setData(next);
      data = next; refs = newRefs; drawRefs();
      if (!appended) applyPeriod();
      if (appended && motion() !== "none") { host.classList.remove("chart-pulse"); void host.offsetWidth; host.classList.add("chart-pulse"); }
    },
    setPeriod(id) { period = id; applyPeriod(); },
    setRefsVisible(map) { Object.assign(refsVisible, map); drawRefs(); },
    destroy() { try { chart.remove(); } catch {} },
  };
  chart.subscribeCrosshairMove(param => {
    if (!param.time || !param.point || param.point.x < 0) { tip.hidden = true; return; }
    const pt = data.find(d => d.time === param.time);
    if (!pt) { tip.hidden = true; return; }
    tip.innerHTML = tipHTML(pt, o.currency);
    tip.hidden = false;
    const w = tip.offsetWidth, W = canvas.clientWidth;
    tip.style.transform = `translate(${Math.round(Math.min(Math.max(param.point.x - w / 2, 4), W - w - 60))}px, 8px)`;
  });
  ctl.setData(o.obs, o.refs, { animateAppend: false });
  return ctl;
}

/* ---------- SVG fallback (no zoom/pan, but tooltip, periods and reference lines) ---------- */
function svgChart(host, canvas, tip, o) {
  host.classList.add("chart-fallback");
  let data = [], refs = o.refs, period = o.period, refsVisible = { target: true, min: true, max: true, avg: true };
  const ro = new ResizeObserver(() => draw());
  const draw = () => {
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 300, pad = { l: 8, r: 64, t: 18, b: 22 };
    const p = PERIODS.find(x => x.id === period);
    const last = data[data.length - 1]?.time ?? 0;
    const vis = p?.days ? data.filter(d => d.time >= last - p.days * 86400) : data;
    if (!vis.length) { canvas.innerHTML = ""; return; }
    const vals = [...vis.map(d => d.value), ...Object.entries(refs).filter(([k, v]) => refsVisible[k] && Number.isFinite(v)).map(([, v]) => v)];
    let lo = Math.min(...vals), hi = Math.max(...vals); if (lo === hi) { lo -= 1; hi += 1; } const m = (hi - lo) * 0.12; lo -= m; hi += m;
    const t0 = vis[0].time, t1 = vis[vis.length - 1].time || t0 + 1, span = t1 - t0 || 1;
    const x = t => pad.l + (vis.length === 1 ? (W - pad.l - pad.r) / 2 : ((t - t0) / span) * (W - pad.l - pad.r));
    const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const pts = vis.map(d => [x(d.time), y(d.value)]);
    const line = pts.map(q => q.join(",")).join(" ");
    const refLines = Object.entries({ target: ["Cible", "var(--accent)", "6 4"], min: ["Min", "var(--pos)", "2 3"], max: ["Max", "var(--neg)", "2 3"], avg: ["Moy.", "var(--text-3)", "8 4"] })
      .filter(([k]) => refsVisible[k] && Number.isFinite(refs[k]))
      .map(([k, [t, col, dash]]) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(refs[k])}" y2="${y(refs[k])}" stroke="${col}" stroke-dasharray="${dash}" stroke-width="1"/><text x="${W - pad.r + 6}" y="${y(refs[k]) + 4}" fill="${col}" class="svg-axis">${t} ${fmtNum(refs[k], 0)}</text>`).join("");
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = lo + (hi - lo) * f; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/>`; }).join("");
    canvas.innerHTML = `<svg width="${W}" height="${H}" class="svg-chart" role="img" aria-label="Historique des prix">${grid}
      ${pts.length > 1 ? `<polygon points="${pts[0][0]},${H - pad.b} ${line} ${pts[pts.length - 1][0]},${H - pad.b}" fill="var(--accent-fill)"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : ""}
      ${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="var(--bg-1)" stroke="var(--accent)" stroke-width="1.6"/>`).join("")}${refLines}
      <line class="svg-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--line-strong)" visibility="hidden"/></svg>`;
    const svg = canvas.querySelector("svg"), cross = svg.querySelector(".svg-cross");
    svg.onpointermove = e => {
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left;
      let best = 0; pts.forEach((q, i) => { if (Math.abs(q[0] - mx) < Math.abs(pts[best][0] - mx)) best = i; });
      cross.setAttribute("x1", pts[best][0]); cross.setAttribute("x2", pts[best][0]); cross.setAttribute("visibility", "visible");
      tip.innerHTML = tipHTML(vis[best], o.currency); tip.hidden = false;
      tip.style.transform = `translate(${Math.round(Math.min(Math.max(pts[best][0] - tip.offsetWidth / 2, 4), W - tip.offsetWidth - 4))}px, 8px)`;
    };
    svg.onpointerleave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  };
  ro.observe(canvas);
  const ctl = {
    engine: "svg",
    setData(obs, r = refs) { data = toSeries(obs); refs = r; draw(); },
    setPeriod(id) { period = id; draw(); },
    setRefsVisible(map) { Object.assign(refsVisible, map); draw(); },
    destroy() { ro.disconnect(); },
  };
  ctl.setData(o.obs, o.refs);
  return ctl;
}

/** Index chart: baseline at 100 — above = prices up (bad for a buyer, red), below = down (green). */
export async function indexChart(host, series) {
  host.classList.add("chart-host");
  host.innerHTML = `<div class="chart-canvas"></div>`;
  const canvas = host.firstChild;
  const LW = await loadChartLib();
  const pts = toSeries(series.map(s => ({ ts: s.ts, price: s.value, status: "verified" })));
  if (!LW || pts.length < 2) { canvas.innerHTML = sparkline(series.map(s => s.value), { w: 400, h: 90, cls: "spark-lg" }).s; return { destroy() {} }; }
  const c = palette();
  const chart = LW.createChart(canvas, {
    autoSize: true, layout: { background: { type: "solid", color: "transparent" }, textColor: c.text, fontFamily: c.font, fontSize: 10, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: c.grid } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true },
    crosshair: { mode: LW.CrosshairMode.Magnet }, handleScroll: false, handleScale: false, localization: { locale: "fr-FR", priceFormatter: p => fmtNum(p, 1) },
  });
  const s = chart.addBaselineSeries({ baseValue: { type: "price", price: 100 }, topLineColor: c.neg, topFillColor1: "rgba(229,87,91,.22)", topFillColor2: "rgba(229,87,91,0)", bottomLineColor: c.pos, bottomFillColor1: "rgba(61,191,126,0)", bottomFillColor2: "rgba(61,191,126,.22)", lineWidth: 2, priceLineVisible: false });
  s.setData(pts.map(({ time, value }) => ({ time, value })));
  chart.timeScale().fitContent();
  return { destroy() { try { chart.remove(); } catch {} } };
}

let sparkId = 0;
/** Lightweight inline sparkline. tone: "up" | "down" | "flat" decides the colour. */
export function sparkline(values, { w = 120, h = 32, tone = null, cls = "" } = {}) {
  if (values.length < 2) return raw(`<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="2" x2="${w - 2}" y1="${h / 2}" y2="${h / 2}" class="spark-empty"/></svg>`);
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), h - 3 - ((v - lo) / span) * (h - 6)]);
  const t = tone || (values[values.length - 1] > values[0] ? "up" : values[values.length - 1] < values[0] ? "down" : "flat");
  const id = `sp${++sparkId}`, line = pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
  return raw(`<svg class="spark spark-${t} ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><polygon points="2,${h} ${line} ${w - 2},${h}" fill="url(#${id})"/><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`);
}
