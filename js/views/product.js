import { html, on, $, toast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { priceChart, PERIODS, periodAvailability } from "../ui/chart.js";
import { catById, RETAILERS, retailerName } from "../core/catalog.js";
import { FRESH_LABEL, MIN_VERIFIED } from "../core/analytics.js";
import { fmtDate, fmtPct, fmtAgo, uid } from "../core/format.js";
import { describeAlert } from "../core/alerts.js";
import { money, delta, freshBadge, confBars, signalBadge, statusTag, methodLabel, observationDialog, deleteObservation, productDialog, deleteProduct, alertDialog, emptyState } from "./common.js";
import { kindTag } from "./overview.js";

const refsOf = x => ({ target: x.watch?.target ?? null, min: x.st.n > 1 ? x.st.min : null, max: x.st.n > 1 ? x.st.max : null, avg: x.st.n > 1 ? x.st.avg : null });

function head(x, cur) {
  const p = x.product;
  return html`<div class="ph" data-sec="head">
    <div><div class="eyebrow"><a href="#/market?cat=${p.category}" style="text-decoration:none">${catById(p.category).label}</a>${p.brand ? ` · ${p.brand}` : ""}</div>
      <h1>${p.name}</h1>
      <div class="meta">${signalBadge(x.signal)} <span class="tag" title="${x.conf.label}">${confBars(x.conf)} ${x.conf.label.toUpperCase()}</span> ${freshBadge(x)} ${x.st.last?.status === "estimate" ? statusTag("estimate") : ""}</div></div>
    <div><div class="big">${x.st.cur != null ? money(x.st.cur, cur) : "—"}</div><div style="text-align:right;margin-top:6px">${delta(x.st.changePrev)} <span class="tiny faint">vs relevé précédent</span></div></div>
  </div>`;
}
function stats(x, cur) {
  const t = x.watch?.target, dist = t && x.st.cur != null ? (x.st.cur - t) / t * 100 : null;
  const s = (k, v, sub = "") => html`<div class="panel stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  return html`<div class="grid cols-4" data-sec="stats" style="margin-top:14px">
    ${s("Plus bas observé", x.st.n ? money(x.st.min, cur) : "—", x.st.n ? `${x.st.n} relevé${x.st.n > 1 ? "s" : ""}, dont ${x.ver.length} vérifié${x.ver.length > 1 ? "s" : ""}` : "")}
    ${s("Moyenne observée", x.st.n ? money(x.st.avg, cur) : "—", x.st.n > 1 ? html`Max ${money(x.st.max, cur)}` : "")}
    ${s("Distance à la cible", dist != null ? html`<span class="${dist <= 0 ? "pos" : ""}">${fmtPct(dist)}</span>` : "—", t ? html`Cible ${money(t, cur)}` : html`<a href="#/watchlist">Définir une cible</a>`)}
    ${s("Tendance 30 j", x.trend ? html`<span class="${x.trend.dir === "rising" ? "neg" : x.trend.dir === "falling" ? "pos" : ""}">${fmtPct(x.trend.slopePctWeek)}</span>` : "—", x.trend ? `par semaine · R² ${x.trend.r2.toFixed(2)} · estimation` : `≥ 3 relevés vérifiés sur 1 j+ requis`)}
  </div>`;
}
function signalPanel(x) {
  return html`<section class="panel" data-sec="signal"><div class="panel-head"><h2>${icon("spark", { size: 16 })}Pourquoi ce signal</h2>${signalBadge(x.signal)}</div>
    <div class="panel-body"><p class="small muted" style="margin-bottom:12px">${x.signal.def}</p><ul class="reasons">${x.signal.reasons.map(r => html`<li>${kindTag(r.kind)}<span>${r.text}</span></li>`)}</ul>
    <p class="tiny faint" style="margin-top:12px">Ces signaux décrivent les données relevées ; ils ne prédisent pas les prix futurs.</p></div></section>`;
}
function obsPanel(x, cur) {
  const list = [...x.obs].reverse();
  return html`<section class="panel" data-sec="obs"><div class="panel-head"><h2>${icon("history", { size: 16 })}Relevés</h2><button class="btn btn-sm" data-act="obs">${icon("plus", { size: 14 })}Ajouter</button></div>
    <div class="panel-body" style="padding-top:8px">${list.length ? html`<div class="table-wrap" style="border:0;max-height:340px;overflow:auto"><table class="dt"><tbody>${list.map(o => html`<tr>
      <td><div class="num small">${fmtDate(o.ts, "fr", { time: true })}</div><div class="psub">${o.retailer ? retailerName(o.retailer) : "Boutique non précisée"} · ${methodLabel(o.method)}</div></td>
      <td class="r"><div class="price">${money(o.price, o.currency)}</div>${statusTag(o.status)}</td>
      <td class="r" style="white-space:nowrap">${o.sourceUrl ? html`<a class="btn btn-ghost btn-sm btn-icon" href="${o.sourceUrl}" target="_blank" rel="noopener noreferrer" title="Source">${icon("external", { size: 14 })}</a>` : ""}<button class="btn btn-ghost btn-sm btn-icon" data-edit="${o.id}" title="Modifier">${icon("edit", { size: 14 })}</button><button class="btn btn-ghost btn-sm btn-icon" data-del="${o.id}" title="Supprimer">${icon("trash", { size: 14 })}</button></td></tr>`)}</tbody></table></div>`
      : emptyState("Aucun relevé.", "history")}
    ${x.otherCurrency ? html`<p class="tiny faint">${x.otherCurrency} relevé(s) dans une autre devise, exclus des calculs.</p>` : ""}</div></section>`;
}
function watchPanel(x, cur) {
  const w = x.watch;
  return html`<section class="panel" data-sec="watch"><div class="panel-head"><h2>${icon("star", { size: 16 })}Suivi</h2></div><div class="panel-body">
    ${w ? html`<div class="grid-form">
      <label class="field"><span>Prix cible</span><span class="input-affix"><input class="input num" data-w="target" inputmode="decimal" value="${w.target ?? ""}"><em>${cur}</em></span></label>
      <label class="field"><span>Priorité</span><select class="select" data-w="priority">${["high", "medium", "low"].map(p => html`<option value="${p}" ${w.priority === p ? "selected" : ""}>${{ high: "Haute", medium: "Moyenne", low: "Basse" }[p]}</option>`)}</select></label>
      <label class="field"><span>Échéance d'achat</span><input class="input" type="date" data-w="deadline" value="${w.deadline ? new Date(w.deadline).toISOString().slice(0, 10) : ""}"></label></div>
      <label class="field" style="margin-top:12px"><span>Note</span><input class="input" data-w="note" maxlength="300" value="${w.note}"></label>
      <p class="tiny faint" style="margin-top:8px">${x.deadlineDays != null ? `Échéance utilisée pour le signal : dans ${Math.max(0, Math.round(x.deadlineDays))} jours${w.deadline ? "" : " (d'après ton plan de budget)"}.` : "Sans échéance, le signal « Urgent » ne s'applique pas."}</p>`
      : html`<p class="small muted">Ce produit n'est pas dans ta watchlist.</p><button class="btn btn-sm" style="margin-top:10px" data-act="watch">${icon("star", { size: 14 })}Ajouter à la watchlist</button>`}
  </div></section>`;
}
function alertsPanel(x, alerts, cur) {
  return html`<section class="panel" data-sec="alerts"><div class="panel-head"><h2>${icon("bell", { size: 16 })}Alertes</h2><button class="btn btn-sm" data-act="alert">${icon("plus", { size: 14 })}Nouvelle</button></div>
    <div class="panel-body" style="padding-top:6px">${alerts.length ? alerts.map(a => html`<div class="check ${a.enabled ? "" : "faint"}" style="justify-content:space-between;align-items:center"><span>${describeAlert(a, cur)}${a.lastTriggeredAt ? html` <span class="tiny faint">· ${fmtAgo(a.lastTriggeredAt)}</span>` : ""}</span><a class="btn btn-ghost btn-sm" href="#/alerts">Gérer</a></div>`) : html`<p class="small muted">Aucune alerte pour ce produit.</p>`}</div></section>`;
}
function shopsPanel(p) {
  const q = p.query || p.name;
  return html`<section class="panel"><div class="panel-head"><h2>${icon("external", { size: 16 })}Comparer les offres</h2></div><div class="panel-body">
    <div class="chips">${RETAILERS.map(r => html`<a class="chip" href="${r.search(q)}" target="_blank" rel="noopener noreferrer" title="${r.note}">${r.name}${r.kind === "used" ? html` <span class="n">occasion</span>` : ""}</a>`)}</div>
    <p class="tiny faint" style="margin-top:10px">Liens de recherche, pas des prix : le site ne lit pas les boutiques à ta place. Note le meilleur prix fiable avec « Ajouter ».</p></div></section>`;
}

export default {
  title: "Produit",
  render({ state, d, params }) {
    const x = d.byId.get(params[0]);
    if (!x) return { title: "Introuvable", html: html`<div class="callout warn">${icon("warning")}<span>Ce produit n'existe pas ou a été supprimé. <a href="#/market">Retour au marché</a></span></div>` };
    const cur = state.settings.currency;
    const avail = periodAvailability(x.obs);
    const def = avail["90d"] ? "90d" : "all";
    return {
      title: x.product.name,
      html: html`
      <div class="actions" style="justify-content:space-between;margin-bottom:12px"><a class="btn btn-ghost btn-sm" href="#/market">${icon("chevronLeft", { size: 14 })}Marché</a>
        <div class="actions"><button class="btn btn-sm" data-act="edit">${icon("edit", { size: 14 })}Modifier</button><button class="btn btn-sm btn-danger" data-act="delete">${icon("trash", { size: 14 })}Supprimer</button><button class="btn btn-primary btn-sm" data-act="obs">${icon("plus", { size: 14 })}Relevé</button></div></div>
      ${head(x, cur)}
      <section class="panel chart-panel">
        <div class="chart-tools">
          <div class="seg" role="group" aria-label="Période" data-periods>${PERIODS.map(p => html`<button data-period="${p.id}" aria-pressed="${p.id === def}" ${avail[p.id] ? "" : "disabled"} title="${avail[p.id] ? p.label : "Pas assez de relevés sur cette période"}">${p.label}</button>`)}</div>
          <div class="chart-legend" data-legend>${[["target", "Cible", "var(--accent)"], ["min", "Min", "var(--pos)"], ["max", "Max", "var(--neg)"], ["avg", "Moyenne", "var(--text-3)"]].map(([k, l, c]) => html`<button data-ref="${k}" aria-pressed="true" style="color:${c}"><i></i>${l}</button>`)}</div>
        </div>
        <div data-chart class="chart-host">${x.obs.length ? html`<div class="skeleton" style="position:absolute;inset:0"></div>` : emptyState("Aucun relevé : ajoute un prix pour démarrer le graphique.", "pulse")}</div>
        <div class="chart-note" data-engine>${icon("info", { size: 14 })}<span>Molette ou pincement pour zoomer, glisser pour se déplacer. Les points sont tes relevés : aucune valeur n'est interpolée.</span></div>
      </section>
      ${stats(x, cur)}
      <div class="grid cols-3" style="margin-top:14px">
        <div class="span-2" style="display:flex;flex-direction:column;gap:14px">${signalPanel(x)}${obsPanel(x, cur)}</div>
        <div style="display:flex;flex-direction:column;gap:14px">${watchPanel(x, cur)}${alertsPanel(x, state.alerts.filter(a => a.productId === x.product.id), cur)}${shopsPanel(x.product)}</div>
      </div>`,
      mount(el, ctx) {
        const id = x.product.id;
        let chart = null, alive = true, period = def;
        const host = $("[data-chart]", el);
        if (x.obs.length) priceChart(host, { obs: x.obs, refs: refsOf(x), currency: cur, style: ctx.store.state.settings.chartStyle, markers: ctx.store.state.settings.chartMarkers, period }).then(c => {
          if (!alive) return c.destroy();
          chart = c; host.dataset.engine = c.engine;
          if (c.engine === "svg") $("[data-engine] span", el).textContent = "Graphique simplifié (la librairie de graphiques n'a pas pu se charger) : infobulle et périodes disponibles, zoom indisponible.";
        });
        const cur2 = () => ctx.store.state.settings.currency;
        const getX = () => ctx.store.derived.byId.get(id);
        const replace = (sel, frag) => { const n = $(`[data-sec="${sel}"]`, el); if (n) n.outerHTML = frag.s; };
        const commitWatch = (field, value) => ctx.store.commit("watchlist", s => { const w = s.watchlist.find(w => w.productId === id); if (w) w[field] = value; }, { source: location.hash });
        const offs = [
          on(el, "click", "[data-period]", (e, b) => { period = b.dataset.period; el.querySelectorAll("[data-period]").forEach(p => p.setAttribute("aria-pressed", String(p === b))); chart?.setPeriod(period); }),
          on(el, "click", "[data-ref]", (e, b) => { const v = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(v)); chart?.setRefsVisible({ [b.dataset.ref]: v }); }),
          on(el, "click", "[data-act]", (e, b) => {
            const a = b.dataset.act, xx = getX();
            if (a === "obs") observationDialog(ctx.store, { productId: id });
            if (a === "edit") productDialog(ctx.store, xx.product);
            if (a === "delete") deleteProduct(ctx.store, xx.product).then(ok => ok && (location.hash = "#/market"));
            if (a === "alert") alertDialog(ctx.store, { productId: id });
            if (a === "watch") ctx.store.commit("watchlist", s => s.watchlist.push({ productId: id, target: null, priority: "medium", note: "", favorite: false, deadline: null, order: s.watchlist.length }));
          }),
          on(el, "click", "[data-edit]", (e, b) => observationDialog(ctx.store, { obs: ctx.store.state.observations.find(o => o.id === b.dataset.edit) })),
          on(el, "click", "[data-del]", (e, b) => deleteObservation(ctx.store, ctx.store.state.observations.find(o => o.id === b.dataset.del))),
          on(el, "change", "[data-w]", (e, i) => {
            const f = i.dataset.w;
            let v = i.value;
            if (f === "target") { v = v.trim() ? Number(v.replace(",", ".")) : null; if (v != null && !(v > 0)) { i.setAttribute("aria-invalid", "true"); toast("Prix cible invalide", { tone: "bad" }); return; } i.removeAttribute("aria-invalid"); }
            if (f === "deadline") v = v ? new Date(v + "T12:00").getTime() : null;
            commitWatch(f, v);
            toast("Suivi mis à jour", { tone: "ok", timeout: 1800 });
          }),
        ];
        return {
          cleanup() { alive = false; chart?.destroy(); offs.forEach(o => o()); },
          update(change) {
            if (!["observations", "watchlist", "alerts", "notifications", "budget"].includes(change.type)) return false;
            const xx = getX(); if (!xx) return false;
            const c = cur2();
            replace("head", head(xx, c)); replace("stats", stats(xx, c)); replace("signal", signalPanel(xx)); replace("obs", obsPanel(xx, c));
            if (change.source !== location.hash) replace("watch", watchPanel(xx, c));
            replace("alerts", alertsPanel(xx, ctx.store.state.alerts.filter(a => a.productId === id), c));
            if (!chart && xx.obs.length) return false; // first observation: full mount creates the chart
            chart?.setData(xx.obs, refsOf(xx));
            const av = periodAvailability(xx.obs);
            el.querySelectorAll("[data-period]").forEach(b => { b.disabled = !av[b.dataset.period]; });
            return true;
          },
        };
      },
    };
  },
};
