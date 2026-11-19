// Price analytics — pure functions, no DOM, no storage. Covered by tests/analytics.test.mjs.
import { DAY, clamp, fmtPrice, fmtPct, fmtAgo } from "./format.js";

export const MIN_VERIFIED = 3;
export const isVerified = o => o.status !== "estimate";

export function obsOf(observations, productId) {
  return observations.filter(o => o.productId === productId).sort((a, b) => a.ts - b.ts);
}

export function stats(obs, now = Date.now()) {
  if (!obs.length) return { n: 0, nVerified: 0, cur: null, prev: null, changePrev: null, min: null, max: null, avg: null, ageDays: null, last: null, first: null };
  const last = obs[obs.length - 1], prevObs = obs.length > 1 ? obs[obs.length - 2] : null;
  let min = Infinity, max = -Infinity, sum = 0, nVerified = 0;
  for (const o of obs) { if (o.price < min) min = o.price; if (o.price > max) max = o.price; sum += o.price; if (isVerified(o)) nVerified++; }
  return {
    n: obs.length, nVerified, cur: last.price, last, first: obs[0],
    prev: prevObs ? prevObs.price : null,
    changePrev: prevObs ? (last.price - prevObs.price) / prevObs.price * 100 : null,
    min, max, avg: sum / obs.length,
    ageDays: (now - last.ts) / DAY,
  };
}

export function priceAt(obs, t) {
  let p = null;
  for (const o of obs) { if (o.ts <= t) p = o.price; else break; }
  return p;
}

/** % change between the price known `days` ago and the latest price. null when nothing was known back then. */
export function changeOver(obs, days, now = Date.now()) {
  if (obs.length < 2) return null;
  const ref = priceAt(obs, now - days * DAY);
  if (ref == null) return null;
  return (obs[obs.length - 1].price - ref) / ref * 100;
}

/** Least-squares trend over the window. Needs ≥ 3 points spanning ≥ 1 day. */
export function trend(obs, now = Date.now(), windowDays = 30) {
  const w = obs.filter(o => o.ts >= now - windowDays * DAY);
  if (w.length < 3) return null;
  const t0 = w[0].ts, xs = w.map(o => (o.ts - t0) / DAY), ys = w.map(o => o.price);
  const span = xs[xs.length - 1];
  if (span < 1) return null;
  const n = w.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  const slopePctWeek = slope * 7 / my * 100;
  return { slopePctWeek, r2, n, spanDays: span, dir: slopePctWeek > 1 ? "rising" : slopePctWeek < -1 ? "falling" : "flat" };
}

export function freshness(ageDays, staleDays = 14) {
  if (ageDays == null) return "none";
  if (ageDays <= 3) return "fresh";
  if (ageDays <= staleDays) return "aging";
  return "stale";
}
export const FRESH_LABEL = { none: "Aucune donnée", fresh: "Frais", aging: "Vieillissant", stale: "Périmé" };

export function confidence(st, fresh) {
  if (!st.n) return { level: "none", label: "Aucune donnée" };
  if (st.nVerified === 0) return { level: "low", label: "Estimation seulement" };
  if (st.nVerified < MIN_VERIFIED) return { level: "low", label: `${st.nVerified} relevé${st.nVerified > 1 ? "s" : ""} vérifié${st.nVerified > 1 ? "s" : ""}` };
  if (fresh === "stale") return { level: "low", label: "Données périmées" };
  if (st.nVerified >= 6 && fresh === "fresh") return { level: "high", label: "Fiable" };
  return { level: "medium", label: "Correcte" };
}

export const SIGNALS = {
  EXCELLENT: { label: "Excellente opportunité", tone: "pos2", rank: 5, def: "Le prix vérifié est au niveau (≤ 2 %) du plus bas observé." },
  GOOD: { label: "Bonne opportunité", tone: "pos", rank: 4, def: "Le prix est au moins 5 % sous la moyenne observée, ou sous ton prix cible." },
  URGENT: { label: "Urgent", tone: "neg", rank: 3, def: "Le prix monte et ton échéance d'achat est dans moins de 30 jours." },
  FAIR: { label: "Prix correct", tone: "neutral", rank: 2, def: "Ni opportunité ni raison claire d'attendre." },
  WAIT: { label: "Attendre", tone: "warn", rank: 1, def: "Le prix est au-dessus de ta cible et rien dans les données ne pousse à acheter maintenant." },
  INSUFFICIENT: { label: "Données insuffisantes", tone: "muted", rank: 0, def: `Moins de ${MIN_VERIFIED} relevés vérifiés : aucune conclusion statistique.` },
};

/**
 * Buy signal. Reason kinds: observed | stat | trend | target | data.
 * ctx: { now, staleDays, deadlineDays, currency }
 */
export function signal(obs, watch, ctx = {}) {
  const now = ctx.now ?? Date.now(), cur = ctx.currency || "EUR";
  const st = stats(obs, now);
  const reasons = [];
  const r = (kind, text) => reasons.push({ kind, text });
  const out = code => ({ code, ...SIGNALS[code], reasons, targetHit: !!(watch?.target && st.cur != null && st.cur <= watch.target) });
  if (!st.n) { r("data", "Aucun prix relevé pour ce produit."); return out("INSUFFICIENT"); }
  r("observed", `Dernier prix ${fmtPrice(st.cur, cur)}, ${fmtAgo(st.last.ts, now)}${st.last.status === "estimate" ? " (estimation)" : ""}.`);
  const target = watch?.target;
  if (target) {
    const d = (st.cur - target) / target * 100;
    r("target", d <= 0 ? `Sous ton prix cible de ${fmtPrice(target, cur)} (${fmtPct(d)}).` : `${fmtPct(d)} au-dessus de ton prix cible (${fmtPrice(target, cur)}).`);
  }
  const ver = obs.filter(isVerified);
  if (ver.length < MIN_VERIFIED) {
    r("data", `${ver.length} relevé${ver.length > 1 ? "s" : ""} vérifié${ver.length > 1 ? "s" : ""} sur ${MIN_VERIFIED} nécessaires. Les estimations ne comptent pas dans les statistiques.`);
    return out("INSUFFICIENT");
  }
  const vs = stats(ver, now), tr = trend(ver, now, 30);
  const fr = freshness(vs.ageDays, ctx.staleDays ?? 14);
  if (fr === "stale") r("data", `Dernier relevé vérifié ${fmtAgo(vs.last.ts, now)} : à revérifier avant d'acheter.`);
  if (tr) r("trend", `Tendance 30 j estimée : ${fmtPct(tr.slopePctWeek)} par semaine (${tr.n} relevés, ajustement R² ${tr.r2.toFixed(2)}).`);

  if (tr && tr.dir === "rising" && ctx.deadlineDays != null && ctx.deadlineDays <= 30) {
    r("target", `Ton échéance d'achat est dans ${Math.max(0, Math.round(ctx.deadlineDays))} jours.`);
    return out("URGENT");
  }
  if (vs.max > vs.min && vs.cur <= vs.min * 1.02) { r("stat", `Au niveau du plus bas observé (${fmtPrice(vs.min, cur)}, ${vs.n} relevés).`); return out("EXCELLENT"); }
  if (vs.cur <= vs.avg * 0.95) { r("stat", `${fmtPct((vs.cur - vs.avg) / vs.avg * 100)} par rapport à la moyenne observée (${fmtPrice(vs.avg, cur)}).`); return out("GOOD"); }
  if (target && vs.cur <= target) return out("GOOD");
  if (target && vs.cur > target) {
    if (tr?.dir === "rising") r("trend", "Le prix monte : attendre ne garantit pas une baisse.");
    return out("WAIT");
  }
  r("stat", `Proche de la moyenne observée (${fmtPrice(vs.avg, cur)}).`);
  return out("FAIR");
}

export const DEFAULT_WEIGHTS = { price: 3, low: 2, trend: 1, urgency: 2, budget: 2 };

/** Transparent 0–100 buy-now score. Each part is 0..1 and returned for display. */
export function buyScore(obs, watch, ctx = {}, weights = DEFAULT_WEIGHTS) {
  const now = ctx.now ?? Date.now();
  const st = stats(obs, now);
  if (!st.n) return { total: 0, parts: {}, usable: false };
  const ver = obs.filter(isVerified), vs = ver.length ? stats(ver, now) : null, tr = trend(ver, now, 30);
  const parts = {
    price: watch?.target ? clamp(0.5 + (watch.target - st.cur) / watch.target * 2.5, 0, 1) : 0.5,
    low: vs && vs.n >= MIN_VERIFIED && vs.max > vs.min ? 1 - (st.cur - vs.min) / (vs.max - vs.min) : 0.5,
    trend: tr ? clamp(0.5 + tr.slopePctWeek / 10, 0, 1) : 0.5,
    urgency: ctx.deadlineDays != null ? clamp(1 - ctx.deadlineDays / 90, 0, 1) : ({ high: 0.6, medium: 0.4, low: 0.2 }[watch?.priority] ?? 0.3),
    budget: ctx.available != null ? clamp(ctx.available / st.cur, 0, 1) : 0.5,
  };
  let w = 0, s = 0;
  for (const k of Object.keys(parts)) { const wk = Math.max(0, +weights[k] || 0); w += wk; s += wk * parts[k]; }
  return { total: w ? Math.round(s / w * 100) : 0, parts, usable: !!vs && vs.n >= MIN_VERIFIED };
}

/** Equal-weight index, base 100 = first known price of each product (chain-linked per product). */
export function marketIndex(products, observations, now = Date.now()) {
  const series = products.map(p => obsOf(observations, p.id)).filter(o => o.length);
  const valueAt = (t, set) => {
    let s = 0, n = 0;
    for (const o of set) { if (o[0].ts > t) continue; const p = priceAt(o, t); s += p / o[0].price * 100; n++; }
    return n ? s / n : null;
  };
  const change = days => {
    const t0 = now - days * DAY;
    const set = series.filter(o => o[0].ts <= t0);
    if (!set.length || !set.some(o => o.some(x => x.ts > t0 && x.ts <= now))) return null;
    const a = valueAt(t0, set), b = valueAt(now, set);
    return a ? (b / a - 1) * 100 : null;
  };
  let rising = 0, falling = 0, flat = 0, est = 0;
  for (const o of series) {
    if (o[o.length - 1].status === "estimate") est++;
    if (o.length < 2) continue;
    const d = o[o.length - 1].price - o[o.length - 2].price;
    d > 0 ? rising++ : d < 0 ? falling++ : flat++;
  }
  const times = [...new Set(series.flatMap(o => o.map(x => x.ts)))].filter(t => t <= now).sort((a, b) => a - b);
  const c1 = change(1), c7 = change(7), c30 = change(30);
  const ref = c7 ?? c30;
  const direction = ref != null ? (ref > 0.5 ? "up" : ref < -0.5 ? "down" : "flat") : rising + falling ? (rising > falling ? "up" : falling > rising ? "down" : "flat") : "unknown";
  return {
    value: valueAt(now, series), c1, c7, c30, rising, falling, flat,
    tracked: series.length, estimateShare: series.length ? est / series.length : 0, direction,
    series: times.map(t => ({ ts: t, value: valueAt(t, series) })),
  };
}

/** Sentences describing the market, each backed by data. Never extrapolates. */
export function marketSummary(rows, catLabel, { staleDays = 14 } = {}) {
  const out = [];
  const verifiedRows = rows.filter(r => r.ver.length >= MIN_VERIFIED);
  if (!verifiedRows.length) {
    const any = rows.some(r => r.ver.length);
    out.push({ kind: "data", text: any ? `Pas encore assez de relevés vérifiés (${MIN_VERIFIED} par produit) pour décrire une tendance. Continue tes relevés.` : "Aucun relevé vérifié pour l'instant : les prix affichés sont des estimations de départ. Fais un relevé pour démarrer l'analyse." });
  }
  const byCat = new Map();
  for (const r of rows) if (r.trend) { if (!byCat.has(r.product.category)) byCat.set(r.product.category, []); byCat.get(r.product.category).push(r); }
  for (const [cat, list] of byCat) {
    const avg = list.reduce((a, r) => a + r.trend.slopePctWeek, 0) / list.length;
    const dir = avg > 1 ? "en hausse" : avg < -1 ? "en baisse" : "stables";
    out.push({ kind: "trend", text: `${catLabel(cat)} : prix ${dir} (${fmtPct(avg)} par semaine en moyenne, ${list.length} produit${list.length > 1 ? "s" : ""} avec ≥ 3 relevés sur 30 j).` });
  }
  const lows = rows.filter(r => r.signal.code === "EXCELLENT");
  if (lows.length) out.push({ kind: "stat", text: `${lows.map(r => r.product.name).join(", ")} ${lows.length > 1 ? "sont" : "est"} au niveau de ${lows.length > 1 ? "leur" : "son"} plus bas observé.` });
  const near = rows.filter(r => r.watch?.target && r.st.cur != null && r.st.cur > r.watch.target && (r.st.cur - r.watch.target) / r.watch.target <= 0.05);
  if (near.length) out.push({ kind: "target", text: `${near.map(r => r.product.name).join(", ")} : à moins de 5 % de ton prix cible.` });
  const stale = rows.filter(r => r.st.n && r.st.ageDays > staleDays);
  if (stale.length) out.push({ kind: "data", text: `${stale.length} produit${stale.length > 1 ? "s" : ""} sans relevé depuis plus de ${staleDays} jours : leur prix n'est peut-être plus d'actualité.` });
  return out;
}
