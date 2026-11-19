// App bootstrap: appearance, router, shell (sidebar, topbar, ticker, search, notification centre).
import { store } from "./core/store.js";
import { EVENTS, catById } from "./core/catalog.js";
import { fmtPrice, fmtPct, fmtAgo, DAY } from "./core/format.js";
import { html, raw, esc, $, $$, on, toast, popover, closePopovers } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { notify } from "./ui/notify.js";
import { VIEWS } from "./views/index.js";
import { CONFIG } from "./config.js";
import { feedToAdd } from "./core/feed.js";

const root = document.documentElement;

/* ---------------- Appearance & motion ---------------- */
const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
const mqLight = matchMedia("(prefers-color-scheme: light)");
export function applyAppearance() {
  const s = store.state.settings;
  root.dataset.themeEffective = s.theme === "system" ? (mqLight.matches ? "light" : "dark") : s.theme;
  root.dataset.motion = s.motion;
  root.dataset.motionEffective = s.motion === "auto" ? (mqReduce.matches ? "reduced" : "full") : s.motion;
  if (s.accent && s.accent !== "amber") root.dataset.accent = s.accent; else delete root.dataset.accent;
  root.dataset.density = s.density;
  if (s.sidebarCollapsed) root.dataset.sidebar = "collapsed"; else delete root.dataset.sidebar;
  $('meta[name="theme-color"]').content = root.dataset.themeEffective === "light" ? "#f3f3f1" : "#07080a";
}
mqReduce.addEventListener?.("change", () => { applyAppearance(); renderShell(true); });
mqLight.addEventListener?.("change", applyAppearance);

/* ---------------- Navigation model ---------------- */
const NAV = [
  { group: "Marché" },
  { id: "overview", label: "Vue d'ensemble", icon: "overview" },
  { id: "market", label: "Marché", icon: "market" },
  { id: "components", label: "Composants", icon: "cpu" },
  { id: "watchlist", label: "Watchlist", icon: "star" },
  { group: "Décider" },
  { id: "alerts", label: "Alertes", icon: "bell", count: () => store.state.notifications.filter(n => !n.read).length },
  { id: "timing", label: "Quand acheter", icon: "clock" },
  { id: "configs", label: "Configurations", icon: "layers" },
  { id: "budget", label: "Budget", icon: "wallet" },
  { group: "Données" },
  { id: "history", label: "Historique", icon: "history" },
  { id: "settings", label: "Réglages", icon: "settings" },
];
const BOTTOM = ["overview", "market", "watchlist", "alerts"];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "") || "overview";
  const [path, qs = ""] = h.split("?");
  const [name, ...rest] = path.split("/");
  return { name: VIEWS[name] ? name : "overview", params: rest.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}
export const go = path => { location.hash = path.startsWith("#") ? path : `#/${path}`; };

/* ---------------- Shell ---------------- */
let lastTicker = "";
function renderShell(force = false) {
  const st = store.state, d = store.derived, route = parseHash().name;
  const navRoute = route === "product" ? "market" : route;
  $("#nav").innerHTML = NAV.map(n => n.group ? `<div class="nav-label">${n.group}</div>` : (() => {
    const c = n.count?.() || 0;
    return `<a href="#/${n.id}" ${n.id === navRoute ? 'aria-current="page"' : ""} title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${c ? `<b class="count">${c > 99 ? "99+" : c}</b>` : ""}</a>`;
  })()).join("");
  const unread = st.notifications.filter(n => !n.read).length;
  $("#bottomNav").innerHTML = BOTTOM.map(id => { const n = NAV.find(x => x.id === id); const c = n.count?.() || 0; return `<a href="#/${id}" ${id === navRoute ? 'aria-current="page"' : ""}>${icon(n.icon, { size: 20 })}<span>${{ overview: "Aperçu", market: "Marché", watchlist: "Watchlist", alerts: "Alertes" }[id]}</span>${c ? `<b class="badge-dot">${c > 9 ? "9+" : c}</b>` : ""}</a>`; }).join("")
    + `<button id="moreBtn" aria-label="Toutes les sections">${icon("menu", { size: 20 })}<span>Plus</span></button>`;
  $("#moreBtn").onclick = () => toggleNav(true);

  // market status
  const ix = d.index, dir = ix.direction;
  const label = { up: "Marché en hausse", down: "Marché en baisse", flat: "Marché stable", unknown: "Tendance inconnue" }[dir];
  const ms = $("#marketStatus");
  ms.className = `status ${dir}`;
  ms.innerHTML = `<span class="dot"></span><span class="txt">${label}</span><span class="num">${ix.value != null ? ix.value.toFixed(1).replace(".", ",") : "—"}</span>`;
  ms.title = `Indice HW (base 100). ${ix.tracked} produits suivis.${ix.estimateShare > 0.5 ? " Majoritairement des estimations : tendance peu fiable." : ""}`;

  const lu = d.lastObservationAt;
  $("#lastUpdate").innerHTML = `${icon("refresh", { size: 14 })}<span>${lu ? `Dernier relevé ${esc(fmtAgo(lu))}` : "Aucun relevé vérifié"}</span>`;
  $("#notifBtn").innerHTML = `${icon("bell")}${unread ? `<span class="badge-dot">${unread > 9 ? "9+" : unread}</span>` : ""}`;
  $("#dataPill").innerHTML = `${icon("shield", { size: 15 })}<span>Données locales · ${st.observations.length} relevés</span>`;
  $("#collapseBtn").innerHTML = `${icon("sidebar", { size: 16 })}<span>${st.settings.sidebarCollapsed ? "" : "Réduire"}</span>`;

  // ticker — only rebuilt when its content changes (avoids restarting the animation)
  const items = d.rows.filter(r => r.st.n).map(r => {
    const c = r.st.changePrev;
    return `<a class="ticker-item" href="#/product/${encodeURIComponent(r.product.id)}"><b>${esc(r.product.name)}</b><span>${esc(fmtPrice(r.st.cur, st.settings.currency))}</span><span class="delta ${c > 0 ? "up" : c < 0 ? "down" : "flat"}">${c == null ? "—" : `${c > 0 ? "▲" : c < 0 ? "▼" : "■"} ${esc(fmtPct(c))}`}</span></a>`;
  }).join("");
  const tick = `<div class="ticker-track">${items}<span class="ticker-dup" aria-hidden="true" style="display:contents">${items.replaceAll("<a ", '<a tabindex="-1" ')}</span></div>`;
  if (force || tick !== lastTicker) { $("#ticker").innerHTML = tick; lastTicker = tick; $("#ticker").style.setProperty("--ticker-dur", `${Math.max(40, d.rows.length * 7)}s`); }
}

function toggleNav(open) {
  document.body.classList.toggle("nav-open", open);
  $("#menuBtn").setAttribute("aria-expanded", String(open));
  if (open) $("#nav a")?.focus();
}

/* ---------------- Views ---------------- */
let current = { name: null, key: null, inst: null };
const ctx = () => ({ store, state: store.state, d: store.derived, go, ...parseHash() });

function mountView({ enter = true } = {}) {
  const r = parseHash(), key = location.hash;
  const el = $("#view");
  const sameRoute = current.key === key;
  const scroll = sameRoute ? scrollY : 0;
  try { current.inst?.cleanup?.(); } catch (e) { console.error(e); }
  closePopovers();
  const view = VIEWS[r.name];
  let inst = null;
  try {
    const out = view.render(ctx());
    el.innerHTML = out.html instanceof Object ? out.html.s ?? String(out.html) : out.html;
    inst = out.mount?.(el, ctx()) || null;
    document.title = `${out.title || view.title} · Bourse du Hardware`;
  } catch (e) {
    console.error(e);
    el.innerHTML = html`<div class="callout bad">${icon("warning")}<div><b>Cette page n'a pas pu s'afficher.</b><p class="small">${e.message}</p><p class="small">Tes données ne sont pas touchées. <a href="#/overview">Retour à la vue d'ensemble</a></p></div></div>`.s;
  }
  current = { name: r.name, key, inst };
  if (enter && !sameRoute) { el.classList.remove("entering"); void el.offsetWidth; el.classList.add("entering"); }
  if (!sameRoute) { scrollTo(0, 0); el.focus({ preventScroll: true }); } else scrollTo(0, scroll);
}

/* ---------------- Search ---------------- */
function setupSearch() {
  const input = $("#search"), box = $("#searchResults");
  $("#searchIcon").outerHTML = icon("search", { size: 16 }).s;
  let active = 0, results = [];
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { close(); return; }
    const d = store.derived;
    const prods = d.rows.filter(r => `${r.product.name} ${r.product.brand} ${catById(r.product.category).label}`.toLowerCase().includes(q)).slice(0, 8)
      .map(r => ({ href: `#/product/${encodeURIComponent(r.product.id)}`, title: r.product.name, sub: `${catById(r.product.category).short} · ${r.st.cur != null ? fmtPrice(r.st.cur, store.state.settings.currency) : "pas de prix"}`, ic: catById(r.product.category).icon }));
    const pages = NAV.filter(n => n.id && n.label.toLowerCase().includes(q)).map(n => ({ href: `#/${n.id}`, title: n.label, sub: "Page", ic: n.icon }));
    results = [...prods, ...pages]; active = 0;
    box.innerHTML = results.length
      ? (prods.length ? `<div class="group">Composants</div>` : "") + results.map((r, i) => `${i === prods.length && pages.length ? '<div class="group">Pages</div>' : ""}<a role="option" href="${r.href}" class="${i === 0 ? "active" : ""}" data-i="${i}">${icon(r.ic, { size: 16 })}<span><b style="font-weight:500">${esc(r.title)}</b><br><span class="tiny muted">${esc(r.sub)}</span></span></a>`).join("")
      : `<div class="empty">Aucun résultat pour « ${esc(input.value)} »</div>`;
    box.hidden = false; input.setAttribute("aria-expanded", "true");
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    const links = $$("a", box);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length; links.forEach((a, i) => a.classList.toggle("active", i === active)); links[active]?.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter" && links[active]) { e.preventDefault(); location.hash = links[active].getAttribute("href"); input.value = ""; close(); input.blur(); }
    if (e.key === "Escape") { input.value = ""; close(); input.blur(); }
  });
  box.addEventListener("click", () => { input.value = ""; close(); });
  input.addEventListener("blur", () => setTimeout(close, 150));
  document.addEventListener("keydown", e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); input.focus(); input.select(); }
  });
}

/* ---------------- Notification centre & preferences ---------------- */
function openNotifCenter() {
  const list = store.state.notifications.slice(0, 40);
  const p = popover($("#notifBtn"), html`<div class="pop-head"><b>Notifications</b><div class="actions"><button class="btn btn-ghost btn-sm" data-act="read">Tout lu</button><a class="btn btn-ghost btn-sm" href="#/alerts?tab=history">Historique</a></div></div>
    <div class="pop-body">${list.length ? list.map(n => html`<a class="notif ${n.read ? "" : "unread"}" href="${n.productId ? `#/product/${encodeURIComponent(n.productId)}` : "#/alerts?tab=history"}" data-id="${n.id}"><span class="u"></span><span><b>${n.title}</b><p>${n.body}</p></span><time>${fmtAgo(n.ts)}</time></a>`) : html`<div class="empty">${icon("bell", { size: 22 })}Aucune notification.</div>`}</div>`, { className: "notif-center" });
  on(p, "click", "[data-act=read]", () => { store.commit("notifications", s => s.notifications.forEach(n => (n.read = true))); p._close(); });
  on(p, "click", ".notif", (e, a) => { store.commit("notifications", s => { const n = s.notifications.find(x => x.id === a.dataset.id); if (n) n.read = true; }); p._close(); });
}
function openPrefs() {
  const s = store.state.settings;
  const p = popover($("#prefsBtn"), html`<div style="padding:6px 6px 2px;display:flex;flex-direction:column;gap:12px;width:260px">
    <div><div class="eyebrow" style="margin-bottom:6px">Thème</div><div class="seg">${["dark", "light", "system"].map(t => html`<button data-theme="${t}" aria-pressed="${s.theme === t}">${{ dark: "Sombre", light: "Clair", system: "Système" }[t]}</button>`)}</div></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Animations</div><div class="seg">${["auto", "full", "reduced", "none"].map(t => html`<button data-motion="${t}" aria-pressed="${s.motion === t}">${{ auto: "Auto", full: "Pleines", reduced: "Réduites", none: "Aucune" }[t]}</button>`)}</div>
      <p class="tiny muted" style="margin-top:6px">Auto suit le réglage de ton système (actuellement : ${mqReduce.matches ? "mouvement réduit" : "animations activées"}).</p></div>
    <a class="menu-item" href="#/settings">${icon("settings", { size: 16 })} Tous les réglages</a></div>`);
  on(p, "click", "[data-theme]", (e, b) => { store.commit("settings", st => (st.settings.theme = b.dataset.theme)); p._close(); });
  on(p, "click", "[data-motion]", (e, b) => { store.commit("settings", st => (st.settings.motion = b.dataset.motion)); p._close(); });
}

/* ---------------- Reminders (on load / when the tab becomes visible — no polling) ---------------- */
function reminders() {
  const st = store.state, d = store.derived, now = Date.now(), notes = [];
  const lastReal = d.lastObservationAt;
  const every = st.settings.reminderDays * DAY;
  if ((!lastReal || now - lastReal > every) && (!st.meta.lastReminderAt || now - st.meta.lastReminderAt > every)) {
    notes.push({ kind: "remind", title: lastReal ? "Relevé de prix en retard" : "Fais ton premier relevé", body: lastReal ? `Dernier relevé ${fmtAgo(lastReal)}. Mets les prix à jour pour garder des signaux fiables.` : "Les prix de départ sont des estimations. Note les vrais prix vus en boutique pour démarrer l'analyse." });
    store.commit("meta", s => (s.meta.lastReminderAt = now));
  }
  for (const e of EVENTS) {
    const start = new Date(e.start + "T00:00").getTime(), days = Math.ceil((start - now) / DAY);
    if (days >= 0 && days <= 7 && !st.meta.firedEvents[e.id]) {
      notes.push({ kind: "event", title: `${e.name} ${days === 0 ? "aujourd'hui" : `dans ${days} jour${days > 1 ? "s" : ""}`}`, body: `${e.tip} Fais un relevé la veille pour comparer aux vrais prix promo.` });
      store.commit("meta", s => (s.meta.firedEvents[e.id] = now));
    }
  }
  if (notes.length) store.addNotifications(notes);
  store.runAlertsNow(); // time-based alerts (stale data)
}

/* ---------------- Published price feed ---------------- */
async function loadFeed() {
  if (!CONFIG.priceFeedUrl) return;
  try {
    const res = await fetch(CONFIG.priceFeedUrl, { cache: "no-cache" });
    if (!res.ok) return;
    const { add, seen } = feedToAdd(await res.json(), store.state);
    if (!seen.length) return;
    store.commit("observations", s => { s.observations.push(...add); s.meta.feedSeen = [...(s.meta.feedSeen || []), ...seen].slice(-3000); });
    toast(`${add.length} nouveau${add.length > 1 ? "x" : ""} prix relevé${add.length > 1 ? "s" : ""} ajouté${add.length > 1 ? "s" : ""} à l'historique`, { tone: "ok", action: { label: "Voir", run: () => go("history") } });
  } catch { /* offline or feed unavailable: the app works without it */ }
}

/* ---------------- Boot ---------------- */
function boot() {
  const r = store.init();
  applyAppearance();
  store.setHooks({
    onNotify(notes) {
      notes.slice(0, 3).forEach(n => toast(`${n.title}${n.body ? " — " + n.body : ""}`, { tone: "alert", timeout: 6500, action: n.productId ? { label: "Voir", run: () => go(`product/${encodeURIComponent(n.productId)}`) } : null }));
      if (store.state.settings.browserNotif) notes.filter(n => n.browser !== false).forEach(n => notify.show(n.title, { body: n.body, tag: n.alertId || n.kind, route: n.productId ? `#/product/${encodeURIComponent(n.productId)}` : "#/alerts" }));
    },
    onError(msg) { toast(msg, { tone: "bad", timeout: 9000 }); },
  });
  $("#menuBtn").innerHTML = icon("menu").s;
  $("#prefsBtn").innerHTML = icon("sun").s;
  setupSearch();
  renderShell(true);
  mountView();

  store.subscribe(change => {
    if (change.type === "settings" || change.type === "reset" || change.type === "import" || change.type === "external") applyAppearance();
    renderShell(change.type === "settings");
    const handled = current.inst?.update?.(change, ctx());
    if (!handled && change.source !== current.key) mountView({ enter: false });
  });
  addEventListener("hashchange", () => { toggleNav(false); renderShell(); mountView(); });
  $("#menuBtn").onclick = () => toggleNav(!document.body.classList.contains("nav-open"));
  $("#scrim").onclick = () => toggleNav(false);
  $("#collapseBtn").onclick = () => store.commit("settings", s => (s.settings.sidebarCollapsed = !s.settings.sidebarCollapsed));
  $("#notifBtn").onclick = openNotifCenter;
  $("#prefsBtn").onclick = openPrefs;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("nav-open")) toggleNav(false); });

  if (r.warning) toast(r.warning, { tone: "warn", timeout: 10000 });
  if (r.migrated) toast("Tes données de l'ancienne version ont été migrées. Une sauvegarde de la v1 est conservée.", { tone: "ok", timeout: 8000 });
  if (!store.storageOk) toast("Le stockage local est bloqué : tes données ne seront pas conservées après fermeture.", { tone: "bad", timeout: 12000 });

  notify.registerSW();
  notify.onMessage(m => { if (m?.type === "navigate" && m.route) location.hash = m.route; });
  setTimeout(() => loadFeed().finally(reminders), 400);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { reminders(); renderShell(); } });
  window.__bh = { store, version: "2.0.0" }; // debugging / e2e
}
boot();
