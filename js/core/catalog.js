// Categories, seed catalog and promo calendar.
// Seed prices are NOT live data: each carries its source, or is flagged as an estimate.

export const CATEGORIES = [
  { id: "gpu", label: "Cartes graphiques", short: "GPU", icon: "gpu" },
  { id: "cpu", label: "Processeurs", short: "CPU", icon: "cpu" },
  { id: "ram", label: "Mémoire RAM", short: "RAM", icon: "ram" },
  { id: "ssd", label: "SSD", short: "SSD", icon: "drive" },
  { id: "hdd", label: "Disques durs", short: "HDD", icon: "drive" },
  { id: "motherboard", label: "Cartes mères", short: "Carte mère", icon: "board" },
  { id: "psu", label: "Alimentations", short: "Alim", icon: "power" },
  { id: "case", label: "Boîtiers", short: "Boîtier", icon: "box" },
  { id: "cooling", label: "Refroidissement", short: "Refroid.", icon: "fan" },
  { id: "monitor", label: "Écrans", short: "Écran", icon: "monitor" },
  { id: "peripheral", label: "Périphériques", short: "Périph.", icon: "mouse" },
];
export const catById = id => CATEGORIES.find(c => c.id === id) || { id, label: id, short: id, icon: "box" };

export const RETAILERS = [
  { id: "ldlc", name: "LDLC", search: q => `https://www.ldlc.com/recherche/${encodeURIComponent(q)}/`, kind: "new", note: "Neuf, garantie 2 ans" },
  { id: "materiel", name: "Materiel.net", search: q => `https://www.materiel.net/recherche/${encodeURIComponent(q)}/`, kind: "new", note: "Neuf, garantie 2 ans" },
  { id: "amazon", name: "Amazon", search: q => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}`, kind: "new", note: "Préférer « vendu et expédié par Amazon »" },
  { id: "idealo", name: "Idealo", search: q => `https://www.idealo.fr/prechcat.html?q=${encodeURIComponent(q)}`, kind: "compare", note: "Comparateur avec historique" },
  { id: "dealabs", name: "Dealabs", search: q => `https://www.dealabs.com/search?q=${encodeURIComponent(q)}`, kind: "compare", note: "Bons plans vérifiés par la communauté" },
  { id: "leboncoin", name: "Leboncoin", search: q => `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(q)}`, kind: "used", note: "Occasion : main propre, test sur place" },
  { id: "backmarket", name: "Back Market", search: q => `https://www.backmarket.fr/fr-fr/search?q=${encodeURIComponent(q)}`, kind: "used", note: "Reconditionné avec garantie" },
];
export const retailerName = id => RETAILERS.find(r => r.id === id)?.name || id || "—";

const SRC = {
  cowcot: "https://www.cowcotland.com/news/103217/prix-des-cartes-graphiques-la-rtx-5090-perd-2840-euros-mais-les-autres-gpu-continuent-de-grimper.html",
  tlp: "https://www.touslesprix.com/comparer/fiche13412763.html",
};
const T_SRC = Date.UTC(2026, 10, 15, 12); // 15 nov. 2026
const T_EST = Date.UTC(2026, 10, 19, 12); // 19 nov. 2026

// specs only where the manufacturer data is well established
export const SEED_PRODUCTS = [
  { id: "rx9060xt", name: "Radeon RX 9060 XT 16 Go", brand: "AMD", category: "gpu", specs: { tdp: 160, vram: 16, pcieLanes: 16 }, query: "RX 9060 XT 16 Go" },
  { id: "rtx5060ti", name: "GeForce RTX 5060 Ti 16 Go", brand: "NVIDIA", category: "gpu", specs: { tdp: 180, vram: 16, pcieLanes: 8 }, query: "RTX 5060 Ti 16 Go" },
  { id: "r7_5800x3d", name: "Ryzen 7 5800X3D", brand: "AMD", category: "cpu", specs: { socket: "AM4", memType: "DDR4", tdp: 105 }, query: "Ryzen 7 5800X3D" },
  { id: "r7_5700x3d", name: "Ryzen 7 5700X3D", brand: "AMD", category: "cpu", specs: { socket: "AM4", memType: "DDR4", tdp: 105 }, query: "Ryzen 7 5700X3D" },
  { id: "ddr4_32", name: "DDR4 32 Go 3600 MHz (2×16)", brand: "Divers", category: "ram", specs: { memType: "DDR4" }, query: "DDR4 32 Go 3600 2x16" },
  { id: "ddr5_32", name: "DDR5 32 Go 6000 MHz (2×16)", brand: "Divers", category: "ram", specs: { memType: "DDR5" }, query: "DDR5 32 Go 6000 2x16" },
  { id: "aio240", name: "Watercooling AIO 240/280 mm", brand: "Divers", category: "cooling", specs: { sockets: ["AM4", "AM5"] }, query: "watercooling AIO 240 AM4 AM5" },
  { id: "psu750", name: "Alimentation 750 W 80+ Gold SFX", brand: "Divers", category: "psu", specs: { watts: 750, formFactor: "SFX" }, query: "alimentation 750W 80+ Gold SFX" },
  { id: "o11mini", name: "O11 Dynamic Mini", brand: "Lian Li", category: "case", specs: {}, query: "Lian Li O11 Dynamic Mini" },
  { id: "b450gpm", name: "B450 Gaming Plus MAX", brand: "MSI", category: "motherboard", specs: { socket: "AM4", memType: "DDR4" }, query: "MSI B450 Gaming Plus MAX" },
];

export const SEED_OBSERVATIONS = [
  { productId: "rx9060xt", price: 649.9, retailer: "", sourceUrl: SRC.cowcot, ts: T_SRC, method: "seed", status: "estimate", note: "Relevé presse Cowcotland" },
  { productId: "rtx5060ti", price: 800, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "r7_5800x3d", price: 359, retailer: "", sourceUrl: SRC.tlp, ts: T_SRC, method: "seed", status: "estimate", note: "Offres 335–399 € (Touslesprix)" },
  { productId: "r7_5700x3d", price: 300, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "ddr4_32", price: 200, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "ddr5_32", price: 420, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "aio240", price: 80, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "psu750", price: 130, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
  { productId: "o11mini", price: 120, retailer: "", sourceUrl: "", ts: T_EST, method: "seed", status: "estimate" },
];

export const SEED_WATCH = [
  { productId: "rx9060xt", target: 520, priority: "high" },
  { productId: "rtx5060ti", target: 650, priority: "medium" },
  { productId: "r7_5800x3d", target: 330, priority: "high" },
  { productId: "r7_5700x3d", target: 260, priority: "medium" },
  { productId: "ddr4_32", target: 150, priority: "medium" },
  { productId: "ddr5_32", target: 250, priority: "low" },
  { productId: "aio240", target: 65, priority: "medium" },
  { productId: "psu750", target: 110, priority: "low" },
  { productId: "o11mini", target: 100, priority: "low" },
];

// Promo calendar. "fixed" dates are legal/known; others are indicative.
export const EVENTS = [
  { id: "bf26", name: "Black Friday", start: "2026-11-27", end: "2026-11-27", sure: true, tip: "Promos souvent éphémères et sur peu de stock cette année. N'achète que sous ton prix cible." },
  { id: "cm26", name: "Cyber Monday", start: "2026-11-30", end: "2026-11-30", sure: true, tip: "Dernière chance de la semaine, utile pour l'alim, le boîtier, le refroidissement." },
  { id: "sh27", name: "Soldes d'hiver", start: "2027-01-13", end: "2027-02-09", sure: true, tip: "Dates légales : 2ᵉ mercredi de janvier, 4 semaines." },
  { id: "fd27", name: "French Days (printemps)", start: "2027-04-15", end: "2027-04-21", sure: false, tip: "Dates indicatives, à confirmer." },
  { id: "se27", name: "Soldes d'été", start: "2027-06-30", end: "2027-07-27", sure: false, tip: "Habituellement le dernier mercredi de juin, à confirmer." },
  { id: "pd27", name: "Prime Day", start: "2027-07-13", end: "2027-07-14", sure: false, tip: "Dates indicatives, à confirmer." },
  { id: "bf27", name: "Black Friday", start: "2027-11-26", end: "2027-11-26", sure: true, tip: "Lendemain de Thanksgiving." },
];
