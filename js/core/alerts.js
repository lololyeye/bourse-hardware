// Alert rules — pure evaluation with duplicate protection. Covered by tests/alerts.test.mjs.
import { DAY, fmtPrice, fmtPct } from "./format.js";
import { isVerified, MIN_VERIFIED } from "./analytics.js";

// kind "level": fires on false→true transition (re-arms when the condition clears).
// kind "event": fires once per new observation (keyed by observation id).
export const ALERT_TYPES = {
  below: { label: "Prix inférieur ou égal à", unit: "€", kind: "level", icon: "arrowDown" },
  above: { label: "Prix supérieur ou égal à", unit: "€", kind: "level", icon: "arrowUp" },
  dropPct: { label: "Baisse d'au moins", unit: "%", kind: "event", icon: "trendDown", def: 5 },
  risePct: { label: "Hausse d'au moins", unit: "%", kind: "event", icon: "trendUp", def: 5 },
  histLow: { label: "Nouveau plus bas historique", unit: null, kind: "event", icon: "target" },
  nearTarget: { label: "Proche du prix cible, à moins de", unit: "%", kind: "level", icon: "target", def: 5 },
  opportunity: { label: "Devient une opportunité d'achat", unit: null, kind: "level", icon: "spark" },
  stale: { label: "Aucun relevé depuis", unit: "j", kind: "level", icon: "clock", def: 14 },
};

export function describeAlert(a, currency = "EUR") {
  const t = ALERT_TYPES[a.type];
  if (!t) return a.type;
  if (!t.unit) return t.label;
  const v = t.unit === "€" ? fmtPrice(a.threshold, currency) : `${a.threshold} ${t.unit === "%" ? "%" : "jours"}`;
  return `${t.label} ${v}`;
}

/** ctx: { obs (sorted), watch, signal, now, product, currency } */
export function evaluate(a, ctx) {
  const { obs, watch, now = Date.now(), product, currency = "EUR" } = ctx;
  const name = product?.name || a.productId;
  const last = obs[obs.length - 1];
  const res = (active, title, body, key = null) => ({ active: !!active, title, body, key });
  if (!last) return res(false);
  // Starting estimates never trigger price alerts: only real observations do.
  if (!isVerified(last) && a.type !== "stale") return res(false);
  const prev = obs.slice(0, -1).filter(isVerified).at(-1);
  const price = last.price;
  switch (a.type) {
    case "below": return res(price <= a.threshold, `${name} sous ${fmtPrice(a.threshold, currency)}`, `Dernier prix relevé : ${fmtPrice(price, currency)}.`);
    case "above": return res(price >= a.threshold, `${name} au-dessus de ${fmtPrice(a.threshold, currency)}`, `Dernier prix relevé : ${fmtPrice(price, currency)}.`);
    case "dropPct":
    case "risePct": {
      if (!prev) return res(false);
      const d = (price - prev.price) / prev.price * 100;
      const hit = a.type === "dropPct" ? d <= -a.threshold : d >= a.threshold;
      return res(hit, `${name} : ${a.type === "dropPct" ? "baisse" : "hausse"} de ${fmtPct(d)}`, `${fmtPrice(prev.price, currency)} → ${fmtPrice(price, currency)}.`, last.id);
    }
    case "histLow": {
      const ver = obs.filter(isVerified);
      if (ver.length < MIN_VERIFIED || ver[ver.length - 1] !== last) return res(false);
      const prevMin = Math.min(...ver.slice(0, -1).map(o => o.price));
      return res(price <= prevMin, `${name} : plus bas historique`, `${fmtPrice(price, currency)}, sous le précédent plus bas (${fmtPrice(prevMin, currency)}).`, last.id);
    }
    case "nearTarget": {
      const t = watch?.target;
      if (!t) return res(false);
      const d = (price - t) / t * 100;
      return res(d > 0 && d <= a.threshold, `${name} proche de ta cible`, `${fmtPrice(price, currency)}, ${fmtPct(d)} au-dessus de ${fmtPrice(t, currency)}.`);
    }
    case "opportunity": {
      const code = ctx.signal?.code;
      return res(code === "EXCELLENT" || code === "GOOD", `${name} : ${ctx.signal?.label?.toLowerCase() || "opportunité"}`, ctx.signal?.reasons?.map(r => r.text).slice(-1)[0] || "");
    }
    case "stale": {
      const age = (now - last.ts) / DAY;
      return res(age >= a.threshold, `${name} : prix à revérifier`, `Dernier relevé il y a ${Math.floor(age)} jours.`);
    }
    default: return res(false);
  }
}

/** Returns notifications to emit and per-alert patches. Never fires twice for the same state/observation. */
export function runAlerts(alerts, ctxFor, now = Date.now()) {
  const fired = [], patches = new Map();
  for (const a of alerts) {
    if (!a.enabled || !ALERT_TYPES[a.type]) continue;
    const ctx = ctxFor(a.productId);
    if (!ctx) continue;
    const r = evaluate(a, { ...ctx, now });
    if (ALERT_TYPES[a.type].kind === "event") {
      if (r.active && r.key && a.lastKey !== r.key) { fired.push({ alert: a, title: r.title, body: r.body }); patches.set(a.id, { lastKey: r.key, lastTriggeredAt: now }); }
    } else {
      if (r.active && a.armed !== false) { fired.push({ alert: a, title: r.title, body: r.body }); patches.set(a.id, { armed: false, lastTriggeredAt: now }); }
      else if (!r.active && a.armed === false) patches.set(a.id, { armed: true });
    }
  }
  return { fired, patches };
}
