import { html, on, $ } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { SIGNALS, DEFAULT_WEIGHTS, buyScore } from "../core/analytics.js";
import { fmtDate, fmtPct, DAY } from "../core/format.js";
import { EVENTS, catById } from "../core/catalog.js";
import { money, signalBadge, productHref, freshBadge, emptyState } from "./common.js";
import { kindTag } from "./overview.js";

const W = { price: ["Prix vs cible", "Plus le prix est sous ta cible, plus le score monte."], low: ["Plus bas historique", "Proximité du plus bas observé (relevés vérifiés)."], trend: ["Tendance", "Une hausse en cours pousse à acheter plus tôt."], urgency: ["Urgence", "Échéance proche (watchlist ou plan de budget), sinon priorité."], budget: ["Budget", "Part du prix que tu peux payer maintenant avec ton plan."] };

function ranking(store) {
  const st = store.state, d = store.derived, cur = st.settings.currency, w = st.settings.weights;
  const avail = d.plan.pcStart + st.budget.pcMonthly;
  const rows = d.rows.filter(r => r.watch && r.st.n).map(r => ({ r, score: buyScore(r.obs, r.watch, { now: d.now, deadlineDays: r.deadlineDays, available: avail }, w) }))
    .sort((a, b) => (b.score.usable - a.score.usable) || (b.score.total - a.score.total));
  if (!rows.length) return emptyState("Ajoute des produits avec un prix à ta watchlist pour obtenir un classement.", "clock").s;
  return html`<table class="dt stack"><thead><tr><th>#</th><th>Produit</th><th>Signal</th><th>Score d'achat</th><th class="r">Prix / cible</th><th>Explication</th></tr></thead><tbody>
    ${rows.map(({ r, score }, i) => { const reason = r.signal.reasons.find(x => x.kind === "stat") || r.signal.reasons.find(x => x.kind === "data") || r.signal.reasons.find(x => x.kind === "target");
      return html`<tr class="link" data-href="${productHref(r.product.id)}" tabindex="0"><td class="num faint" data-m="hide">${i + 1}</td>
      <td><div class="pname">${r.product.name}</div><div class="psub">${catById(r.product.category).short} · ${freshBadge(r)}</div></td>
      <td>${signalBadge(r.signal)}</td>
      <td data-m="full"><div class="score"><span class="bar"><i style="width:${score.total}%;${score.usable ? "" : "background:var(--text-4)"}"></i></span><b>${score.total}</b></div>
        <div class="parts" style="margin-top:6px">${Object.keys(W).map(k => html`<div title="${W[k][1]}">${W[k][0].split(" ")[0]}<i><b style="width:${Math.round((score.parts[k] ?? 0) * 100)}%"></b></i></div>`)}</div>
        ${score.usable ? "" : html`<div class="tiny faint" style="margin-top:4px">Score indicatif : données insuffisantes.</div>`}</td>
      <td class="r num">${money(r.st.cur, cur)}<div class="psub">${r.watch.target ? `cible ${money(r.watch.target, cur)}` : "pas de cible"}</div></td>
      <td data-m="full" class="small muted" style="max-width:320px">${reason ? html`${kindTag(reason.kind)} ${reason.text}` : ""}</td></tr>`; })}
  </tbody></table>`.s;
}

export default {
  title: "Quand acheter",
  render({ state, d }) {
    const w = state.settings.weights, now = d.now;
    const events = EVENTS.map(e => ({ ...e, s: new Date(e.start + "T00:00").getTime(), e2: new Date(e.end + "T23:59").getTime() }));
    return {
      title: "Quand acheter",
      html: html`
      <div class="page-head"><div><div class="eyebrow">Moteur d'analyse</div><h1>Quand acheter ?</h1><p>Classement des produits de ta watchlist selon l'intérêt d'acheter maintenant. Chaque score se décompose en critères que tu peux pondérer.</p></div></div>
      <div class="grid cols-3">
        <section class="panel span-2"><div class="panel-head"><h2>${icon("sort", { size: 16 })}Classement</h2></div><div class="panel-body" style="padding:8px 0 0"><div data-rank>${""}</div></div></section>
        <section class="panel"><div class="panel-head"><h2>${icon("settings", { size: 16 })}Importance des critères</h2><button class="btn btn-ghost btn-sm" data-reset>Par défaut</button></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">${Object.entries(W).map(([k, [label, help]]) => html`<label class="field"><span style="display:flex;justify-content:space-between">${label}<b class="num" data-wv="${k}">${w[k]}</b></span><input class="range" type="range" min="0" max="5" step="1" value="${w[k]}" data-w="${k}" aria-describedby="h-${k}"><small id="h-${k}">${help}</small></label>`)}</div></section>
      </div>
      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel"><div class="panel-head"><h2>${icon("info", { size: 16 })}Les signaux</h2></div><div class="panel-body"><ul class="reasons">${Object.entries(SIGNALS).sort((a, b) => b[1].rank - a[1].rank).map(([k, s]) => html`<li style="grid-template-columns:170px 1fr">${signalBadge(s)}<span>${s.def}</span></li>`)}</ul></div></section>
        <section class="panel"><div class="panel-head"><h2>${icon("shield", { size: 16 })}D'où vient chaque information</h2></div><div class="panel-body"><ul class="reasons">
          <li>${kindTag("observed")}<span>Un prix que tu as relevé (ou une estimation de départ, toujours signalée).</span></li>
          <li>${kindTag("stat")}<span>Calcul sur tes relevés vérifiés : min, moyenne, max. Au moins 3 relevés.</span></li>
          <li>${kindTag("trend")}<span>Pente estimée par régression sur 30 jours. Ce n'est pas une prévision.</span></li>
          <li>${kindTag("target")}<span>Ce que tu as défini : prix cible, échéance, budget.</span></li>
          <li>${kindTag("data")}<span>Limite des données : trop peu de relevés, prix périmé.</span></li></ul></div></section>
      </div>
      <section class="panel" style="margin-top:14px"><div class="panel-head"><h2>${icon("calendar", { size: 16 })}Calendrier des promotions</h2></div><div class="panel-body"><div class="events">
        ${events.map(e => { const st = now > e.e2 ? "past" : now >= e.s ? "live" : e.s - now < 14 * DAY ? "soon" : ""; const days = Math.ceil((e.s - now) / DAY);
          return html`<div class="event ${st}"><div class="when">${fmtDate(e.s)}${e.e2 - e.s > DAY ? ` → ${fmtDate(e.e2)}` : ""}</div><h4>${e.name} ${e.sure ? "" : html`<span class="tag">INDICATIF</span>`}</h4><div class="cd">${st === "past" ? "Terminé" : st === "live" ? html`<span class="pos">En cours</span>` : `J-${days}`}</div><p>${e.tip}</p></div>`; })}
      </div></div></section>
      <section class="panel" style="margin-top:14px"><div class="panel-head"><h2>${icon("shield", { size: 16 })}Acheter sans se faire avoir</h2></div><div class="panel-body grid cols-3">
        <div><b>Neuf</b><p class="small muted">LDLC, Materiel.net, Amazon « vendu et expédié par Amazon ». Garantie légale 2 ans, rétractation 14 jours en ligne.</p></div>
        <div><b>Prix trop beau</b><p class="small muted">25 % sous les autres boutiques : vendeur tiers douteux, mauvaise version (8 Go) ou arnaque.</p></div>
        <div><b>Fausses promos</b><p class="small muted">Compare à ton historique ici et sur Idealo : un « -30 % » sur un prix gonflé n'est pas une promo.</p></div>
        <div><b>Occasion</b><p class="small muted">En main propre, pièce testée 10 min sous charge. Jamais de virement à un inconnu.</p></div>
        <div><b>Carte graphique</b><p class="small muted">Vise 16 Go de mémoire vidéo pour durer.</p></div>
        <div><b>Pas de certitude</b><p class="small muted">Aucun outil ne connaît les prix futurs. Les signaux résument le passé observé.</p></div>
      </div></section>`,
      mount(el, ctx) {
        const box = $("[data-rank]", el);
        const draw = () => { box.innerHTML = ranking(ctx.store); };
        draw();
        const offs = [
          on(el, "input", "[data-w]", (e, i) => { $(`[data-wv="${i.dataset.w}"]`, el).textContent = i.value; ctx.store.commit("settings", s => (s.settings.weights[i.dataset.w] = Number(i.value)), { source: location.hash }); draw(); }),
          on(el, "click", "[data-reset]", () => ctx.store.commit("settings", s => (s.settings.weights = { ...DEFAULT_WEIGHTS }))),
          on(el, "click", "tr[data-href]", (e, tr) => (location.hash = tr.dataset.href)),
        ];
        return { cleanup: () => offs.forEach(o => o()), update(c) { if (["observations", "watchlist", "budget"].includes(c.type)) { draw(); return true; } return false; } };
      },
    };
  },
};
