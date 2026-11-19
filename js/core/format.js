// Formatting helpers — pure, no DOM.
export const DAY = 864e5;

const nfCache = new Map();
export function fmtPrice(n, currency = "EUR", { decimals = 0 } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  const k = currency + decimals;
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: decimals, minimumFractionDigits: decimals }));
  return nfCache.get(k).format(n);
}
export function fmtNum(n, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function fmtPct(n, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s + " %";
}
export function fmtDate(ts, format = "fr", { time = false } = {}) {
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  if (format === "iso") {
    const p = n => String(n).padStart(2, "0");
    const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return time ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
  }
  if (format === "relative") return fmtAgo(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export function fmtAgo(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return "jamais";
  const s = Math.round((now - ts) / 1000);
  if (s < 0) return "dans le futur";
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24); if (d < 31) return `il y a ${d} j`;
  const mo = Math.round(d / 30.44); if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.round(mo / 12)} an${mo >= 24 ? "s" : ""}`;
}
export function monthLabel(date) {
  const s = date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return s[0].toUpperCase() + s.slice(1);
}
export const uid = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
