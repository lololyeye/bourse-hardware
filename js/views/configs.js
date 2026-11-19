import { html, on, $, toast, formDialog, confirmDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { SLOTS, configTotals, compatibility } from "../core/plan.js";
import { uid } from "../core/format.js";
import { money, delta, productHref, emptyState } from "./common.js";
import { shareDialog } from "./settings.js";

const CHECK_IC = { ok: "check", warn: "warning", error: "x", unknown: "info" };
const slotCats = s => (Array.isArray(s.cat) ? s.cat : [s.cat]);

function card(cfg, store) {
  const st = store.state, d = store.derived, cur = st.settings.currency;
  const t = configTotals(cfg, pid => d.byId.get(pid));
  const checks = compatibility(cfg, pid => st.products.find(p => p.id === pid));
  const pct = cfg.budget ? Math.min(100, (t.current / cfg.budget) * 100) : 0;
  return html`<section class="panel" data-cfg="${cfg.id}">
    <div class="panel-head"><h2 style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon("layers", { size: 16 })}${cfg.name}</h2>
      <div class="actions" style="flex-wrap:nowrap">
        <button class="btn btn-ghost btn-sm btn-icon" data-c="rename" aria-label="Renommer et budget">${icon("edit", { size: 14 })}</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-c="dup" aria-label="Dupliquer">${icon("layers", { size: 14 })}</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-c="del" aria-label="Supprimer">${icon("trash", { size: 14 })}</button></div></div>
    <div class="panel-body">
      ${SLOTS.map(s => { const pid = cfg.parts[s.id], x = pid ? d.byId.get(pid) : null, opts = st.products.filter(p => slotCats(s).includes(p.category));
        return html`<div class="cfg-slot"><span class="lbl">${s.label}</span>
          <select class="select" data-slot="${s.id}" aria-label="${s.label}"><option value="">— Aucun —</option>${opts.map(p => html`<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${p.name}</option>`)}</select>
          <span style="display:flex;gap:8px;align-items:center;justify-content:flex-end;min-width:96px">${cfg.owned[s.id] ? html`<span class="tag">DÉJÀ À MOI</span>` : x?.st.cur != null ? html`<a class="num small" href="${productHref(pid)}">${money(x.st.cur, cur)}</a>` : pid ? html`<span class="tiny faint">pas de prix</span>` : ""}
            <label class="switch" title="Je l'ai déjà"><input type="checkbox" data-owned="${s.id}" ${cfg.owned[s.id] ? "checked" : ""} aria-label="${s.label} : déjà possédé"><span class="track"></span></label></span></div>`; })}
      <dl class="kv" style="margin-top:14px">
        <dt>Prix actuel (à acheter)</dt><dd><b>${money(t.current, cur)}</b></dd>
        <dt>Total aux prix cibles</dt><dd>${money(t.target, cur)}${t.targetMissing ? html` <span class="tiny faint">(${t.targetMissing} sans cible)</span>` : ""}</dd>
        <dt>Variation depuis le 1er relevé</dt><dd>${delta(t.variation)}</dd>
        <dt>Budget</dt><dd>${cfg.budget ? money(cfg.budget, cur) : "—"}</dd>
        ${cfg.budget ? html`<dt>${t.remaining >= 0 ? "Reste" : "Dépassement"}</dt><dd class="${t.remaining >= 0 ? "pos" : "neg"}">${money(Math.abs(t.remaining), cur)}</dd>` : ""}
      </dl>
      ${cfg.budget ? html`<div class="progress" style="margin-top:10px" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Part du budget"><i style="width:${pct}%;${t.remaining < 0 ? "background:var(--neg)" : ""}"></i></div>` : ""}
      ${t.missing.length ? html`<p class="tiny faint" style="margin-top:8px">Sans prix : ${t.missing.join(", ")}. Le total est incomplet.</p>` : ""}
      <h3 style="margin:16px 0 6px;font-size:13px">Compatibilité</h3>
      ${checks.length ? checks.map(c => html`<div class="check ${c.level}">${icon(CHECK_IC[c.level], { size: 15 })}<span>${c.text}</span></div>`) : html`<p class="tiny faint">Choisis des pièces pour lancer les vérifications.</p>`}
      <p class="tiny faint" style="margin-top:6px">Vérifié uniquement à partir des caractéristiques renseignées sur chaque produit. Gris = information manquante, pas une garantie.</p>
    </div></section>`;
}

function compareTable(store) {
  const st = store.state, d = store.derived, cur = st.settings.currency;
  if (st.configs.length < 2) return "";
  const tot = st.configs.map(c => configTotals(c, pid => d.byId.get(pid)));
  const name = pid => st.products.find(p => p.id === pid)?.name || "—";
  return html`<section class="panel" style="margin-top:14px"><div class="panel-head"><h2>${icon("sort", { size: 16 })}Comparaison</h2></div>
    <div class="table-wrap"><table class="dt"><thead><tr><th></th>${st.configs.map(c => html`<th>${c.name}</th>`)}</tr></thead><tbody>
      ${SLOTS.map(s => html`<tr><td class="muted small">${s.label}</td>${st.configs.map(c => html`<td class="small">${c.parts[s.id] ? name(c.parts[s.id]) : html`<span class="faint">—</span>`}${c.owned[s.id] ? html` <span class="tag">À MOI</span>` : ""}</td>`)}</tr>`)}
      <tr><td><b>Prix actuel</b></td>${tot.map(t => html`<td class="num"><b>${money(t.current, cur)}</b></td>`)}</tr>
      <tr><td>Aux prix cibles</td>${tot.map(t => html`<td class="num">${money(t.target, cur)}</td>`)}</tr>
      <tr><td>Budget restant</td>${tot.map(t => html`<td class="num ${t.remaining == null ? "" : t.remaining >= 0 ? "pos" : "neg"}">${t.remaining == null ? "—" : money(t.remaining, cur)}</td>`)}</tr>
    </tbody></table></div></section>`;
}

async function cfgDialog(cfg = null) {
  const v = await formDialog({
    title: cfg ? "Modifier la configuration" : "Nouvelle configuration",
    body: html`<label class="field"><span>Nom</span><input class="input" name="name" required maxlength="60" value="${cfg?.name || ""}" placeholder="ex. Option AM5 1440p"></label>
      <label class="field"><span>Budget total <small>(optionnel)</small></span><input class="input num" name="budget" inputmode="decimal" value="${cfg?.budget || ""}"></label>`,
    submit: cfg ? "Enregistrer" : "Créer",
    validate: x => (x.name.trim().length < 2 ? "Donne un nom." : x.budget && !(Number(x.budget.replace(",", ".")) >= 0) ? "Budget invalide." : null),
  });
  return v && { name: v.name.trim(), budget: v.budget ? Number(v.budget.replace(",", ".")) : 0 };
}
const blank = () => Object.fromEntries(SLOTS.map(s => [s.id, null]));

export default {
  title: "Configurations",
  render({ state }) {
    return {
      title: "Configurations",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${state.configs.length} configuration${state.configs.length > 1 ? "s" : ""}</div><h1>Configurations</h1><p>Assemble des configs avec les produits suivis, compare-les et vérifie la compatibilité quand les caractéristiques sont connues.</p></div>
        <div class="actions"><button class="btn" data-act="share" ${state.configs.length ? "" : "disabled"}>${icon("share", { size: 16 })}Partager</button><button class="btn btn-primary" data-act="new">${icon("plus", { size: 16 })}Nouvelle config</button></div></div>
      <div data-cards></div><div data-compare></div>`,
      mount(el, ctx) {
        const S = () => ctx.store.state;
        const draw = () => {
          $("[data-cards]", el).innerHTML = S().configs.length ? html`<div class="cfg-grid">${S().configs.map(c => card(c, ctx.store))}</div>`.s : html`<div class="panel">${emptyState("Aucune configuration.", "layers")}</div>`.s;
          $("[data-compare]", el).innerHTML = compareTable(ctx.store).s || "";
        };
        draw();
        const C = b => b.closest("[data-cfg]").dataset.cfg;
        const src = { source: location.hash };
        const mut = (id, fn) => { ctx.store.commit("configs", s => fn(s.configs.find(c => c.id === id)), src); draw(); };
        const offs = [
          on(el, "change", "[data-slot]", (e, sel) => mut(C(sel), c => (c.parts[sel.dataset.slot] = sel.value || null))),
          on(el, "change", "[data-owned]", (e, i) => mut(C(i), c => (c.owned[i.dataset.owned] = i.checked))),
          on(el, "click", "[data-act=new]", async () => { const v = await cfgDialog(); if (v) ctx.store.commit("configs", s => s.configs.push({ id: uid("cfg"), ...v, createdAt: Date.now(), parts: blank(), owned: Object.fromEntries(SLOTS.map(x => [x.id, false])) })); }),
          on(el, "click", "[data-act=share]", () => shareDialog(ctx.store, { configs: true })),
          on(el, "click", "[data-c=rename]", async (e, b) => { const id = C(b), v = await cfgDialog(S().configs.find(c => c.id === id)); if (v) ctx.store.commit("configs", s => Object.assign(s.configs.find(c => c.id === id), v)); }),
          on(el, "click", "[data-c=dup]", (e, b) => { const src0 = S().configs.find(c => c.id === C(b)); ctx.store.commit("configs", s => s.configs.push({ ...structuredClone(src0), id: uid("cfg"), name: `${src0.name} (copie)`.slice(0, 60), createdAt: Date.now() })); toast("Configuration dupliquée", { tone: "ok" }); }),
          on(el, "click", "[data-c=del]", async (e, b) => { const c = S().configs.find(c => c.id === C(b)); if (await confirmDialog({ title: `Supprimer « ${c.name} » ?`, body: "Les produits et leurs prix ne sont pas touchés.", confirm: "Supprimer", danger: true })) ctx.store.commit("configs", s => { s.configs = s.configs.filter(x => x.id !== c.id); }); }),
        ];
        return { cleanup: () => offs.forEach(o => o()), update(c) { if (c.type === "configs" && c.source === location.hash) return true; if (["observations", "watchlist", "configs", "products", "external", "import"].includes(c.type)) { draw(); return true; } return false; } };
      },
    };
  },
};
