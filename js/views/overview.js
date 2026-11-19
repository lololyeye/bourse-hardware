import { html, on } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { indexChart } from "../ui/chart.js";
import { fmtNum, fmtPct, fmtDate, monthLabel, DAY } from "../core/format.js";
import { EVENTS, catById } from "../core/catalog.js";
import { MIN_VERIFIED } from "../core/analytics.js";
import { money, delta, freshBadge, signalBadge, productHref, observationDialog, batchDialog, emptyState } from "./common.js";

const KIND = { observed: ["OBSERVÉ", ""], stat: ["STATISTIQUE", "info"], trend: ["TENDANCE", "info"], target: ["OBJECTIF", "est"], data: ["DONNÉES", "bad"] };
export const kindTag = k => html`<span class="tag ${KIND[k]?.[1] || ""}">${KIND[k]?.[0] || k}</span>`;

function row(x, cur, right) {
  return html`<a href="${productHref(x.product.id)}"><span class="nm">${x.product.name}</span><span class="rt">${right}</span><span class="sub">${catById(x.product.category).short} · ${freshBadge(x)}</span></a>`;
}
function card(title, ic, body, foot = null) {
  return html`<section class="panel"><div class="panel-head"><h2>${icon(ic, { size: 16 })}${title}</h2></div><div class="panel-body">${body}</div>${foot ? html`<div class="panel-foot">${foot}</div>` : ""}</section>`;
}

export function upcomingEvents(now = Date.now(), n = 3) {
  return EVENTS.map(e => ({ ...e, s: new Date(e.start + "T00:00").getTime(), e2: new Date(e.end + "T23:59").getTime() })).filter(e => e.e2 >= now).slice(0, n);
}

export default {
  title: "Vue d'ensemble",
  render({ state, d }) {
    const cur = state.settings.currency, ix = d.index, rows = d.rows.filter(r => r.st.n), now = d.now;
    const verifiedProducts = d.rows.filter(r => r.ver.length >= MIN_VERIFIED).length;
    const opp = d.rows.filter(r => r.signal.code === "EXCELLENT" || r.signal.code === "GOOD").sort((a, b) => b.signal.rank - a.signal.rank || b.score.total - a.score.total).slice(0, 5);
    const drops = rows.filter(r => r.st.changePrev < 0).sort((a, b) => a.st.changePrev - b.st.changePrev).slice(0, 5);
    const rises = rows.filter(r => r.st.changePrev > 0).sort((a, b) => b.st.changePrev - a.st.changePrev).slice(0, 5);
    const near = rows.filter(r => r.watch?.target).map(r => ({ r, dist: (r.st.cur - r.watch.target) / r.watch.target * 100 })).filter(x => x.dist <= 10).sort((a, b) => a.dist - b.dist).slice(0, 5);
    const lows = rows.filter(r => r.ver.length >= MIN_VERIFIED && r.st.cur <= Math.min(...r.ver.map(o => o.price)) && Math.max(...r.ver.map(o => o.price)) > r.st.cur).slice(0, 5);
    const events = upcomingEvents(now);
    const nextBuy = d.plan.items.find(i => i.status === "planned");
    const b = state.budget, safety = d.plan.safetyTarget;
    const breadthTotal = ix.rising + ix.falling + ix.flat || 1;
    const dirLabel = { up: "En hausse", down: "En baisse", flat: "Stable", unknown: "Pas assez de données" }[ix.direction];
    const changeCell = (label, v) => html`<div><span>${label}</span><b class="num">${v == null ? html`<span class="faint" title="Pas de relevé sur cette période">—</span>` : delta(v)}</b></div>`;

    const todo = [];
    if (!d.lastObservationAt || now - d.lastObservationAt > state.settings.reminderDays * DAY) todo.push(html`<div class="insight"><span class="k">${icon("edit", { size: 16, cls: "warn" })}</span><span><b>${d.lastObservationAt ? "Relevé en retard" : "Fais ton premier relevé"}</b><br><span class="small muted">Les signaux d'achat demandent ${MIN_VERIFIED} relevés vérifiés par produit. ${verifiedProducts}/${d.rows.length} produits y sont.</span></span></div>`);
    if (nextBuy) todo.push(html`<div class="insight"><span class="k">${icon("wallet", { size: 16 })}</span><span><b>Prochain achat : ${nextBuy.label}</b><br><span class="small muted">${money(nextBuy.cost, cur)}${nextBuy.known ? "" : " (prix incomplet)"} · finançable en ${monthLabel(nextBuy.date)}</span></span></div>`);
    if (b.saved < safety) todo.push(html`<div class="insight"><span class="k">${icon("shield", { size: 16, cls: "warn" })}</span><span><b>Matelas de sécurité : ${money(b.saved, cur)} / ${money(safety, cur)}</b><br><span class="small muted">Un mois de dépenses de côté avant de tout mettre dans le PC.</span></span></div>`);

    return {
      title: "Vue d'ensemble",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${fmtDate(now, "fr")}</div><h1>Vue d'ensemble du marché</h1></div>
        <div class="actions"><button class="btn" data-act="batch">${icon("edit", { size: 16 })}Relevé groupé</button><button class="btn btn-primary" data-act="obs">${icon("plus", { size: 16 })}Nouveau relevé</button></div></div>

      <section class="hero">
        <div class="hero-main">
          <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Indice HW · base 100</span><span class="tag ${ix.direction === "up" ? "bad" : ix.direction === "down" ? "ok" : ""}">${dirLabel}</span></div>
          <div class="hero-value">${ix.value != null ? fmtNum(ix.value, 1) : "—"}</div>
          <div class="hero-changes">${changeCell("24H", ix.c1)}${changeCell("7 JOURS", ix.c7)}${changeCell("30 JOURS", ix.c30)}</div>
          <div><div class="breadth" style="margin-bottom:6px"><span><b>${ix.rising}</b> en hausse</span><span><b>${ix.falling}</b> en baisse</span><span><b>${ix.flat}</b> stables</span></div>
            <div class="breadth-bar"><i class="r" style="width:${ix.rising / breadthTotal * 100}%"></i><i class="s" style="width:${ix.flat / breadthTotal * 100}%"></i><i class="f" style="width:${ix.falling / breadthTotal * 100}%"></i></div>
            <p class="tiny faint" style="margin-top:4px">Comparaison entre les deux derniers relevés de chaque produit.</p></div>
          <details class="explain"><summary>${icon("info", { size: 14 })} Comment l'indice est calculé</summary>
            <p>Moyenne, à poids égal, du prix de chaque produit suivi divisé par son premier prix connu (×100). 100 = niveau de départ ; 110 = 10 % plus cher en moyenne. Les variations ne sont calculées que si un relevé existe sur la période. ${ix.tracked} produits, dont ${Math.round(ix.estimateShare * 100)} % dont le dernier prix est une estimation.</p></details>
        </div>
        <div class="hero-chart" data-index-chart>${ix.series.length < 2 ? emptyState("La courbe de l'indice apparaîtra après tes premiers relevés.", "pulse") : ""}</div>
      </section>
      ${ix.estimateShare > 0.5 ? html`<div class="callout warn" style="margin-top:14px">${icon("warning")}<span>La plupart des derniers prix sont des <b>estimations de départ</b>, pas des relevés. L'indice et la tendance ne reflètent donc pas encore le marché réel.</span></div>` : ""}

      <div class="grid cols-3 stagger" style="margin-top:14px">
        <section class="panel span-2"><div class="panel-head"><h2>${icon("pulse", { size: 16 })}Résumé du marché</h2><span class="tiny faint">Généré à partir de tes relevés uniquement</span></div>
          <div class="panel-body insights">${d.summary.map(s => html`<div class="insight"><span class="k">${kindTag(s.kind)}</span><span>${s.text}</span></div>`)}</div></section>
        ${card("À faire", "check", todo.length ? html`<div class="insights">${todo}</div>` : emptyState("Rien d'urgent.", "check"))}
      </div>

      <div class="grid cols-3 stagger" style="margin-top:14px">
        ${card("Meilleures opportunités", "spark", opp.length ? html`<div class="mlist">${opp.map(x => row(x, cur, html`${signalBadge(x.signal)}<div class="num small" style="margin-top:3px">${money(x.st.cur, cur)}</div>`))}</div>` : emptyState(`Aucune opportunité confirmée par les données (${MIN_VERIFIED} relevés vérifiés minimum par produit).`, "spark"), html`<a href="#/timing">Classement complet ${icon("chevronRight", { size: 14 })}</a>`)}
        ${card("Plus fortes baisses", "trendDown", drops.length ? html`<div class="mlist">${drops.map(x => row(x, cur, html`<div class="num">${money(x.st.cur, cur)}</div>${delta(x.st.changePrev)}`))}</div>` : emptyState("Aucune baisse entre deux relevés.", "trendDown"))}
        ${card("Plus fortes hausses", "trendUp", rises.length ? html`<div class="mlist">${rises.map(x => row(x, cur, html`<div class="num">${money(x.st.cur, cur)}</div>${delta(x.st.changePrev)}`))}</div>` : emptyState("Aucune hausse entre deux relevés.", "trendUp"))}
        ${card("Proches de ta cible", "target", near.length ? html`<div class="mlist">${near.map(({ r, dist }) => row(r, cur, html`<div class="num">${money(r.st.cur, cur)}</div><span class="small ${dist <= 0 ? "pos" : "muted"}">${dist <= 0 ? "sous la cible" : `${fmtPct(dist)} vs ${money(r.watch.target, cur)}`}</span>`))}</div>` : emptyState("Aucun produit à moins de 10 % de sa cible.", "target"))}
        ${card("Au plus bas historique", "arrowDown", lows.length ? html`<div class="mlist">${lows.map(x => row(x, cur, html`<div class="num">${money(x.st.cur, cur)}</div><span class="small muted">${x.ver.length} relevés</span>`))}</div>` : emptyState(`Aucun produit à son plus bas (≥ ${MIN_VERIFIED} relevés vérifiés).`, "arrowDown"))}
        ${card("Promos à venir", "calendar", html`<div class="mlist">${events.map(e => { const days = Math.ceil((e.s - now) / DAY); return html`<a href="#/timing"><span class="nm">${e.name}${e.sure ? "" : html` <span class="tag">INDICATIF</span>`}</span><span class="rt num">${now >= e.s ? html`<span class="pos">en cours</span>` : `J-${days}`}</span><span class="sub">${fmtDate(e.s)}${e.e2 - e.s > DAY ? ` → ${fmtDate(e.e2)}` : ""}</span></a>`; })}</div>`)}
      </div>`,
      mount(el, ctx) {
        let chart = null, alive = true;
        if (ix.series.length >= 2) indexChart(el.querySelector("[data-index-chart]"), ix.series).then(c => { if (alive) chart = c; else c.destroy(); });
        const off = on(el, "click", "[data-act]", (e, btn) => (btn.dataset.act === "batch" ? batchDialog(ctx.store) : observationDialog(ctx.store)));
        return { cleanup() { alive = false; chart?.destroy(); off(); } };
      },
    };
  },
};
