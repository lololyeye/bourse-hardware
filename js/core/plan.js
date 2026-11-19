// Budget schedule + configuration totals and compatibility — pure.
import { DAY } from "./format.js";

/** Cost of a plan item. fixedPrice overrides tracked prices. Unknown prices are reported, never guessed. */
export function itemCost(item, priceOf) {
  if (item.fixedPrice != null) return { cost: item.fixedPrice + (item.extra || 0), known: true, missing: [] };
  let cost = item.extra || 0; const missing = [];
  for (const pid of item.productIds) { const p = priceOf(pid); if (p == null) missing.push(pid); else cost += p; }
  return { cost, known: missing.length === 0, missing };
}

export function safetyTarget(b) { return Math.max(0, (b.fixed || 0) + (b.life || 0)); }

/**
 * Month-by-month plan. Month 0 = next month (first pay after today).
 * PC fund = savings above the safety target + pcMonthly per month + resale of replaced parts.
 */
export function schedule(budget, priceOf, now = Date.now(), horizon = 48) {
  const target = safetyTarget(budget);
  const pcStart = Math.max(0, (budget.saved || 0) - target);
  const base = new Date(now); const m0 = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  let spent = 0, income = 0, k = 0, total = 0, resaleTotal = 0, unknown = 0;
  const items = budget.plan.map(item => {
    const c = itemCost(item, priceOf);
    if (item.done) return { ...item, ...c, month: null, date: null, left: null, status: "done" };
    if (!c.known && item.fixedPrice == null && c.cost === (item.extra || 0)) unknown++;
    while (k < horizon && pcStart + budget.pcMonthly * (k + 1) + income - spent < c.cost) k++;
    const left = pcStart + budget.pcMonthly * (k + 1) + income - spent - c.cost;
    spent += c.cost; total += c.cost;
    const resale = budget.countResale ? item.resale || 0 : 0;
    income += resale; resaleTotal += resale;
    const date = k >= horizon ? null : new Date(m0.getFullYear(), m0.getMonth() + k, 1);
    return { ...item, ...c, month: k >= horizon ? null : k, date, left: k >= horizon ? null : left, status: k >= horizon ? "unreachable" : "planned", resaleCounted: resale };
  });
  const last = items.filter(i => i.status === "planned").at(-1);
  return { items, total, resale: resaleTotal, net: total - resaleTotal, end: last?.date || null, pcStart, safetyTarget: target, unknown, reachable: !items.some(i => i.status === "unreachable") };
}
export const daysUntil = (date, now = Date.now()) => (date ? (date.getTime() - now) / DAY : null);

export const SLOTS = [
  { id: "cpu", label: "Processeur", cat: "cpu" }, { id: "gpu", label: "Carte graphique", cat: "gpu" },
  { id: "motherboard", label: "Carte mère", cat: "motherboard" }, { id: "ram", label: "Mémoire", cat: "ram" },
  { id: "storage", label: "Stockage", cat: ["ssd", "hdd"] }, { id: "psu", label: "Alimentation", cat: "psu" },
  { id: "case", label: "Boîtier", cat: "case" }, { id: "cooling", label: "Refroidissement", cat: "cooling" },
  { id: "monitor", label: "Écran", cat: "monitor" },
];

/** d: productId → { product, st:{cur, first}, watch } */
export function configTotals(cfg, d) {
  let current = 0, target = 0, first = 0, missing = [], targetMissing = 0, count = 0;
  for (const s of SLOTS) {
    const pid = cfg.parts[s.id];
    if (!pid || cfg.owned[s.id]) continue;
    count++;
    const x = d(pid);
    if (!x || x.st.cur == null) { missing.push(s.label); continue; }
    current += x.st.cur; first += x.st.first.price;
    if (x.watch?.target) target += x.watch.target; else { target += x.st.cur; targetMissing++; }
  }
  return { current, target, variation: first ? (current - first) / first * 100 : null, missing, targetMissing, count, remaining: cfg.budget ? cfg.budget - current : null };
}

/** Only checks backed by stored specs. Missing data → "unknown", never "ok". */
export function compatibility(cfg, productOf) {
  const g = k => (cfg.parts[k] ? productOf(cfg.parts[k]) : null);
  const cpu = g("cpu"), mb = g("motherboard"), ram = g("ram"), gpu = g("gpu"), psu = g("psu"), cool = g("cooling");
  const out = [];
  const add = (level, text) => out.push({ level, text });
  if (cpu && mb) {
    if (cpu.specs?.socket && mb.specs?.socket) add(cpu.specs.socket === mb.specs.socket ? "ok" : "error", `Socket processeur ${cpu.specs.socket} / carte mère ${mb.specs.socket}`);
    else add("unknown", "Socket non renseigné : compatibilité processeur / carte mère non vérifiée");
  }
  if (ram && (mb || cpu)) {
    const want = mb?.specs?.memType || cpu?.specs?.memType;
    if (ram.specs?.memType && want) add(ram.specs.memType === want ? "ok" : "error", `Mémoire ${ram.specs.memType}, la plateforme attend de la ${want}`);
    else add("unknown", "Type de mémoire non renseigné : non vérifié");
  }
  if (cool && cpu) {
    if (Array.isArray(cool.specs?.sockets) && cpu.specs?.socket) add(cool.specs.sockets.includes(cpu.specs.socket) ? "ok" : "error", `Fixations du refroidissement : ${cool.specs.sockets.join(", ")}`);
    else add("unknown", "Fixations du refroidissement non renseignées : non vérifié");
  }
  if (psu && (cpu || gpu)) {
    const cpuT = cpu?.specs?.tdp, gpuT = gpu?.specs?.tdp, w = psu.specs?.watts;
    if (w && (cpu ? cpuT : true) && (gpu ? gpuT : true)) {
      const draw = (cpuT || 0) + (gpuT || 0) + 75;
      const ratio = w / draw;
      add(ratio >= 1.5 ? "ok" : ratio >= 1.2 ? "warn" : "error", `Alimentation ${w} W pour ~${draw} W estimés (TDP fabricant + 75 W pour le reste)`);
    } else add("unknown", "Puissance ou TDP non renseigné : dimensionnement de l'alimentation non vérifié");
  }
  if (psu?.specs?.formFactor && g("case")) add("unknown", `Alimentation au format ${psu.specs.formFactor} : vérifie que ton boîtier l'accepte (format non renseigné pour le boîtier)`);
  return out;
}
