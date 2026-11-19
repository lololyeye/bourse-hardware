import { html, on } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { CATEGORIES } from "../core/catalog.js";
import { SIGNALS } from "../core/analytics.js";
import { delta, signalBadge, productDialog, money } from "./common.js";

export default {
  title: "Composants",
  render({ state, d }) {
    const cur = state.settings.currency;
    const cards = CATEGORIES.map(c => {
      const rows = d.rows.filter(r => r.product.category === c.id);
      const priced = rows.filter(r => r.st.n);
      const ch = priced.map(r => r.c30).filter(v => v != null);
      const avg30 = ch.length ? ch.reduce((a, b) => a + b, 0) / ch.length : null;
      const best = [...rows].sort((a, b) => b.signal.rank - a.signal.rank)[0];
      const cheapest = priced.length ? priced.reduce((a, b) => (a.st.cur < b.st.cur ? a : b)) : null;
      return { c, rows, priced, avg30, best, cheapest };
    });
    return {
      title: "Composants",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${CATEGORIES.length} catégories</div><h1>Composants</h1><p>Vue par catégorie. Ouvre une catégorie pour voir le détail dans le marché.</p></div>
        <div class="actions"><button class="btn btn-primary" data-act="add">${icon("plus", { size: 16 })}Suivre un produit</button></div></div>
      <div class="grid cols-3 stagger">
        ${cards.map(({ c, rows, priced, avg30, best, cheapest }) => html`
        <a class="panel" href="#/market?cat=${c.id}" style="text-decoration:none;display:block">
          <div class="panel-head"><h2>${icon(c.icon, { size: 16 })}${c.label}</h2><span class="tag">${rows.length}</span></div>
          <div class="panel-body">${rows.length ? html`
            <dl class="kv"><dt>Produits avec prix</dt><dd>${priced.length} / ${rows.length}</dd>
            <dt>Variation moyenne 30 j</dt><dd>${delta(avg30)}</dd>
            <dt>Le moins cher</dt><dd>${cheapest ? money(cheapest.st.cur, cur) : "—"}</dd></dl>
            <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${best.product.name}</span>${signalBadge(best.signal)}</div>`
            : html`<p class="small faint">Aucun produit suivi dans cette catégorie.</p>`}</div></a>`)}
      </div>`,
      mount(el, ctx) { const off = on(el, "click", "[data-act=add]", () => productDialog(ctx.store)); return { cleanup: off }; },
    };
  },
};
