// Snapshots, export and import planning.
import { analyseObservations, cleanProduct, toCSV, parseCSV } from "./validate.js";
import { CATEGORIES } from "./catalog.js";
import { fmtDate } from "./format.js";

const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = str => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function pipe(bytes, Stream, fmt) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream(fmt))).arrayBuffer()); }

export async function encodeSnapshot(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "function") { try { return "z." + b64url(await pipe(bytes, CompressionStream, "deflate-raw")); } catch {} }
  return "j." + b64url(bytes);
}
export async function decodeSnapshot(str) {
  const [kind, data] = String(str).split(".", 2);
  if (!data) throw new Error("Format de lien inconnu");
  let bytes = unb64url(data);
  if (kind === "z") { if (typeof DecompressionStream !== "function") throw new Error("Ce navigateur ne sait pas décompresser ce lien"); bytes = await pipe(bytes, DecompressionStream, "deflate-raw"); }
  else if (kind !== "j") throw new Error("Format de lien inconnu");
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** parts: { watchlist, configs, history, budget, alerts } — budget is never included unless asked. */
export function buildSnapshot(state, parts) {
  const out = { format: "bourse-hardware", version: 2, kind: "snapshot", createdAt: Date.now(), parts: Object.keys(parts).filter(k => parts[k]) };
  const used = new Set();
  if (parts.watchlist) { out.watchlist = state.watchlist.map(({ productId, target, priority, favorite }) => ({ productId, target, priority, favorite })); out.watchlist.forEach(w => used.add(w.productId)); }
  if (parts.configs) { out.configs = state.configs; state.configs.forEach(c => Object.values(c.parts).forEach(p => p && used.add(p))); }
  if (parts.history) { out.observations = state.observations.map(({ note, ...o }) => o); out.observations.forEach(o => used.add(o.productId)); }
  if (parts.alerts) { out.alerts = state.alerts.map(({ productId, type, threshold, notify, enabled }) => ({ productId, type, threshold, notify, enabled })); out.alerts.forEach(a => used.add(a.productId)); }
  if (parts.budget) out.budget = state.budget;
  out.products = state.products.filter(p => used.has(p.id));
  return out;
}
export function fullBackup(state) { return { format: "bourse-hardware", version: 2, kind: "backup", createdAt: Date.now(), ...state }; }

/** Accepts v2 snapshot / backup, v1 share link payload ({v:1, prods}) or CSV text. */
export function normalizeIncoming(data, state) {
  if (typeof data === "string") {
    const rows = parseCSV(data);
    if (!rows.length) throw new Error("CSV vide");
    if (!("product_id" in rows[0] && "price" in rows[0])) throw new Error("CSV : colonnes product_id et price attendues");
    return { kind: "csv", products: [], observations: rows.map(r => ({ productId: r.product_id, price: r.price, currency: r.currency || state.settings.currency, retailer: r.retailer, sourceUrl: r.source_url, ts: r.timestamp, method: r.method || "import", status: r.status || "unverified", note: r.note })) };
  }
  if (!data || typeof data !== "object") throw new Error("Fichier illisible");
  if (data.v === 1 && data.prods) {
    const observations = [];
    for (const [pid, p] of Object.entries(data.prods)) for (const h of p?.hist || []) observations.push({ productId: pid, price: h.p, ts: h.t, currency: "EUR", method: h.src === "estimation" ? "seed" : "import", status: h.src === "estimation" ? "estimate" : "verified" });
    return { kind: "v1", products: [], observations, watchlist: Object.entries(data.prods).map(([productId, p]) => ({ productId, target: p?.target })).filter(w => w.target > 0) };
  }
  if (data.format !== "bourse-hardware") throw new Error("Ce fichier ne vient pas de Bourse du Hardware");
  return { kind: data.kind || "snapshot", products: data.products || [], observations: data.observations || [], watchlist: data.watchlist, configs: data.configs, alerts: data.alerts, budget: data.budget, settings: data.kind === "backup" ? data.settings : null };
}

export function planImport(inc, state) {
  const known = new Set(state.products.map(p => p.id));
  const newProducts = (inc.products || []).map(p => cleanProduct(p, CATEGORIES)).filter(p => p && !known.has(p.id));
  const ids = new Set([...known, ...newProducts.map(p => p.id)]);
  const existingIds = new Set(state.observations.map(o => o.id));
  const fresh = (inc.observations || []).filter(o => !existingIds.has(o?.id));
  const skippedSame = (inc.observations || []).length - fresh.length;
  const obs = analyseObservations(fresh, { productIds: ids, existing: state.observations, currency: state.settings.currency });
  return {
    kind: inc.kind, newProducts, obs, skippedSame,
    watchlist: Array.isArray(inc.watchlist) ? inc.watchlist.filter(w => ids.has(w?.productId)) : [],
    configs: Array.isArray(inc.configs) ? inc.configs : [],
    alerts: Array.isArray(inc.alerts) ? inc.alerts.filter(a => ids.has(a?.productId)) : [],
    budget: inc.budget && typeof inc.budget === "object" ? inc.budget : null,
    settings: inc.settings || null,
  };
}

export function observationsCSV(state, list = state.observations) {
  const name = new Map(state.products.map(p => [p.id, p.name]));
  return toCSV(list.map(o => ({ product_id: o.productId, product: name.get(o.productId) || "", price: o.price, currency: o.currency, retailer: o.retailer, source_url: o.sourceUrl, timestamp: new Date(o.ts).toISOString(), method: o.method, status: o.status, note: o.note })),
    ["product_id", "product", "price", "currency", "retailer", "source_url", "timestamp", "method", "status", "note"]);
}

export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const stamp = () => fmtDate(Date.now(), "iso");
