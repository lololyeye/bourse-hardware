// State defaults, normalisation and v1 → v2 migration. Pure: takes raw strings, returns state + report.
import { CATEGORIES, SEED_PRODUCTS, SEED_OBSERVATIONS, SEED_WATCH } from "./catalog.js";
import { cleanObservation, checkObservation, cleanProduct } from "./validate.js";
import { DEFAULT_WEIGHTS } from "./analytics.js";
import { uid } from "./format.js";

export const KEY_V2 = "bourse-hardware-v2";
export const KEY_V1 = "bourse-hardware-v1";
export const VERSION = 2;

export const DEFAULT_SETTINGS = {
  theme: "dark", accent: "amber", motion: "auto", density: "comfortable",
  chartStyle: "area", chartMarkers: true, currency: "EUR", dateFormat: "fr",
  staleDays: 14, reminderDays: 7, weights: { ...DEFAULT_WEIGHTS },
  browserNotif: false, watchView: "detailed", sidebarCollapsed: false,
};
export const VISUAL_KEYS = ["theme", "accent", "motion", "density", "chartStyle", "chartMarkers", "dateFormat", "watchView", "sidebarCollapsed"];

const PRIORITIES = ["high", "medium", "low"];
const ALERT_TYPES = ["below", "above", "dropPct", "risePct", "histLow", "nearTarget", "opportunity", "stale"];
const SLOTS = ["cpu", "gpu", "motherboard", "ram", "storage", "psu", "case", "cooling", "monitor"];
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export function defaultBudget() {
  return {
    net: 2200, fixed: 900, life: 600, saved: 0, pcMonthly: 450, safetyMonthly: 100, countResale: true,
    plan: [
      { id: "case", label: "Boîtier + alimentation", productIds: [], fixedPrice: 30, extra: 0, note: "Déjà prévu", resaleLabel: "", resale: 0, done: false },
      { id: "gpu", label: "Carte graphique", productIds: ["rx9060xt"], fixedPrice: null, extra: 0, note: "", resaleLabel: "GTX 1650", resale: 80, done: false },
      { id: "cpu", label: "Processeur + refroidissement", productIds: ["r7_5800x3d", "aio240"], fixedPrice: null, extra: 0, note: "Le 5800X3D est vendu sans ventirad", resaleLabel: "Ryzen 5 3600", resale: 80, done: false },
      { id: "ram", label: "RAM 32 Go + ventilateurs", productIds: ["ddr4_32"], fixedPrice: null, extra: 50, note: "", resaleLabel: "16 Go DDR4", resale: 40, done: false },
    ],
  };
}
export function defaultConfigs() {
  return [{
    id: "cfg-am4", name: "Plan AM4 · 1080p 144 Hz", budget: 1500, createdAt: Date.now(),
    parts: { cpu: "r7_5800x3d", gpu: "rx9060xt", motherboard: "b450gpm", ram: "ddr4_32", storage: null, psu: "psu750", case: "o11mini", cooling: "aio240", monitor: null },
    owned: { motherboard: true, storage: true },
  }];
}
function defaultAlerts(watch, drop = 5, rise = 5) {
  const out = [], now = Date.now();
  for (const w of watch) {
    out.push({ id: uid("a"), productId: w.productId, type: "below", threshold: w.target, notify: true, enabled: true, createdAt: now, lastTriggeredAt: null, armed: true });
    out.push({ id: uid("a"), productId: w.productId, type: "dropPct", threshold: drop, notify: true, enabled: true, createdAt: now, lastTriggeredAt: null, lastKey: null });
    if (w.priority === "high") {
      out.push({ id: uid("a"), productId: w.productId, type: "risePct", threshold: rise, notify: true, enabled: true, createdAt: now, lastTriggeredAt: null, lastKey: null });
      out.push({ id: uid("a"), productId: w.productId, type: "opportunity", threshold: null, notify: true, enabled: true, createdAt: now, lastTriggeredAt: null, armed: true });
    }
  }
  return out;
}

export function defaultState(now = Date.now()) {
  const watchlist = SEED_WATCH.map((w, i) => ({ ...w, note: "", favorite: false, deadline: null, order: i }));
  return {
    products: SEED_PRODUCTS.map(p => ({ ...p, createdAt: now })),
    observations: SEED_OBSERVATIONS.map(o => ({ id: uid("o"), currency: "EUR", note: "", ...o })),
    watchlist,
    alerts: defaultAlerts(watchlist),
    notifications: [],
    budget: defaultBudget(),
    configs: defaultConfigs(),
    settings: structuredClone(DEFAULT_SETTINGS),
    meta: { version: VERSION, createdAt: now, migratedFrom: null, migrationReport: null, lastReminderAt: null, firedEvents: {} },
  };
}

/** Repair any v2-shaped object. Unknown / invalid records are dropped and counted. */
export function normalize(s, report = { dropped: 0, notes: [] }) {
  const d = defaultState();
  if (!s || typeof s !== "object") return { state: d, report: { ...report, notes: [...report.notes, "État illisible : valeurs par défaut"] } };
  const products = (Array.isArray(s.products) ? s.products : d.products).map(p => cleanProduct(p, CATEGORIES)).filter(Boolean);
  const ids = new Set(products.map(p => p.id));
  const observations = [];
  for (const raw of Array.isArray(s.observations) ? s.observations : []) {
    const o = cleanObservation(raw);
    const { errors } = checkObservation(o, { productIds: ids, now: Date.now() + 864e5 });
    if (!o || errors.length) { report.dropped++; continue; } // currency mismatches are warnings, so they are kept
    observations.push(o);
  }
  const watchlist = (Array.isArray(s.watchlist) ? s.watchlist : []).filter(w => w && ids.has(w.productId)).map((w, i) => ({
    productId: w.productId, target: num(w.target, 0) > 0 ? num(w.target) : null, priority: PRIORITIES.includes(w.priority) ? w.priority : "medium",
    note: typeof w.note === "string" ? w.note.slice(0, 300) : "", favorite: !!w.favorite, deadline: Number.isFinite(w.deadline) ? w.deadline : null, order: num(w.order, i),
  }));
  const alerts = (Array.isArray(s.alerts) ? s.alerts : []).filter(a => a && ids.has(a.productId) && ALERT_TYPES.includes(a.type)).map(a => ({
    id: String(a.id || uid("a")), productId: a.productId, type: a.type, threshold: a.threshold == null ? null : num(a.threshold), notify: a.notify !== false, enabled: a.enabled !== false,
    createdAt: num(a.createdAt, Date.now()), lastTriggeredAt: Number.isFinite(a.lastTriggeredAt) ? a.lastTriggeredAt : null, armed: a.armed !== false, lastKey: a.lastKey ?? null,
  }));
  const notifications = (Array.isArray(s.notifications) ? s.notifications : []).filter(n => n && Number.isFinite(n.ts)).slice(0, 300).map(n => ({
    id: String(n.id || uid("n")), ts: n.ts, alertId: n.alertId || null, productId: ids.has(n.productId) ? n.productId : null, kind: String(n.kind || "info"),
    title: String(n.title || "").slice(0, 160), body: String(n.body || "").slice(0, 400), read: !!n.read,
  }));
  const b = s.budget && typeof s.budget === "object" ? s.budget : {};
  const db = d.budget;
  const budget = {
    net: num(b.net, db.net), fixed: num(b.fixed, db.fixed), life: num(b.life, db.life), saved: num(b.saved, db.saved),
    pcMonthly: num(b.pcMonthly, db.pcMonthly), safetyMonthly: num(b.safetyMonthly, db.safetyMonthly), countResale: b.countResale !== false,
    plan: (Array.isArray(b.plan) ? b.plan : db.plan).filter(i => i && i.id).map(i => ({
      id: String(i.id), label: String(i.label || "Achat").slice(0, 80), productIds: (Array.isArray(i.productIds) ? i.productIds : []).filter(x => ids.has(x)),
      fixedPrice: i.fixedPrice == null || i.fixedPrice === "" ? null : num(i.fixedPrice), extra: num(i.extra), note: String(i.note || "").slice(0, 200),
      resaleLabel: String(i.resaleLabel || "").slice(0, 60), resale: num(i.resale), done: !!i.done,
    })),
  };
  const configs = (Array.isArray(s.configs) ? s.configs : []).filter(c => c && c.id).map(c => ({
    id: String(c.id), name: String(c.name || "Config").slice(0, 60), budget: num(c.budget), createdAt: num(c.createdAt, Date.now()),
    parts: Object.fromEntries(SLOTS.map(k => [k, ids.has(c.parts?.[k]) ? c.parts[k] : null])),
    owned: Object.fromEntries(SLOTS.map(k => [k, !!c.owned?.[k]])),
  }));
  const st = s.settings && typeof s.settings === "object" ? s.settings : {};
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...pick(st, Object.keys(DEFAULT_SETTINGS)) };
  settings.weights = { ...DEFAULT_WEIGHTS, ...(st.weights && typeof st.weights === "object" ? st.weights : {}) };
  for (const k of Object.keys(settings.weights)) settings.weights[k] = Math.max(0, Math.min(5, num(settings.weights[k], DEFAULT_WEIGHTS[k] ?? 1)));
  const meta = { ...d.meta, ...(s.meta && typeof s.meta === "object" ? s.meta : {}), version: VERSION };
  meta.firedEvents ||= {};
  return { state: { products, observations, watchlist, alerts, notifications, budget, configs, settings, meta }, report };
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

/** v1 → v2. v1 shape: { prods:{id:{target,hist:[{t,p,src}]}}, alerts:[], settings:{drop,rise}, budget:{net,fixed,life,saved,pc}, plan:{gpuFirst,resale,prices,resaleVal,done}, lastReleve } */
export function fromV1(v1) {
  const st = defaultState();
  const report = { dropped: 0, notes: ["Migration depuis la v1"] };
  if (!v1 || typeof v1 !== "object") return { state: st, report: { ...report, notes: ["Données v1 illisibles"] } };
  const known = new Set(st.products.map(p => p.id));
  if (v1.prods && typeof v1.prods === "object") {
    st.observations = [];
    for (const [pid, p] of Object.entries(v1.prods)) {
      if (!known.has(pid)) { report.dropped++; continue; }
      for (const h of Array.isArray(p?.hist) ? p.hist : []) {
        const est = h?.src === "estimation";
        const seed = SEED_OBSERVATIONS.find(s => s.productId === pid);
        st.observations.push({ id: uid("o"), productId: pid, price: Number(h?.p), currency: "EUR", retailer: "", sourceUrl: est && seed ? seed.sourceUrl : "", ts: Number(h?.t), method: est ? "seed" : "manual", status: est ? "estimate" : "verified", note: est ? "Estimation de départ (v1)" : "Relevé v1" });
      }
      const w = st.watchlist.find(x => x.productId === pid);
      if (w && Number(p?.target) > 0) w.target = Number(p.target);
    }
    // products absent from v1 keep their (clearly labelled) starting estimate
    const has = new Set(st.observations.map(o => o.productId));
    for (const s of SEED_OBSERVATIONS) if (!has.has(s.productId)) st.observations.push({ id: uid("o"), currency: "EUR", note: "", ...s });
  }
  const drop = Number(v1.settings?.drop) || 5, rise = Number(v1.settings?.rise) || 5;
  st.alerts = defaultAlerts(st.watchlist, drop, rise);
  st.notifications = (Array.isArray(v1.alerts) ? v1.alerts : []).filter(a => a && Number.isFinite(a.t)).map(a => ({
    id: uid("n"), ts: a.t, alertId: null, productId: null, kind: ["drop", "rise", "target", "remind"].includes(a.type) ? a.type : "info",
    title: { drop: "Baisse de prix", rise: "Hausse de prix", target: "Prix cible", remind: "Rappel" }[a.type] || "Alerte", body: String(a.text || "").replace(/^\p{Extended_Pictographic}\s*/u, ""), read: !!a.read,
  }));
  if (v1.budget && typeof v1.budget === "object") {
    const b = v1.budget;
    Object.assign(st.budget, { net: num(b.net, 2200), fixed: num(b.fixed, 900), life: num(b.life, 600), saved: num(b.saved, 0), pcMonthly: num(b.pc, 450) });
  }
  if (v1.plan && typeof v1.plan === "object") {
    const p = v1.plan;
    st.budget.countResale = p.resale !== false;
    const map = { case: "case", gpu: "gpu", cpu: "cpu", ram: "ram" };
    for (const item of st.budget.plan) {
      const k = map[item.id];
      if (p.prices && Number.isFinite(+p.prices[k])) item.fixedPrice = +p.prices[k];
      if (p.done && p.done[k]) item.done = true;
    }
    if (p.resaleVal) {
      const rv = p.resaleVal, set = (id, v) => { const it = st.budget.plan.find(i => i.id === id); if (it && Number.isFinite(+v)) it.resale = +v; };
      set("gpu", rv.gtx); set("cpu", rv.cpu); set("ram", rv.ram);
    }
    if (p.gpuFirst) { const i = st.budget.plan.findIndex(x => x.id === "gpu"); st.budget.plan.unshift(...st.budget.plan.splice(i, 1)); }
  }
  st.meta.migratedFrom = 1;
  if (Number.isFinite(v1.lastReleve)) st.meta.lastObservationAt = v1.lastReleve;
  const n = normalize(st, report);
  n.report.notes.push(`${n.state.observations.length} relevés, ${n.state.notifications.length} notifications et le budget repris`);
  n.state.meta.migrationReport = n.report;
  return n;
}

/**
 * Entry point. Returns { state, report, writes:{key:value}, warning }.
 * Never asks to delete anything: v1 stays in place, a dated backup is added, corrupt data is preserved.
 */
export function loadState(rawV2, rawV1, now = Date.now()) {
  const writes = {};
  if (rawV2) {
    try { const n = normalize(JSON.parse(rawV2)); return { ...n, writes, warning: n.report.dropped ? `${n.report.dropped} enregistrement(s) invalide(s) ignoré(s) au chargement.` : null }; }
    catch {
      writes[`bourse-hardware-corrupt-${now}`] = rawV2;
      const fallback = rawV1 ? migrateV1(rawV1, now, writes) : { state: defaultState(now), report: { dropped: 0, notes: [] } };
      return { ...fallback, writes, warning: "Les données enregistrées étaient illisibles. Une copie brute a été conservée dans le stockage (Réglages → Stockage)." };
    }
  }
  if (rawV1) { const r = migrateV1(rawV1, now, writes); return { ...r, writes, warning: null, migrated: true }; }
  return { state: defaultState(now), report: { dropped: 0, notes: [] }, writes, warning: null, fresh: true };
}
function migrateV1(rawV1, now, writes) {
  writes[`bourse-hardware-v1-backup-${new Date(now).toISOString().slice(0, 10)}`] = rawV1;
  try { return fromV1(JSON.parse(rawV1)); } catch { return { state: defaultState(now), report: { dropped: 0, notes: ["v1 illisible, sauvegardée telle quelle"] } }; }
}
