"use strict";
const KEY = "bourse-hardware-v1";
const DAY = 864e5;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const eur = n => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = n => (n > 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + " %";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Catalogue (prix de départ = estimations de mi-novembre 2026) ---------- */
const CATALOG = [
  { id: "rx9060xt", name: "RX 9060 XT 16 Go", cat: "Carte graphique", price: 650, target: 520, outlook: "up", est: false,
    why: "Remontée de 575 € à 650 € en quelques semaines. AMD relève ses prix (~10 %) à cause de la pénurie de mémoire : peu de chances de vraie baisse avant 2027.", q: "RX 9060 XT 16 Go" },
  { id: "rtx5060ti", name: "RTX 5060 Ti 16 Go", cat: "Carte graphique", price: 800, target: 650, outlook: "up", est: false,
    why: "≈150 € de plus que la RX 9060 XT. À prendre seulement si elle passe au même prix : meilleur DLSS et ray tracing.", q: "RTX 5060 Ti 16 Go" },
  { id: "r7_5800x3d", name: "Ryzen 7 5800X3D", cat: "Processeur", price: 359, target: 330, outlook: "flat", est: false,
    why: "Offres entre 335 € et 399 € selon les boutiques. Meilleur processeur gaming possible sur ta B450, prix assez stable.", q: "Ryzen 7 5800X3D" },
  { id: "r7_5700x3d", name: "Ryzen 7 5700X3D", cat: "Processeur", price: 300, target: 260, outlook: "flat", est: true,
    why: "Un peu moins rapide que le 5800X3D, devient rare en neuf. Prends le moins cher des deux.", q: "Ryzen 7 5700X3D" },
  { id: "ddr4_32", name: "DDR4 32 Go 3600", cat: "RAM · 2×16", price: 200, target: 150, outlook: "up", est: true,
    why: "La DDR4 n'est plus produite en masse et suit la hausse de la DDR5. Les kits d'occasion sont le meilleur compromis.", q: "DDR4 32 Go 3600 2x16" },
  { id: "ddr5_32", name: "DDR5 32 Go 6000", cat: "RAM · 2×16", price: 420, target: 250, outlook: "up", est: true,
    why: "≈2× le prix de la DDR4. Pas de retour à la normale annoncé avant 2028 : pas de DDR5 tant que tu restes sur AM4.", q: "DDR5 32 Go 6000 2x16" },
  { id: "aio240", name: "AIO 240/280 mm", cat: "Refroidissement", price: 80, target: 65, outlook: "flat", est: true,
    why: "Marché stable. Prends un modèle livré avec les fixations AM4 et AM5.", q: "watercooling AIO 240 AM5 AM4" },
  { id: "psu750", name: "Alim 750 W Gold SFX", cat: "Alimentation", price: 130, target: 110, outlook: "flat", est: true,
    why: "Format SFX ou SFX-L obligatoire si ton O11 Dynamic Mini est la version d'origine.", q: "alimentation 750W 80+ Gold SFX" },
  { id: "o11mini", name: "Lian Li O11 Dynamic Mini", cat: "Boîtier", price: 120, target: 100, outlook: "flat", est: true,
    why: "Déjà prévu dans ton plan à 30 €.", q: "Lian Li O11 Dynamic Mini" },
];
const RETAILERS = [
  { n: "LDLC", u: q => `https://www.ldlc.com/recherche/${encodeURIComponent(q)}/`, t: "Neuf, garantie 2 ans" },
  { n: "Materiel.net", u: q => `https://www.materiel.net/recherche/${encodeURIComponent(q)}/`, t: "Neuf, garantie 2 ans" },
  { n: "Amazon", u: q => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}`, t: "Choisis « vendu et expédié par Amazon »" },
  { n: "Idealo", u: q => `https://www.idealo.fr/prechcat.html?q=${encodeURIComponent(q)}`, t: "Comparateur + historique" },
  { n: "Dealabs", u: q => `https://www.dealabs.com/search?q=${encodeURIComponent(q)}`, t: "Bons plans vérifiés par la communauté" },
  { n: "Leboncoin", u: q => `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(q)}`, t: "Occasion : main propre, test sur place", used: true },
];
const EVENTS = [
  { n: "Black Friday", d: "2026-11-27", e: "2026-11-27", tip: "Relevés toujours hauts cette année : promos éphémères et sur peu de stock. N'achète que sous ton prix cible." },
  { n: "Cyber Monday", d: "2026-11-30", e: "2026-11-30", tip: "Dernière chance de la semaine. Utile pour l'alim, le boîtier, l'AIO, les ventilos." },
  { n: "Soldes d'hiver", d: "2027-01-13", e: "2027-02-09", tip: "Date légale (2ᵉ mercredi de janvier, 4 semaines). Tombe pile sur ton achat de carte graphique." },
  { n: "French Days", d: "2027-04-15", e: "2027-04-21", tip: "Date indicative, à confirmer. Deuxième chance pour la RAM ou le CPU." },
  { n: "Prime Day", d: "2027-07-13", e: "2027-07-14", tip: "Date indicative, à confirmer. Seulement s'il te reste des pièces à acheter." },
];

/* ---------- État ---------- */
const defState = () => ({
  prods: Object.fromEntries(CATALOG.map(p => [p.id, { target: p.target, hist: [{ t: Date.now(), p: p.price, src: "estimation" }] }])),
  alerts: [], flags: {}, settings: { drop: 5, rise: 5 },
  budget: { net: 2200, fixed: 900, life: 600, saved: 0, pc: 450 },
  plan: { gpuFirst: false, resale: true, prices: {}, resaleVal: { gtx: 80, cpu: 80, ram: 40 }, done: {} },
  lastReleve: null,
});
let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  const d = defState();
  if (!S || typeof S !== "object") S = d;
  S.prods ||= d.prods; CATALOG.forEach(p => { S.prods[p.id] ||= d.prods[p.id]; });
  S.settings = { ...d.settings, ...S.settings };
  S.budget = { ...d.budget, ...S.budget };
  S.plan = { ...d.plan, ...S.plan };
  S.alerts ||= []; S.flags ||= {};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 3200); }

/* ---------- Analyse ---------- */
const prod = id => CATALOG.find(x => x.id === id);
const hist = id => [...S.prods[id].hist].sort((a, b) => a.t - b.t);
const real = id => hist(id).at(-1).src !== "estimation";
function stats(id) {
  const h = hist(id), cur = h.at(-1).p, prev = h.length > 1 ? h.at(-2).p : null;
  const ref30 = h.filter(x => x.t >= Date.now() - 30 * DAY)[0] || h[0];
  const ps = h.map(x => x.p);
  return {
    h, cur, prev, n: h.length,
    dPrev: prev ? (cur - prev) / prev * 100 : 0,
    d30: h.length > 1 ? (cur - ref30.p) / ref30.p * 100 : 0,
    min: Math.min(...ps), max: Math.max(...ps), avg: ps.reduce((a, b) => a + b, 0) / ps.length,
  };
}
function signal(p) {
  const s = stats(p.id), target = S.prods[p.id].target;
  if (s.cur <= target) return { cls: "buy", label: "ACHETER", note: `Sous ton prix cible (${eur(target)}).` };
  if (p.outlook === "up" && s.cur <= target * 1.15) return { cls: "rush", label: "ACHETER VITE", note: "Proche de ta cible et le marché est en hausse : n'attends pas trop." };
  if (s.n >= 3 && s.cur <= s.min && s.d30 < -3) return { cls: "buy", label: "PLUS BAS", note: "Plus bas de tes relevés." };
  if (s.n >= 3 && s.dPrev <= -S.settings.drop) return { cls: "watch", label: "EN BAISSE", note: "Belle baisse récente : attends 1 ou 2 relevés pour voir si elle continue." };
  if (p.outlook === "up") return { cls: "wait", label: "CHER · HAUSSE", note: "Au-dessus de ta cible, mais ça ne baissera sans doute pas vite : décide selon ton budget." };
  return { cls: "watch", label: "SURVEILLER", note: `${eur(s.cur - target)} au-dessus de ta cible.` };
}
function spark(id, w = 130, h = 34, big = false) {
  const H = hist(id), ps = H.map(x => x.p);
  if (H.length < 2) return `<svg class="spark${big ? " big" : ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="2" x2="${w - 2}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line2)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/></svg>`;
  const min = Math.min(...ps), max = Math.max(...ps), span = max - min || 1;
  const t0 = H[0].t, tt = H.at(-1).t - t0 || 1;
  const pts = H.map(x => [2 + (x.t - t0) / tt * (w - 4), h - 3 - (x.p - min) / span * (h - 6)]);
  const c = ps.at(-1) > ps[0] ? "var(--up)" : ps.at(-1) < ps[0] ? "var(--down)" : "var(--mut)";
  const line = pts.map(p => p.join(",")).join(" ");
  const gid = "g" + id + (big ? "b" : "");
  return `<svg class="spark${big ? " big" : ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${pts[0][0]},${h} ${line} ${pts.at(-1)[0]},${h}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${c}" stroke-width="${big ? 2.2 : 1.8}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const chg = (v, has) => !has ? `<span class="chg flat">—</span>` : `<span class="chg ${v > 0 ? "up" : v < 0 ? "down" : "flat"}">${v > 0 ? "▲" : v < 0 ? "▼" : "•"} ${pct(v)}</span>`;

/* ---------- Plan (calcul partagé) ---------- */
function planItems() {
  const P = id => stats(id).cur, ov = S.plan.prices;
  const base = [
    { k: "case", n: "Boîtier + alim", sub: "Déjà prévu", c: 30 },
    { k: "gpu", n: "RX 9060 XT 16 Go", sub: "Carte graphique", c: P("rx9060xt"), id: "rx9060xt", sell: "gtx", sellN: "GTX 1650" },
    { k: "cpu", n: "Ryzen 7 5800X3D + AIO", sub: "Processeur + refroidissement", c: P("r7_5800x3d") + P("aio240"), id: "r7_5800x3d", sell: "cpu", sellN: "Ryzen 5 3600" },
    { k: "ram", n: "DDR4 32 Go + ventilos", sub: "Mémoire", c: P("ddr4_32") + 50, id: "ddr4_32", sell: "ram", sellN: "16 Go DDR4" },
  ];
  base.forEach(i => { if (ov[i.k] != null) i.c = ov[i.k]; });
  if (S.plan.gpuFirst) base.unshift(base.splice(1, 1)[0]);
  return base;
}
function schedule() {
  const b = S.budget, rv = S.plan.resaleVal;
  let spent = 0, income = 0, kPrev = 0, total = 0;
  const items = planItems().map(it => {
    let k = kPrev;
    while (k < 36 && b.saved + b.pc * (k + 1) + income - spent < it.c) k++;
    const left = b.saved + b.pc * (k + 1) + income - spent - it.c;
    spent += it.c; total += it.c; kPrev = k;
    const sellVal = S.plan.resale && it.sell ? rv[it.sell] : 0;
    income += sellVal;
    return { ...it, k, left, sellVal };
  });
  return { items, total, income, end: kPrev };
}
function monthLabel(k) {
  if (k >= 36) return "Hors budget";
  const d = new Date(2026, 11 + k, 1), m = d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return m[0].toUpperCase() + m.slice(1);
}
function nextEvent() {
  const now = Date.now();
  return EVENTS.map(e => ({ ...e, s: new Date(e.d + "T00:00"), en: new Date(e.e + "T23:59") }))
    .find(e => e.en >= now);
}
const daysTo = d => Math.ceil((d - Date.now()) / DAY);

/* ---------- Marché ---------- */
function renderTicker() {
  const items = CATALOG.map(p => { const s = stats(p.id); const c = s.dPrev; return `<span class="t"><b>${esc(p.name)}</b>${eur(s.cur)} <span class="${c > 0 ? "up" : c < 0 ? "down" : "muted"}">${c > 0 ? "▲" : c < 0 ? "▼" : "•"} ${s.n > 1 ? pct(c) : "0,0 %"}</span></span>`; }).join("");
  $("#ticker").innerHTML = `<div class="track">${items}${items}</div>`;
}
function marketIndex() {
  let a = 0, b = 0;
  CATALOG.forEach(p => { const h = hist(p.id); a += h.at(-1).p; b += h[0].p; });
  return { v: a / b * 100, d: (a / b - 1) * 100 };
}
function renderMood() {
  const ix = marketIndex(), ups = CATALOG.filter(p => p.outlook === "up").length;
  const el = $("#mood");
  if (Math.abs(ix.d) >= 1) { el.className = "pill " + (ix.d > 0 ? "hot" : "cool"); el.textContent = ix.d > 0 ? "▲ Marché en hausse" : "▼ Marché en baisse"; }
  else { el.className = "pill " + (ups >= 4 ? "hot" : "flat"); el.textContent = ups >= 4 ? "▲ Tendance haussière" : "• Marché stable"; }
}
function renderKpis() {
  const ix = marketIndex(), under = CATALOG.filter(p => stats(p.id).cur <= S.prods[p.id].target).length;
  const sc = schedule(), nx = sc.items.find(i => !S.plan.done[i.k]), ev = nextEvent();
  const evTxt = ev ? (ev.s <= Date.now() ? "En cours" : "J-" + daysTo(ev.s)) : "—";
  $("#kpis").innerHTML = `
    <div class="kpi"><div class="l">Indice HW-9 <span class="muted">· base 100</span></div><div class="v">${ix.v.toFixed(1).replace(".", ",")}</div><div class="s">${chg(ix.d, true)} depuis ton 1er relevé</div></div>
    <div class="kpi"><div class="l">Sous ton prix cible</div><div class="v">${under}<span class="muted" style="font-size:16px"> / ${CATALOG.length}</span></div><div class="s">${under ? "Regarde les signaux ACHETER" : "Rien d'urgent à acheter"}</div></div>
    <div class="kpi accent"><div class="l">Prochain achat</div><div class="v">${nx ? monthLabel(nx.k) : "Terminé 🎉"}</div><div class="s">${nx ? esc(nx.n) + " · " + eur(nx.c) : "Toutes les pièces sont achetées"}</div></div>
    <div class="kpi"><div class="l">Prochaine fenêtre promo</div><div class="v">${evTxt}</div><div class="s">${ev ? esc(ev.n) + " · " + ev.s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</div></div>`;
}
function todos() {
  const out = [], sc = schedule(), now = Date.now();
  const lr = S.lastReleve;
  if (!lr || now - lr > 7 * DAY) out.push({ c: "warn", i: "📝", t: lr ? "Relevé en retard" : "Fais ton premier relevé", d: lr ? `Dernier il y a ${Math.floor((now - lr) / DAY)} jours. 30 secondes pour garder les tendances à jour.` : "Les prix de départ sont des estimations : remplace-les par ce que tu vois en boutique.", go: "releve" });
  const nx = sc.items.find(i => !S.plan.done[i.k]);
  if (nx) {
    const sig = nx.id ? signal(prod(nx.id)) : null, k0 = new Date(2026, 11 + nx.k, 1);
    const ready = nx.k < 36 && k0 <= now + 15 * DAY;
    out.push({ c: ready ? "buy" : "info", i: "🛒", t: `${ready ? "À acheter maintenant" : "Prochain achat"} : ${nx.n}`, d: `${eur(nx.c)} · ${nx.k >= 36 ? "pas finançable avec ton budget actuel" : "faisable dès " + monthLabel(nx.k)}${sig ? " · signal " + sig.label.toLowerCase() : ""}.`, go: "plan" });
  }
  CATALOG.filter(p => stats(p.id).cur <= S.prods[p.id].target).forEach(p => out.push({ c: "buy", i: "🎯", t: `${p.name} sous ta cible`, d: `${eur(stats(p.id).cur)} (cible ${eur(S.prods[p.id].target)}). Achète si c'est dans ton plan et ton budget.` }));
  if (real("rtx5060ti") && stats("rtx5060ti").cur <= stats("rx9060xt").cur) out.push({ c: "buy", i: "🟢", t: "Prends la RTX 5060 Ti 16 Go", d: "Elle est au prix de la RX 9060 XT ou moins." });
  const ev = nextEvent();
  if (ev && daysTo(ev.s) <= 14) out.push({ c: "hot", i: "🏷️", t: ev.s <= now ? `${ev.n} en cours` : `${ev.n} dans ${daysTo(ev.s)} jours`, d: ev.tip, go: "timing" });
  const b = S.budget, buf = b.fixed + b.life;
  if (b.saved < buf) out.push({ c: "warn", i: "🛟", t: "Construis ton matelas de sécurité", d: `${eur(b.saved)} sur ${eur(buf)} conseillés. Mets un peu de côté chaque mois en plus du PC.`, go: "plan" });
  return out;
}
function renderTodo() {
  $("#todo").innerHTML = todos().map(x => `<li class="${x.c}"><span class="ic">${x.i}</span><div><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div>${x.go ? `<button class="btn sm go" data-go="${x.go}">${x.go === "releve" ? "Relever" : "Voir"}</button>` : ""}</li>`).join("");
  $$("[data-go]").forEach(b => b.onclick = () => b.dataset.go === "releve" ? openReleve() : showTab(b.dataset.go));
}
let openRow = null;
function renderMarket() {
  const head = `<div class="wr wh" role="row"><span>Composant</span><span>Dernier</span><span>Var.</span><span>Tendance</span><span>Cible</span><span>Signal</span><span></span></div>`;
  $("#cards").innerHTML = head + CATALOG.map(p => {
    const s = stats(p.id), g = signal(p), tgt = S.prods[p.id].target, o = openRow === p.id;
    return `<div class="wr ${o ? "open" : ""}" role="row" data-row="${p.id}" tabindex="0" aria-expanded="${o}">
      <span class="nm"><b>${esc(p.name)}</b><small>${esc(p.cat)}</small></span>
      <span class="px">${eur(s.cur)}${p.est && !real(p.id) ? "<em>estim.</em>" : ""}</span>
      <span class="ch">${chg(s.dPrev, s.n > 1)}</span>
      <span class="sp">${spark(p.id)}</span>
      <span class="tg gap">${eur(tgt)}</span>
      <span class="sg"><span class="sig ${g.cls}">${g.label}</span></span>
      <span class="chev">▶</span>
    </div>
    <div class="wd ${o ? "open" : ""}">
      <div><p><b>${g.note}</b></p><p>${esc(p.why)}</p>
        <div class="shops">${RETAILERS.map(r => `<a target="_blank" rel="noopener" href="${r.u(p.q)}" title="${r.t}" class="${r.used ? "used" : ""}">${r.n}${r.used ? " · occasion" : ""}</a>`).join("")}</div></div>
      <div><p class="small">Min ${eur(s.min)} · Moy ${eur(s.avg)} · Max ${eur(s.max)} · ${s.n} relevé${s.n > 1 ? "s" : ""}</p>
        <div class="row" style="margin-top:12px"><button class="btn sm" data-set="${p.id}">Régler la cible / historique</button></div></div>
    </div>`;
  }).join("");
  $$("[data-row]").forEach(r => {
    const t = () => { openRow = openRow === r.dataset.row ? null : r.dataset.row; renderMarket(); };
    r.onclick = t; r.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t(); } };
  });
  $$("[data-set]").forEach(b => b.onclick = () => openProd(b.dataset.set));
  const lr = S.lastReleve;
  $("#lastReleve").textContent = lr ? `Dernier relevé ${new Date(lr).toLocaleDateString("fr-FR")}` : "Aucun relevé";
}
function openProd(id) {
  const p = prod(id), s = stats(id);
  $("#pTitle").textContent = p.name;
  $("#pBody").innerHTML = `${spark(id, 400, 150, true)}
    <div class="mini"><div><span>Actuel</span><b>${eur(s.cur)}</b></div><div><span>Min</span><b>${eur(s.min)}</b></div><div><span>Moy.</span><b>${eur(s.avg)}</b></div><div><span>Max</span><b>${eur(s.max)}</b></div></div>
    <div class="form"><label>Prix cible (alerte en dessous)<input type="number" id="tgt" value="${S.prods[id].target}"></label>
    <label>Nouveau relevé<div class="row" style="flex-wrap:nowrap"><input type="number" id="newP" placeholder="€"><button id="addP" class="btn primary">Ajouter</button></div></label></div>
    <table class="hist"><tbody>${s.h.slice().reverse().map(x => `<tr><td>${new Date(x.t).toLocaleDateString("fr-FR")} <span class="muted small">${x.src || ""}</span></td><td>${eur(x.p)}</td><td>${s.n > 1 ? `<button data-del="${x.t}" title="Supprimer">✕</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
  $("#tgt").onchange = e => { S.prods[id].target = +e.target.value || 0; save(); renderAll(); };
  $("#addP").onclick = e => { e.preventDefault(); const v = +$("#newP").value; if (v > 0) { addPoint(id, v); finishReleve(); openProd(id); toast("Relevé ajouté"); } };
  $$("[data-del]", $("#pBody")).forEach(b => b.onclick = e => { e.preventDefault(); S.prods[id].hist = S.prods[id].hist.filter(x => x.t !== +b.dataset.del); save(); renderAll(); openProd(id); });
  if (!$("#dlgProd").open) $("#dlgProd").showModal();
}

/* ---------- Relevés, alertes, rappels ---------- */
function pushAlert(type, text) {
  S.alerts.unshift({ id: Date.now() + Math.random(), t: Date.now(), type, text, read: false });
  S.alerts = S.alerts.slice(0, 100);
  if ("Notification" in window && Notification.permission === "granted") { try { new Notification("Bourse du Hardware", { body: text }); } catch {} }
}
function addPoint(id, price) {
  const p = prod(id), prev = stats(id).cur, tgt = S.prods[id].target;
  S.prods[id].hist.push({ t: Date.now(), p: price, src: "relevé" });
  const d = (price - prev) / prev * 100;
  if (d <= -S.settings.drop) pushAlert("drop", `📉 Baisse importante : ${p.name} ${eur(prev)} → ${eur(price)} (${pct(d)}). ${price <= tgt ? "Sous ton prix cible : bon moment pour acheter." : "Pas encore sous ta cible, surveille."}`);
  else if (d >= S.settings.rise) pushAlert("rise", `📈 Hausse : ${p.name} ${eur(prev)} → ${eur(price)} (${pct(d)}). ${p.outlook === "up" ? "Le marché monte : ne traîne pas si tu en as besoin." : "Attends un peu si tu n'es pas pressé."}`);
  if (price <= tgt && prev > tgt) pushAlert("target", `🎯 ${p.name} est passé sous ton prix cible : ${eur(price)} (cible ${eur(tgt)}).`);
}
function crossAlerts() {
  const g = id => stats(id).cur;
  [
    [real("rtx5060ti") && g("rtx5060ti") <= g("rx9060xt"), "nv", "🟢 La RTX 5060 Ti 16 Go est au prix de la RX 9060 XT 16 Go ou moins : prends la Nvidia."],
    [real("r7_5700x3d") && g("r7_5700x3d") < g("r7_5800x3d") - 40, "cpu", "🟢 Le 5700X3D est nettement moins cher que le 5800X3D : prends-le, la différence de perf est faible."],
    [real("ddr5_32") && real("ddr4_32") && g("ddr5_32") <= g("ddr4_32") * 1.5, "ddr5", "🟢 L'écart DDR5/DDR4 passe sous 50 % : l'AM5 devient à étudier (voir Configs)."],
  ].forEach(([ok, k, txt]) => { if (ok && !S.flags[k]) { S.flags[k] = 1; pushAlert("target", txt); } if (!ok) S.flags[k] = 0; });
}
function reminders() {
  const now = Date.now();
  EVENTS.forEach(e => {
    const s = new Date(e.d + "T00:00"), dd = daysTo(s), key = "ev_" + e.d;
    if (dd <= 7 && dd >= 0 && !S.flags[key]) { S.flags[key] = 1; pushAlert("remind", `🏷️ ${e.n} ${dd === 0 ? "aujourd'hui" : `dans ${dd} jour${dd > 1 ? "s" : ""}`} : fais un relevé la veille pour comparer aux vrais prix promo.`); }
  });
  const lr = S.lastReleve, week = Math.floor(now / (7 * DAY));
  if (lr && now - lr > 7 * DAY && S.flags.relWeek !== week) { S.flags.relWeek = week; pushAlert("remind", `📝 Ton dernier relevé date de ${Math.floor((now - lr) / DAY)} jours. Mets les prix à jour pour garder des alertes fiables.`); }
  save();
}
function finishReleve() { crossAlerts(); S.lastReleve = Date.now(); save(); renderAll(); }
function renderAlerts() {
  const un = S.alerts.filter(a => !a.read).length;
  $("#badge").hidden = !un; $("#badge").textContent = un;
  document.title = (un ? `(${un}) ` : "") + "Bourse du Hardware";
  $("#s_drop").value = S.settings.drop; $("#s_rise").value = S.settings.rise;
  $("#feed").innerHTML = S.alerts.length ? `<div class="feed">${S.alerts.map(a => `<div class="item ${a.type} ${a.read ? "" : "unread"}">${esc(a.text)}<time>${new Date(a.t).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</time></div>`).join("")}</div>`
    : `<div class="empty">Aucune alerte. Elles arrivent quand un relevé baisse, monte, passe sous ta cible, ou quand une promo approche.</div>`;
}
function openReleve() {
  $("#releveFields").innerHTML = CATALOG.map(p => `<div class="rf"><label for="r_${p.id}">${esc(p.name)}<small>dernier ${eur(stats(p.id).cur)} · cible ${eur(S.prods[p.id].target)}</small></label><input id="r_${p.id}" type="number" min="1" step="1" inputmode="numeric" data-r="${p.id}" placeholder="€"></div>`).join("");
  $("#dlgReleve").showModal();
}

/* ---------- Budget & plan ---------- */
function renderBudget() {
  const b = S.budget;
  ["net", "fixed", "life", "saved", "pc"].forEach(k => { const i = $("#b_" + k); if (document.activeElement !== i) i.value = b[k]; });
  const left = b.net - b.fixed - b.life, afterPc = left - b.pc, share = b.net ? b.pc / b.net * 100 : 0;
  const buffer = b.fixed + b.life, bufPct = buffer ? Math.min(100, b.saved / buffer * 100) : 100;
  let warn = "";
  if (afterPc < 0) warn += `<div class="callout bad"><span>Tu dépenses ${eur(-afterPc)} de plus que ce qui reste après tes charges. Baisse le budget PC.</span></div>`;
  else if (share > 25) warn += `<div class="callout bad"><span>${share.toFixed(0)} % de ton salaire dans le PC, c'est beaucoup. Vise 20 à 25 % maximum.</span></div>`;
  if (b.saved < buffer) {
    const put = Math.max(0, Math.min(150, afterPc)), months = put ? Math.ceil((buffer - b.saved) / put) : null;
    warn += `<div class="callout warn"><span><b>Pas encore de matelas de sécurité.</b> Vire ${eur(put)} par mois sur un livret le jour de la paie${months ? `, il sera plein dans ~${months} mois` : ""}. Une panne ou une facture imprévue ne doit jamais te forcer à revendre ton matériel.</span></div>`;
  }
  $("#budgetOut").innerHTML = `<div class="kpirow"><div><span class="l">Reste après charges</span><b>${eur(left)}</b></div><div><span class="l">Budget PC · ${share.toFixed(0)} %</span><b>${eur(b.pc)}</b></div><div><span class="l">Libre après PC</span><b class="${afterPc < 0 ? "up" : ""}">${eur(afterPc)}</b></div></div>
    <div class="small muted" style="margin-top:12px">Matelas de sécurité · ${eur(b.saved)} / ${eur(buffer)} (1 mois de dépenses)</div><div class="meter ${bufPct < 30 ? "bad" : ""}"><i style="width:${bufPct}%"></i></div>${warn}
    <p class="muted small" style="margin:10px 0 0">Charges fixes et vie courante sont des valeurs par défaut : mets tes vrais chiffres.</p>`;
}
function renderPlan() {
  $("#gpuFirst").checked = S.plan.gpuFirst; $("#resale").checked = S.plan.resale;
  const sc = schedule(), rv = S.plan.resaleVal;
  const rows = sc.items.map((it, i) => `<li class="${S.plan.done[it.k] ? "done" : ""}">
      <button class="n" data-done="${it.k}" title="Marquer comme acheté" aria-pressed="${!!S.plan.done[it.k]}">${S.plan.done[it.k] ? "✓" : i + 1}</button>
      <div class="what"><b>${esc(it.n)}</b><small>${esc(it.sub)}${it.sellVal ? ` · revends ta ${esc(it.sellN)} <input type="number" data-sell="${it.sell}" value="${rv[it.sell]}" aria-label="Prix de revente"> €` : ""}</small></div>
      <div class="meta"><span class="cost"><input type="number" data-price="${it.k}" value="${Math.round(it.c)}" aria-label="Prix"></span>
        <span class="when"><b>${monthLabel(it.k)}</b><small>reste ${eur(it.left)}</small></span></div>
    </li>`).join("");
  $("#planOut").innerHTML = `<div class="panel"><ol class="steps">${rows}</ol>
    <div class="kpirow" style="border-top:1px solid var(--line);padding-top:14px"><div><span class="l">Total</span><b>${eur(sc.total)}</b></div><div><span class="l">Revente</span><b class="down">${sc.income ? "−" + eur(sc.income) : "0 €"}</b></div><div><span class="l">Coût réel</span><b>${eur(sc.total - sc.income)}</b></div><div><span class="l">PC terminé</span><b>${monthLabel(sc.end)}</b></div></div>
    <p class="note">${S.plan.gpuFirst ? "<b>Carte graphique d'abord :</b> c'est elle qui apporte le plus de FPS. Elle se branche sur ta carte mère actuelle et ton alim 650 W suffit pour une 9060 XT : ton PC marche entre chaque étape. Revends la GTX 1650 tout de suite, ça finance la suite." : "<b>Ordre du plan d'origine :</b> boîtier, carte graphique, processeur, RAM. Coche « Carte graphique d'abord » pour voir l'autre ordre."} Le 5800X3D est vendu sans ventirad : achète l'AIO en même temps. Clique sur un numéro quand une pièce est achetée, et modifie les prix si tu trouves mieux.</p></div>`;
  $$("[data-done]").forEach(i => i.onclick = () => { S.plan.done[i.dataset.done] = !S.plan.done[i.dataset.done]; save(); renderAll(); });
  $$("[data-price]").forEach(i => i.onchange = () => { S.plan.prices[i.dataset.price] = +i.value || 0; save(); renderAll(); });
  $$("[data-sell]").forEach(i => i.onchange = () => { S.plan.resaleVal[i.dataset.sell] = +i.value || 0; save(); renderAll(); });
}

/* ---------- Timing & configs ---------- */
function renderTiming() {
  const now = Date.now();
  $("#events").innerHTML = EVENTS.map(e => {
    const s = new Date(e.d + "T00:00"), en = new Date(e.e + "T23:59"), dd = daysTo(s);
    const st = now > en ? "past" : now >= s ? "live" : dd <= 14 ? "soon" : "";
    const cd = now > en ? "Terminé" : now >= s ? `En cours<small>jusqu'au ${en.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small>` : `J-${dd}`;
    return `<div class="ev ${st}"><div class="d">${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}${e.e !== e.d ? " → " + en.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</div><h3>${e.n}</h3><div class="cd">${cd}</div><p>${e.tip}</p></div>`;
  }).join("");
}
function renderConfigs() {
  const g = id => stats(id).cur, sc = schedule();
  const dyn = [];
  if (real("rtx5060ti") && g("rtx5060ti") <= g("rx9060xt")) dyn.push(["À saisir", "RTX 5060 Ti 16 Go au lieu de la 9060 XT", "Elle est au même prix ou moins. DLSS 4, meilleur ray tracing, NVENC. Seul bémol : 8 lignes PCIe sur ta B450.", g("rtx5060ti")]);
  if (real("r7_5700x3d") && g("r7_5700x3d") < g("r7_5800x3d") - 40) dyn.push(["À saisir", "5700X3D au lieu du 5800X3D", `${eur(g("r7_5800x3d") - g("r7_5700x3d"))} d'économie pour une perte de FPS minime en 1080p.`, g("r7_5700x3d")]);
  if (real("ddr5_32") && real("ddr4_32") && g("ddr5_32") <= g("ddr4_32") * 1.5) dyn.push(["Nouveau", "La DDR5 devient abordable", "Écart DDR5/DDR4 sous 50 % : le passage à l'AM5 devient à étudier (carte mère + CPU + DDR5, le reste se réutilise).", null]);
  const stat = [
    ["Plan principal", "AM4 · 5800X3D + RX 9060 XT 16 Go", "1080p 144 Hz pour plusieurs années, en gardant ta carte mère et tes SSD.", sc.total],
    ["Économique", "Seulement la carte graphique", "Ton Ryzen 5 3600 tient encore le 1080p. La carte graphique seule donne le plus gros gain par euro. Le processeur peut attendre.", g("rx9060xt")],
    ["Plan B GPU", "RX 6800 / 7700 XT d'occasion ou RTX 5060 neuve", "Si la 9060 XT 16 Go reste trop chère. Évite les versions 8 Go de la 5060 Ti et de la 9060 XT. Teste la carte en main propre.", null],
    ["Plus tard", "Écran 1440p, puis AM5", "Un écran 1440p d'abord. L'AM5 quand la DDR5 aura baissé : pas de retour à la normale annoncé avant 2028, ne l'attends pas pour jouer.", null],
  ];
  $("#configList").innerHTML = [...dyn.map(x => [...x, true]), ...stat].map(([tag, t, d, p, hot]) => `<div class="cfg ${hot ? "hot" : ""}"><div class="tag">${tag}</div><h3>${t}</h3><p>${d}</p>${p ? `<div class="price">${eur(p)}</div>` : ""}</div>`).join("");
}

/* ---------- Partage ---------- */
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
const shareData = () => ({ v: 1, prods: S.prods, settings: S.settings });
function mergeIn(d) {
  if (!d || typeof d.prods !== "object") throw new Error("bad");
  let n = 0;
  for (const id in d.prods) if (S.prods[id]) {
    const have = new Set(S.prods[id].hist.map(x => x.t));
    (d.prods[id].hist || []).forEach(x => { if (x && !have.has(x.t) && +x.p > 0 && +x.t > 0) { S.prods[id].hist.push({ t: +x.t, p: +x.p, src: x.src === "estimation" ? "estimation" : "relevé" }); n++; } });
    if (+d.prods[id].target > 0) S.prods[id].target = +d.prods[id].target;
  }
  if (d.settings) S.settings = { drop: +d.settings.drop || S.settings.drop, rise: +d.settings.rise || S.settings.rise };
  save(); renderAll(); return n;
}

/* ---------- Init ---------- */
function showTab(id) {
  $$("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.tab === id));
  $$(".tab").forEach(t => t.classList.toggle("on", t.id === id));
  if (id === "alerts") setTimeout(() => { S.alerts.forEach(a => a.read = true); save(); }, 1500);
  scrollTo({ top: 0 });
}
function renderAll() { renderTicker(); renderMood(); renderKpis(); renderTodo(); renderMarket(); renderAlerts(); renderBudget(); renderPlan(); renderTiming(); renderConfigs(); }
function init() {
  load();
  $("#today").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $$("#tabs button").forEach(b => b.onclick = () => { showTab(b.dataset.tab); if (b.dataset.tab !== "alerts") renderAlerts(); });
  $(".brand").onclick = e => { e.preventDefault(); showTab("market"); };
  $("#btnReleve").onclick = openReleve;
  $("#formReleve").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    let n = 0;
    $$("[data-r]").forEach(i => { const v = +i.value; if (v > 0) { addPoint(i.dataset.r, v); n++; } });
    if (n) { finishReleve(); toast(`${n} prix enregistré${n > 1 ? "s" : ""}`); }
  });
  ["net", "fixed", "life", "saved", "pc"].forEach(k => $("#b_" + k).oninput = e => { S.budget[k] = +e.target.value || 0; save(); renderBudget(); renderPlan(); renderKpis(); renderTodo(); });
  $("#gpuFirst").onchange = e => { S.plan.gpuFirst = e.target.checked; save(); renderAll(); };
  $("#resale").onchange = e => { S.plan.resale = e.target.checked; save(); renderAll(); };
  $("#s_drop").onchange = e => { S.settings.drop = +e.target.value || 5; save(); };
  $("#s_rise").onchange = e => { S.settings.rise = +e.target.value || 5; save(); };
  $("#btnClear").onclick = () => { S.alerts.forEach(a => a.read = true); save(); renderAlerts(); };
  $("#btnNotif").onclick = async () => {
    if (!("Notification" in window)) return toast("Notifications non supportées par ce navigateur");
    const r = await Notification.requestPermission(); toast(r === "granted" ? "Notifications activées" : "Notifications refusées");
  };
  $("#btnLink").onclick = async () => {
    const url = location.href.split("#")[0] + "#d=" + enc(shareData());
    try { await navigator.clipboard.writeText(url); toast("Lien copié : envoie-le à ton pote"); } catch { prompt("Copie ce lien :", url); }
  };
  $("#btnExport").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(shareData(), null, 1)], { type: "application/json" }));
    a.download = "bourse-hardware.json"; a.click();
  };
  $("#fileImport").onchange = async e => {
    try { const n = mergeIn(JSON.parse(await e.target.files[0].text())); toast(`${n} relevé(s) importé(s)`); } catch { toast("Fichier invalide"); }
    e.target.value = "";
  };
  $("#btnReset").onclick = () => { if (confirm("Effacer tous les relevés, alertes et réglages ?")) { try { localStorage.removeItem(KEY); } catch {} load(); renderAll(); } };
  if (location.hash.startsWith("#d=")) {
    try { const d = dec(location.hash.slice(3)); if (confirm("Importer les relevés de ce lien de partage ?")) toast(`${mergeIn(d)} relevé(s) importé(s)`); } catch { toast("Lien de partage invalide"); }
    history.replaceState(null, "", location.pathname + location.search);
  }
  reminders();
  renderAll();
}
init();
