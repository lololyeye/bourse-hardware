// Strict validation of observations and imports — pure, covered by tests/validate.test.mjs.
import { DAY, uid } from "./format.js";

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];
export const METHODS = ["seed", "manual", "import", "api"];
export const STATUSES = ["estimate", "verified", "unverified"];
export const MAX_PRICE = 50000;
const MIN_TS = Date.UTC(2000, 0, 1);

const str = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const safeUrl = v => { const s = str(v, 500); try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; } };

/** Coerce an unknown record into an observation shape (does not judge validity). */
export function cleanObservation(o, defaults = {}) {
  if (!o || typeof o !== "object") return null;
  const price = typeof o.price === "string" ? Number(o.price.replace(",", ".").replace(/[^\d.-]/g, "")) : Number(o.price);
  const ts = typeof o.ts === "string" && !/^\d+$/.test(o.ts) ? Date.parse(o.ts) : Number(o.ts);
  return {
    id: str(o.id, 40) || uid("o"),
    productId: str(o.productId, 60),
    price,
    currency: str(o.currency, 3).toUpperCase() || defaults.currency || "EUR",
    retailer: str(o.retailer, 60),
    sourceUrl: safeUrl(o.sourceUrl),
    ts,
    method: METHODS.includes(o.method) ? o.method : defaults.method || "import",
    status: STATUSES.includes(o.status) ? o.status : defaults.status || "unverified",
    note: str(o.note, 200),
  };
}

/**
 * Errors make a record unusable; warnings need the user's attention.
 * opts: { productIds:Set, existing:Observation[], currency, now }
 */
export function checkObservation(o, { productIds, existing = [], currency = "EUR", now = Date.now() } = {}) {
  const errors = [], warnings = [];
  if (!o) return { errors: ["Enregistrement illisible"], warnings };
  if (!o.productId) errors.push("Produit manquant");
  else if (productIds && !productIds.has(o.productId)) errors.push(`Produit inconnu « ${o.productId} »`);
  if (!Number.isFinite(o.price) || o.price <= 0) errors.push("Prix impossible (≤ 0 ou non numérique)");
  else if (o.price > MAX_PRICE) errors.push(`Prix impossible (> ${MAX_PRICE.toLocaleString("fr-FR")})`);
  if (!Number.isFinite(o.ts)) errors.push("Date manquante ou invalide");
  else if (o.ts < MIN_TS) errors.push("Date antérieure à 2000");
  else if (o.ts > now + DAY) errors.push("Date dans le futur");
  if (!CURRENCIES.includes(o.currency)) errors.push(`Devise inconnue « ${o.currency} »`);
  else if (o.currency !== currency) warnings.push(`Devise ${o.currency} différente de ta devise (${currency}) : non comparable`);
  if (!errors.length) {
    const same = existing.filter(e => e.productId === o.productId && e.id !== o.id);
    if (same.some(e => e.price === o.price && Math.abs(e.ts - o.ts) < 60_000)) warnings.push("Doublon probable (même prix à moins d'une minute)");
    let near = null;
    for (const e of same) if (e.currency === o.currency && (!near || Math.abs(e.ts - o.ts) < Math.abs(near.ts - o.ts))) near = e;
    if (near) {
      const ratio = o.price / near.price;
      if (ratio > 1.5 || ratio < 0.6) warnings.push(`Variation suspecte : ${Math.round((ratio - 1) * 100)} % par rapport au relevé le plus proche (${near.price})`);
    }
  }
  return { errors, warnings };
}

/** Analyse a set of incoming observations against current data. Duplicates inside the batch are detected too. */
export function analyseObservations(records, { productIds, existing = [], currency = "EUR", now = Date.now() } = {}) {
  const valid = [], warned = [], invalid = [];
  const pool = [...existing];
  for (const raw of records) {
    const o = cleanObservation(raw, { currency });
    const { errors, warnings } = checkObservation(o, { productIds, existing: pool, currency, now });
    if (errors.length) invalid.push({ raw, errors });
    else { (warnings.length ? warned : valid).push(warnings.length ? { o, warnings } : o); pool.push(o); }
  }
  return { valid, warned, invalid };
}

export function cleanProduct(p, categories) {
  if (!p || typeof p !== "object") return null;
  const id = str(p.id, 60), name = str(p.name, 80);
  if (!id || !name) return null;
  const category = categories.some(c => c.id === p.category) ? p.category : "peripheral";
  const specs = {};
  const s = p.specs && typeof p.specs === "object" ? p.specs : {};
  if (["AM4", "AM5", "LGA1700", "LGA1851"].includes(s.socket)) specs.socket = s.socket;
  if (["DDR4", "DDR5"].includes(s.memType)) specs.memType = s.memType;
  for (const k of ["tdp", "watts", "vram", "pcieLanes"]) if (Number.isFinite(+s[k]) && +s[k] > 0 && +s[k] < 5000) specs[k] = +s[k];
  if (["ATX", "SFX", "SFX-L"].includes(s.formFactor)) specs.formFactor = s.formFactor;
  if (Array.isArray(s.sockets)) specs.sockets = s.sockets.filter(x => typeof x === "string").slice(0, 6);
  return { id, name, brand: str(p.brand, 40), category, specs, query: str(p.query, 80) || name, createdAt: Number.isFinite(+p.createdAt) ? +p.createdAt : Date.now() };
}

/** CSV helpers (RFC 4180 quoting). */
export function toCSV(rows, cols) {
  const q = v => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n");
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === "," || ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim()));
  if (!nonEmpty.length) return [];
  const head = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
