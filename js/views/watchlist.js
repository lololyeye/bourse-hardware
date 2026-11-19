import { html, on, $, $$, toast, formDialog, confirmDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { catById } from "../core/catalog.js";
import { money, delta, freshBadge, signalBadge, sparkOf, productHref, productDialog, alertDialog, emptyState } from "./common.js";
import { shareDialog } from "./settings.js";

const PRIO = { high: "Haute", medium: "Moyenne", low: "Basse" };

function item(x, cur, i, n) {
  const w = x.watch;
  return html`<div class="wl-item" draggable="true" data-id="${x.product.id}" role="listitem">
    <span class="grip" title="Glisser pour réordonner" aria-hidden="true">${icon("grip", { size: 16 })}</span>
    <div style="min-width:0"><div style="display:flex;gap:8px;align-items:center"><button class="btn btn-ghost btn-sm btn-icon fav" data-fav aria-pressed="${w.favorite}" aria-label="Favori">${icon("star", { size: 15 })}</button>
      <a href="${productHref(x.product.id)}" class="pname" style="text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.product.name}</a></div>
      <div class="psub" style="padding-left:36px">${catById(x.product.category).short} · <span class="prio prio-${w.priority}">${PRIO[w.priority]}</span></div></div>
    <div class="r" style="text-align:right"><div class="price num" style="font-weight:600">${x.st.cur != null ? money(x.st.cur, cur) : "—"}</div>${delta(x.st.changePrev)}</div>
    <div class="c-hide">${sparkOf(x, { w: 100, h: 28 })}</div>
    <label class="c-hide"><span class="sr-only">Prix cible</span><span class="input-affix"><input class="input num" data-f="target" inputmode="decimal" value="${w.target ?? ""}" placeholder="Cible"><em>${cur}</em></span></label>
    <div class="c-hide">${signalBadge(x.signal)}<div style="margin-top:3px">${freshBadge(x)}</div></div>
    <div class="actions wl-act" style="justify-content:flex-end;flex-wrap:nowrap">
      <button class="btn btn-ghost btn-sm btn-icon" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Monter">${icon("chevronUp", { size: 15 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-move="1" ${i === n - 1 ? "disabled" : ""} aria-label="Descendre">${icon("chevronDown", { size: 15 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-alert aria-label="Créer une alerte">${icon("bell", { size: 15 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-remove aria-label="Retirer de la watchlist">${icon("x", { size: 15 })}</button></div>
    <div class="detail">
      <label class="field"><span>Priorité</span><select class="select" data-f="priority">${Object.entries(PRIO).map(([k, v]) => html`<option value="${k}" ${k === w.priority ? "selected" : ""}>${v}</option>`)}</select></label>
      <label class="field"><span>Échéance d'achat</span><input class="input" type="date" data-f="deadline" value="${w.deadline ? new Date(w.deadline).toISOString().slice(0, 10) : ""}"></label>
      <label class="field" style="grid-column:span 2"><span>Note perso</span><input class="input" data-f="note" maxlength="300" value="${w.note}" placeholder="ex. attendre les soldes, version 16 Go uniquement…"></label>
      <div class="small muted">Min ${x.st.n ? money(x.st.min, cur) : "—"} · Moy ${x.st.n ? money(x.st.avg, cur) : "—"} · Max ${x.st.n ? money(x.st.max, cur) : "—"}<br>Vérifié ${x.st.n ? freshBadge(x) : "jamais"}</div>
    </div>
  </div>`;
}

export default {
  title: "Watchlist",
  render({ state, d }) {
    const cur = state.settings.currency, view = state.settings.watchView;
    const list = [...state.watchlist].sort((a, b) => (b.favorite - a.favorite) || (a.order - b.order)).map(w => d.byId.get(w.productId)).filter(Boolean);
    return {
      title: "Watchlist",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${list.length} produits · ${list.filter(x => x.watch.favorite).length} favoris</div><h1>Ma watchlist</h1><p>Tes produits, tes prix cibles, tes priorités. Les favoris restent en haut ; glisse ou utilise les flèches pour réordonner.</p></div>
        <div class="actions">
          <div class="seg" role="group" aria-label="Affichage"><button data-view="compact" aria-pressed="${view === "compact"}">${icon("compact", { size: 14 })} Compact</button><button data-view="detailed" aria-pressed="${view === "detailed"}">${icon("detailed", { size: 14 })} Détaillé</button></div>
          <button class="btn" data-act="share">${icon("share", { size: 16 })}Partager</button>
          <button class="btn btn-primary" data-act="add">${icon("plus", { size: 16 })}Ajouter</button></div></div>
      ${list.length ? html`<div class="wl ${view === "compact" ? "compact" : ""}" role="list" data-list>${list.map((x, i) => item(x, cur, i, list.length))}</div>`
        : html`<div class="panel">${emptyState("Ta watchlist est vide.", "star", html`<button class="btn btn-primary" data-act="add">Ajouter un produit</button>`)}</div>`}`,
      mount(el, ctx) {
        const S = () => ctx.store.state;
        const src = { source: location.hash };
        const setW = (id, f, v) => ctx.store.commit("watchlist", s => { const w = s.watchlist.find(w => w.productId === id); if (w) w[f] = v; }, src);
        const reorder = ids => ctx.store.commit("watchlist", s => { ids.forEach((id, i) => { const w = s.watchlist.find(w => w.productId === id); if (w) w.order = i; }); });
        const idsInDom = () => $$(".wl-item", el).map(n => n.dataset.id);
        const idOf = n => n.closest(".wl-item").dataset.id;
        let dragId = null;
        const offs = [
          on(el, "click", "[data-view]", (e, b) => ctx.store.commit("settings", s => (s.settings.watchView = b.dataset.view))),
          on(el, "click", "[data-act=add]", () => addDialog(ctx.store)),
          on(el, "click", "[data-act=share]", () => shareDialog(ctx.store, { watchlist: true })),
          on(el, "click", "[data-fav]", (e, b) => { const id = idOf(b); setW(id, "favorite", !S().watchlist.find(w => w.productId === id).favorite); ctx.store.commit("watchlist", () => {}); }),
          on(el, "click", "[data-alert]", (e, b) => alertDialog(ctx.store, { productId: idOf(b) })),
          on(el, "click", "[data-move]", (e, b) => { const ids = idsInDom(), i = ids.indexOf(idOf(b)), j = i + Number(b.dataset.move); if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder(ids); requestAnimationFrame(() => $(`.wl-item[data-id="${CSS.escape(ids[j])}"] [data-move="${b.dataset.move}"]`, el)?.focus()); }),
          on(el, "click", "[data-remove]", async (e, b) => {
            const id = idOf(b), p = S().products.find(p => p.id === id);
            if (!(await confirmDialog({ title: "Retirer de la watchlist ?", body: `${p.name} restera dans le marché avec son historique. Son prix cible sera oublié.`, confirm: "Retirer" }))) return;
            ctx.store.commit("watchlist", s => { s.watchlist = s.watchlist.filter(w => w.productId !== id); });
          }),
          on(el, "change", "[data-f]", (e, i) => {
            const id = idOf(i), f = i.dataset.f; let v = i.value;
            if (f === "target") { v = v.trim() ? Number(v.replace(",", ".")) : null; if (v != null && !(v > 0)) { i.setAttribute("aria-invalid", "true"); return toast("Prix cible invalide", { tone: "bad" }); } i.removeAttribute("aria-invalid"); }
            if (f === "deadline") v = v ? new Date(v + "T12:00").getTime() : null;
            setW(id, f, v);
            if (f === "priority") ctx.store.commit("watchlist", () => {}); // refresh labels
          }),
          // HTML5 drag & drop (desktop). Arrow buttons cover keyboard and touch.
          on(el, "dragstart", ".wl-item", (e, n) => { if (e.target.closest("input,select,button,a")) return e.preventDefault(); dragId = n.dataset.id; n.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); }),
          on(el, "dragover", ".wl-item", (e, n) => { if (!dragId || n.dataset.id === dragId) return; e.preventDefault(); const r = n.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; $$(".wl-item", el).forEach(x => x.classList.remove("drop-before", "drop-after")); n.classList.add(after ? "drop-after" : "drop-before"); }),
          on(el, "drop", ".wl-item", (e, n) => { e.preventDefault(); if (!dragId) return; const ids = idsInDom().filter(x => x !== dragId); let i = ids.indexOf(n.dataset.id); if (n.classList.contains("drop-after")) i++; ids.splice(i, 0, dragId); dragId = null; reorder(ids); }),
          on(el, "dragend", ".wl-item", () => { dragId = null; $$(".wl-item", el).forEach(x => x.classList.remove("dragging", "drop-before", "drop-after")); }),
        ];
        return { cleanup: () => offs.forEach(o => o()) };
      },
    };
  },
};

async function addDialog(store) {
  const st = store.state, watched = new Set(st.watchlist.map(w => w.productId));
  const free = st.products.filter(p => !watched.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const data = await formDialog({
    title: "Ajouter à la watchlist",
    body: html`${free.length ? html`<label class="field"><span>Produit déjà suivi dans le marché</span><select class="select" name="pid"><option value="">— Choisir —</option>${free.map(p => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
      <label class="field"><span>Prix cible <small>(optionnel)</small></span><input class="input num" name="target" inputmode="decimal"></label>` : html`<p class="small muted">Tous les produits du marché sont déjà dans ta watchlist.</p>`}
      <p class="small"><button type="button" class="btn btn-sm" data-new>${icon("plus", { size: 14 })}Créer un nouveau produit</button></p>`,
    submit: "Ajouter",
    onMount: d => { d.querySelector("[data-new]").onclick = () => { d.querySelector("[data-x]").click(); productDialog(store); }; },
    validate: v => (!v.pid ? "Choisis un produit." : v.target && !(Number(v.target.replace(",", ".")) > 0) ? "Prix cible invalide." : null),
  });
  if (!data) return;
  store.commit("watchlist", s => s.watchlist.push({ productId: data.pid, target: data.target ? Number(data.target.replace(",", ".")) : null, priority: "medium", note: "", favorite: false, deadline: null, order: s.watchlist.length }));
  toast("Ajouté à la watchlist", { tone: "ok" });
}
