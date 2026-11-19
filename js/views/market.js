import { html, on, $ } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { CATEGORIES, catById } from "../core/catalog.js";
import { money, delta, freshBadge, confBars, signalBadge, sparkOf, productHref, productDialog, batchDialog, statusTag, emptyState } from "./common.js";

export const SORTS = {
  name: { label: "Nom", fn: (a, b) => a.product.name.localeCompare(b.product.name) },
  price: { label: "Prix le plus bas", fn: (a, b) => (a.st.cur ?? Infinity) - (b.st.cur ?? Infinity) },
  drop: { label: "Plus forte baisse", fn: (a, b) => (a.st.changePrev ?? 0) - (b.st.changePrev ?? 0) },
  rise: { label: "Plus forte hausse", fn: (a, b) => (b.st.changePrev ?? 0) - (a.st.changePrev ?? 0) },
  target: { label: "Plus proche de la cible", fn: (a, b) => dist(a) - dist(b) },
  low: { label: "Plus proche du plus bas", fn: (a, b) => lowRatio(a) - lowRatio(b) },
  recent: { label: "Mis à jour récemment", fn: (a, b) => (b.st.last?.ts ?? 0) - (a.st.last?.ts ?? 0) },
};
const dist = r => (r.watch?.target && r.st.cur != null ? Math.abs(r.st.cur - r.watch.target) / r.watch.target : Infinity);
const lowRatio = r => (r.st.n > 1 ? r.st.cur / r.st.min : Infinity);

export function productRow(r, cur) {
  const est = r.st.last?.status === "estimate";
  return html`<tr class="link" data-href="${productHref(r.product.id)}" tabindex="0">
    <td><div class="pname">${r.product.name}</div><div class="psub">${r.product.brand ? `${r.product.brand} · ` : ""}${catById(r.product.category).short}</div></td>
    <td class="r"><div class="price">${r.st.cur != null ? money(r.st.cur, cur) : "—"}</div>${est ? statusTag("estimate") : ""}</td>
    <td class="r">${delta(r.st.changePrev)}</td>
    <td class="r" data-m="hide">${delta(r.c30)}</td>
    <td data-m="full">${sparkOf(r)}</td>
    <td class="r num small" data-m="hide">${r.st.n > 1 ? html`${money(r.st.min, cur)} <span class="faint">/</span> ${money(r.st.avg, cur)} <span class="faint">/</span> ${money(r.st.max, cur)}` : html`<span class="faint">—</span>`}</td>
    <td class="r num" data-m="hide">${r.watch?.target ? money(r.watch.target, cur) : html`<span class="faint">—</span>`}</td>
    <td>${confBars(r.conf)} ${freshBadge(r)}</td>
    <td class="r">${signalBadge(r.signal)}</td>
  </tr>`;
}
export const tableHead = html`<thead><tr><th>Produit</th><th class="r">Prix</th><th class="r">Var.</th><th class="r">30 j</th><th>Historique</th><th class="r">Min / Moy / Max</th><th class="r">Cible</th><th>Fiabilité</th><th class="r">Signal</th></tr></thead>`;

export default {
  title: "Marché",
  render({ state, d, query }) {
    const cat = query.cat || "all", sort = SORTS[query.sort] ? query.sort : "name", q = query.q || "";
    const counts = Object.fromEntries(CATEGORIES.map(c => [c.id, d.rows.filter(r => r.product.category === c.id).length]));
    return {
      title: "Marché",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${d.rows.length} produits suivis</div><h1>Marché des composants</h1><p>Prix observés, tendances et fiabilité des données, par catégorie.</p></div>
        <div class="actions"><button class="btn" data-act="batch">${icon("edit", { size: 16 })}Relevé groupé</button><button class="btn btn-primary" data-act="add">${icon("plus", { size: 16 })}Suivre un produit</button></div></div>
      <div class="toolbar">
        <div class="search grow" style="flex:1 1 240px"><span>${icon("search", { size: 16 })}</span><input class="input" style="padding-left:34px" type="search" name="q" value="${q}" placeholder="Filtrer par nom ou marque" aria-label="Filtrer les produits"></div>
        <label class="field" style="flex:0 0 220px"><span class="sr-only">Trier</span><select class="select" name="sort" aria-label="Trier">${Object.entries(SORTS).map(([k, s]) => html`<option value="${k}" ${k === sort ? "selected" : ""}>${s.label}</option>`)}</select></label>
      </div>
      <div class="chips" style="margin-bottom:14px" role="group" aria-label="Catégories">
        <button class="chip" data-cat="all" aria-pressed="${cat === "all"}">Tout <span class="n">${d.rows.length}</span></button>
        ${CATEGORIES.map(c => html`<button class="chip" data-cat="${c.id}" aria-pressed="${cat === c.id}">${c.label} <span class="n">${counts[c.id]}</span></button>`)}
      </div>
      <div class="table-wrap"><table class="dt stack">${tableHead}<tbody data-body></tbody></table></div>
      <p class="tiny faint" style="margin-top:8px">Var. = entre les deux derniers relevés. Fiabilité = nombre de relevés vérifiés et fraîcheur du dernier prix. Aucun prix n'est mis à jour automatiquement sans source autorisée.</p>`,
      mount(el, ctx) {
        let f = { cat, sort, q };
        const body = $("[data-body]", el);
        const draw = () => {
          const term = f.q.trim().toLowerCase();
          const list = ctx.store.derived.rows.filter(r => (f.cat === "all" || r.product.category === f.cat) && (!term || `${r.product.name} ${r.product.brand}`.toLowerCase().includes(term))).sort(SORTS[f.sort].fn);
          body.innerHTML = list.length ? list.map(r => productRow(r, ctx.store.state.settings.currency).s).join("") : `<tr><td colspan="9">${emptyState(f.cat === "all" ? "Aucun produit ne correspond." : `Aucun produit suivi dans « ${catById(f.cat).label} ».`, "search").s}</td></tr>`;
        };
        const sync = () => { const p = new URLSearchParams(); if (f.cat !== "all") p.set("cat", f.cat); if (f.sort !== "name") p.set("sort", f.sort); if (f.q) p.set("q", f.q); history.replaceState(null, "", `#/market${p.toString() ? "?" + p : ""}`); };
        draw();
        const offs = [
          on(el, "click", "[data-cat]", (e, b) => { f.cat = b.dataset.cat; el.querySelectorAll("[data-cat]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); sync(); draw(); }),
          on(el, "change", "[name=sort]", (e, s) => { f.sort = s.value; sync(); draw(); }),
          on(el, "input", "[name=q]", (e, i) => { f.q = i.value; sync(); draw(); }),
          on(el, "click", "tr[data-href]", (e, tr) => (location.hash = tr.dataset.href)),
          on(el, "keydown", "tr[data-href]", (e, tr) => { if (e.key === "Enter") location.hash = tr.dataset.href; }),
          on(el, "click", "[data-act]", (e, b) => (b.dataset.act === "add" ? productDialog(ctx.store) : batchDialog(ctx.store))),
        ];
        return { cleanup: () => offs.forEach(o => o()), update(change) { if (["observations", "products", "watchlist", "import", "external"].includes(change.type)) { draw(); return change.type !== "products"; } return false; } };
      },
    };
  },
};
