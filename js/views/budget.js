import { html, on, $, $$, toast, formDialog, confirmDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { monthLabel, uid } from "../core/format.js";
import { money } from "./common.js";

const FIELDS = [
  ["net", "Salaire net mensuel"], ["fixed", "Charges fixes (loyer, abonnements…)"], ["life", "Vie courante (courses, essence…)"],
  ["saved", "Déjà épargné aujourd'hui"], ["pcMonthly", "Mis de côté pour le PC / mois"], ["safetyMonthly", "Épargne de sécurité / mois"],
];
const num = v => { const n = Number(String(v).replace(",", ".").replace(/\s/g, "")); return Number.isFinite(n) && n >= 0 ? n : null; };

function summary(store) {
  const st = store.state, b = st.budget, p = store.derived.plan, cur = st.settings.currency;
  const free = b.net - b.fixed - b.life - b.pcMonthly - b.safetyMonthly;
  const parts = [["fixed", b.fixed, "var(--text-4)", "Charges"], ["life", b.life, "var(--info)", "Vie courante"], ["pc", b.pcMonthly, "var(--accent)", "PC"], ["safe", b.safetyMonthly, "var(--pos)", "Sécurité"], ["free", Math.max(0, free), "var(--bg-3)", "Libre"]];
  const tot = Math.max(b.net, b.fixed + b.life + b.pcMonthly + b.safetyMonthly) || 1;
  const safePct = p.safetyTarget ? Math.min(100, (b.saved / p.safetyTarget) * 100) : 100;
  const monthsToSafe = b.saved >= p.safetyTarget ? 0 : b.safetyMonthly > 0 ? Math.ceil((p.safetyTarget - b.saved) / b.safetyMonthly) : null;
  return html`
    <div class="alloc" role="img" aria-label="Répartition du salaire">${parts.map(([, v, c]) => html`<i style="width:${(v / tot) * 100}%;background:${c}"></i>`)}</div>
    <div class="legend">${parts.map(([, v, c, l]) => html`<span style="--c:${c}">${l} ${money(v, cur)}</span>`)}</div>
    ${free < 0 ? html`<div class="callout bad" style="margin-top:12px">${icon("warning")}<div><b>Budget dépassé de ${money(-free, cur)} par mois.</b><p class="small">Réduis la part PC ou la vie courante : un plan d'achat qui creuse un découvert n'est pas tenable.</p></div></div>` : ""}
    <div class="grid cols-3" style="margin-top:14px">
      <div class="stat"><div class="k">Reste libre / mois</div><div class="v ${free < 0 ? "neg" : ""}">${money(free, cur)}</div></div>
      <div class="stat"><div class="k">Coussin de sécurité</div><div class="v">${money(b.saved, cur)}</div><div class="s">objectif ${money(p.safetyTarget, cur)} (1 mois de charges + vie)</div></div>
      <div class="stat"><div class="k">Plan terminé</div><div class="v">${p.end ? monthLabel(p.end) : p.items.every(i => i.status === "done") ? "Fini" : "—"}</div><div class="s">${p.reachable ? `${money(p.net, cur)} net après revente` : "pas atteignable en 4 ans"}</div></div>
    </div>
    <div style="margin-top:12px"><div class="small muted" style="display:flex;justify-content:space-between"><span>Coussin de sécurité</span><span class="num">${Math.round(safePct)} %</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${Math.round(safePct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Coussin de sécurité"><i style="width:${safePct}%"></i></div>
      <p class="tiny faint" style="margin-top:6px">${monthsToSafe === 0 ? "Coussin atteint : le surplus d'épargne finance le PC." : monthsToSafe == null ? "Aucune épargne de sécurité mensuelle : le coussin ne se remplira pas." : `Coussin atteint dans ~${monthsToSafe} mois. Tant qu'il n'est pas plein, seule la part PC mensuelle sert aux achats.`}</p></div>`;
}

function planList(store) {
  const st = store.state, p = store.derived.plan, cur = st.settings.currency, name = id => st.products.find(x => x.id === id)?.name || id;
  return html`${p.items.map((it, i) => html`<div class="plan-row ${it.done ? "done" : ""}" draggable="true" data-id="${it.id}">
    <span class="grip" aria-hidden="true" title="Glisser pour réordonner">${icon("grip", { size: 16 })}</span>
    <button class="n" data-done aria-pressed="${it.done}" aria-label="${it.done ? "Marquer comme non acheté" : "Marquer comme acheté"}">${it.done ? icon("check", { size: 14 }) : i + 1}</button>
    <div style="min-width:0"><div class="pl-name" style="font-weight:500">${it.label}</div>
      <div class="psub">${it.productIds.length ? it.productIds.map(name).join(" + ") : "Prix fixé à la main"}${it.extra ? ` + ${money(it.extra, cur)} divers` : ""}${it.resale && st.budget.countResale ? ` · revente ${it.resaleLabel || "ancienne pièce"} ${money(it.resale, cur)}` : ""}</div>
      ${it.note ? html`<div class="tiny faint">${it.note}</div>` : ""}
      ${!it.known && it.fixedPrice == null ? html`<div class="tiny" style="color:var(--warn)">Prix manquant : ajoute un relevé ou fixe un prix.</div>` : ""}</div>
    <div class="num pl-cost" style="text-align:right"><b>${money(it.cost, cur)}</b><div class="psub">${it.fixedPrice != null ? "fixé" : "prix suivi"}</div></div>
    <div class="small pl-when">${it.status === "done" ? html`<span class="pos">Acheté</span>` : it.status === "unreachable" ? html`<span class="neg">Hors horizon</span>` : html`<b>${monthLabel(it.date)}</b><div class="psub">reste ${money(it.left, cur)} après</div>`}</div>
    <div class="actions pl-act" style="flex-wrap:nowrap">
      <button class="btn btn-ghost btn-sm btn-icon" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="Avancer">${icon("chevronUp", { size: 14 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-mv="1" ${i === p.items.length - 1 ? "disabled" : ""} aria-label="Reculer">${icon("chevronDown", { size: 14 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-edit aria-label="Modifier">${icon("edit", { size: 14 })}</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-del aria-label="Supprimer">${icon("trash", { size: 14 })}</button></div>
  </div>`)}`;
}

function timeline(store) {
  const p = store.derived.plan, cur = store.state.settings.currency;
  const planned = p.items.filter(i => i.status === "planned");
  if (!planned.length) return html`<p class="small muted">Rien de planifié.</p>`;
  const n = Math.min(24, Math.max(...planned.map(i => i.month)) + 2);
  const base = new Date(); const m0 = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return html`<div class="months">${Array.from({ length: n }, (_, k) => { const buys = planned.filter(i => i.month === k); const dt = new Date(m0.getFullYear(), m0.getMonth() + k, 1);
    return html`<div class="month ${buys.length ? "" : "empty-m"}"><h4>${monthLabel(dt)}</h4>${buys.map(b => html`<div class="buy">${b.label}<div class="tiny faint num">${money(b.cost, cur)}</div></div>`)}</div>`; })}</div>`;
}

async function itemDialog(store, item = null) {
  const st = store.state, it = item || { label: "", productIds: [], fixedPrice: null, extra: 0, note: "", resaleLabel: "", resale: 0 };
  const prods = [...st.products].sort((a, b) => a.name.localeCompare(b.name));
  const v = await formDialog({
    title: item ? "Modifier l'achat" : "Ajouter un achat au plan", wide: true,
    body: html`<label class="field"><span>Nom</span><input class="input" name="label" required maxlength="80" value="${it.label}"></label>
      <fieldset class="field"><legend style="font-size:12.5px;color:var(--text-2);margin-bottom:6px">Produits suivis (le prix suit le dernier relevé)</legend>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 12px;max-height:180px;overflow:auto">${prods.map(p => html`<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="p_${p.id}" ${it.productIds.includes(p.id) ? "checked" : ""}>${p.name}</label>`)}</div></fieldset>
      <div class="grid-form">
        <label class="field"><span>Prix fixé <small>(remplace les prix suivis)</small></span><input class="input num" name="fixedPrice" inputmode="decimal" value="${it.fixedPrice ?? ""}"></label>
        <label class="field"><span>Divers en plus</span><input class="input num" name="extra" inputmode="decimal" value="${it.extra || ""}"></label>
        <label class="field"><span>Pièce revendue</span><input class="input" name="resaleLabel" maxlength="60" value="${it.resaleLabel}"></label>
        <label class="field"><span>Prix de revente estimé</span><input class="input num" name="resale" inputmode="decimal" value="${it.resale || ""}"></label></div>
      <label class="field"><span>Note</span><input class="input" name="note" maxlength="200" value="${it.note}"></label>`,
    submit: item ? "Enregistrer" : "Ajouter",
    validate: x => (x.label.trim().length < 2 ? "Donne un nom." : ["fixedPrice", "extra", "resale"].some(k => x[k].trim() && num(x[k]) == null) ? "Montant invalide." : !x.fixedPrice.trim() && !Object.keys(x).some(k => k.startsWith("p_") && x[k]) ? "Choisis au moins un produit ou fixe un prix." : null),
  });
  if (!v) return null;
  return { label: v.label.trim(), productIds: prods.filter(p => v[`p_${p.id}`]).map(p => p.id), fixedPrice: v.fixedPrice.trim() ? num(v.fixedPrice) : null, extra: num(v.extra) || 0, resaleLabel: v.resaleLabel.trim(), resale: num(v.resale) || 0, note: v.note.trim() };
}

export default {
  title: "Budget",
  render({ state }) {
    const b = state.budget, cur = state.settings.currency;
    return {
      title: "Budget",
      html: html`
      <div class="page-head"><div><div class="eyebrow">Plan d'achat</div><h1>Budget & ordre d'achat</h1><p>Le plan respecte d'abord ton coussin de sécurité, puis place chaque achat au premier mois où il est payable. Réordonne : tout se recalcule.</p></div>
        <div class="actions"><button class="btn btn-primary" data-act="add">${icon("plus", { size: 16 })}Ajouter un achat</button></div></div>
      <div class="grid cols-3">
        <section class="panel"><div class="panel-head"><h2>${icon("wallet", { size: 16 })}Tes chiffres</h2></div><div class="panel-body" style="display:flex;flex-direction:column;gap:12px">
          ${FIELDS.map(([k, l]) => html`<label class="field"><span>${l}</span><span class="input-affix"><input class="input num" data-b="${k}" inputmode="decimal" value="${b[k]}"><em>${cur}</em></span></label>`)}
          <label class="switch"><input type="checkbox" data-resale ${b.countResale ? "checked" : ""}><span class="track"></span>Compter la revente des anciennes pièces</label>
          <p class="tiny faint">Rien n'est envoyé nulle part : ces chiffres restent dans ce navigateur et ne sont jamais inclus dans un lien partagé sauf si tu le choisis.</p></div></section>
        <section class="panel span-2"><div class="panel-head"><h2>${icon("overview", { size: 16 })}Répartition mensuelle</h2></div><div class="panel-body" data-sum></div></section>
      </div>
      <section class="panel" style="margin-top:14px"><div class="panel-head"><h2>${icon("layers", { size: 16 })}Ordre d'achat</h2><span class="tiny faint">Glisse, ou utilise les flèches</span></div><div class="panel-body"><div class="plan-list" data-plan></div></div></section>
      <section class="panel" style="margin-top:14px"><div class="panel-head"><h2>${icon("calendar", { size: 16 })}Calendrier</h2></div><div class="panel-body" data-tl></div></section>
      <div class="callout info" style="margin-top:14px">${icon("info")}<div><b>Pourquoi la carte graphique d'abord ?</b><p class="small">Elle change le plus les performances en jeu et se monte seule sur ta carte mère actuelle : ton PC reste utilisable entre chaque achat, et la revente de l'ancienne carte finance la suite.</p></div></div>`,
      mount(el, ctx) {
        const S = () => ctx.store.state, src = { source: location.hash };
        const draw = () => { $("[data-sum]", el).innerHTML = summary(ctx.store).s; $("[data-plan]", el).innerHTML = planList(ctx.store).s; $("[data-tl]", el).innerHTML = timeline(ctx.store).s; };
        draw();
        const commit = fn => { ctx.store.commit("budget", s => fn(s.budget), src); draw(); };
        const idOf = n => n.closest(".plan-row").dataset.id;
        const reorder = ids => commit(b => { b.plan.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id)); });
        let dragId = null;
        const offs = [
          on(el, "input", "[data-b]", (e, i) => { const v = num(i.value); if (v == null) { i.setAttribute("aria-invalid", "true"); return; } i.removeAttribute("aria-invalid"); commit(b => (b[i.dataset.b] = v)); }),
          on(el, "change", "[data-resale]", (e, i) => commit(b => (b.countResale = i.checked))),
          on(el, "click", "[data-done]", (e, b) => { const id = idOf(b); commit(bd => { const it = bd.plan.find(x => x.id === id); it.done = !it.done; }); }),
          on(el, "click", "[data-mv]", (e, b) => { const ids = S().budget.plan.map(x => x.id), i = ids.indexOf(idOf(b)), j = i + Number(b.dataset.mv); if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder(ids); $(`.plan-row[data-id="${CSS.escape(ids[j])}"] [data-mv="${b.dataset.mv}"]`, el)?.focus(); }),
          on(el, "click", "[data-act=add]", async () => { const v = await itemDialog(ctx.store); if (v) commit(b => b.plan.push({ id: uid("pl"), done: false, ...v })); }),
          on(el, "click", "[data-edit]", async (e, b) => { const id = idOf(b), v = await itemDialog(ctx.store, S().budget.plan.find(x => x.id === id)); if (v) commit(bd => Object.assign(bd.plan.find(x => x.id === id), v)); }),
          on(el, "click", "[data-del]", async (e, b) => { const id = idOf(b), it = S().budget.plan.find(x => x.id === id); if (await confirmDialog({ title: `Retirer « ${it.label} » du plan ?`, body: "Les produits et leurs prix restent suivis.", confirm: "Retirer", danger: true })) { commit(bd => { bd.plan = bd.plan.filter(x => x.id !== id); }); toast("Achat retiré du plan", { tone: "ok" }); } }),
          on(el, "dragstart", ".plan-row", (e, n) => { if (e.target.closest("button,input")) return e.preventDefault(); dragId = n.dataset.id; n.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); }),
          on(el, "dragover", ".plan-row", (e, n) => { if (!dragId || n.dataset.id === dragId) return; e.preventDefault(); const r = n.getBoundingClientRect(); $$(".plan-row", el).forEach(x => x.classList.remove("drop-before", "drop-after")); n.classList.add(e.clientY > r.top + r.height / 2 ? "drop-after" : "drop-before"); }),
          on(el, "drop", ".plan-row", (e, n) => { e.preventDefault(); if (!dragId) return; const ids = S().budget.plan.map(x => x.id).filter(x => x !== dragId); let i = ids.indexOf(n.dataset.id); if (n.classList.contains("drop-after")) i++; ids.splice(i, 0, dragId); dragId = null; reorder(ids); }),
          on(el, "dragend", ".plan-row", () => { dragId = null; $$(".plan-row", el).forEach(x => x.classList.remove("dragging", "drop-before", "drop-after")); }),
        ];
        return { cleanup: () => offs.forEach(o => o()), update(c) { if (c.source === location.hash) return true; if (["observations", "products", "external", "import"].includes(c.type)) { draw(); return true; } return false; } };
      },
    };
  },
};
