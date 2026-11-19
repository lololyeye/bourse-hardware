import { html, on, $ } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { fmtDate, DAY } from "../core/format.js";
import { RETAILERS, retailerName } from "../core/catalog.js";
import { observationsCSV, fullBackup, download, stamp } from "../core/share.js";
import { money, statusTag, methodLabel, observationDialog, deleteObservation, productHref, emptyState } from "./common.js";
import { pickFile } from "./import.js";

function filtered(state, f) {
  const from = f.from ? new Date(f.from + "T00:00").getTime() : -Infinity, to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  return state.observations.filter(o => (!f.p || o.productId === f.p) && (!f.r || (f.r === "none" ? !o.retailer : o.retailer === f.r)) && (!f.s || o.status === f.s) && o.ts >= from && o.ts <= to).sort((a, b) => b.ts - a.ts);
}

function quality(state) {
  const obs = state.observations, now = Date.now();
  const est = obs.filter(o => o.status === "estimate").length, unver = obs.filter(o => o.status === "unverified").length;
  const noSrc = obs.filter(o => o.status !== "estimate" && !o.sourceUrl).length;
  const otherCur = obs.filter(o => o.currency !== state.settings.currency).length;
  const last = obs.filter(o => o.method !== "seed").reduce((m, o) => Math.max(m, o.ts), 0);
  const items = [
    [est ? "warn" : "ok", `${est} estimation(s) de départ`, est ? "Elles ne comptent pas dans les signaux. Remplace-les par de vrais relevés." : "Aucune estimation : tout vient de relevés."],
    [unver ? "warn" : "ok", `${unver} relevé(s) non vérifié(s)`, "Vu ailleurs que sur la boutique (forum, comparateur)."],
    [noSrc ? "unknown" : "ok", `${noSrc} relevé(s) sans lien source`, "Un lien permet de revérifier plus tard."],
    [otherCur ? "warn" : "ok", `${otherCur} relevé(s) dans une autre devise`, otherCur ? `Ils sont ignorés dans les graphiques (devise : ${state.settings.currency}).` : "Toutes les devises sont cohérentes."],
    [last && now - last < state.settings.reminderDays * DAY ? "ok" : "warn", last ? `Dernier relevé ${fmtDate(last)}` : "Aucun relevé saisi", `Rappel tous les ${state.settings.reminderDays} jours.`],
  ];
  return html`${items.map(([lvl, t, s]) => html`<div class="check ${lvl}">${icon({ ok: "check", warn: "warning", unknown: "info" }[lvl], { size: 15 })}<span><b>${t}</b><br><span class="tiny faint">${s}</span></span></div>`)}`;
}

export default {
  title: "Historique",
  render({ state, query }) {
    const f = { p: query.p || "", r: query.r || "", s: query.s || "", from: query.from || "", to: query.to || "" };
    const prods = [...state.products].sort((a, b) => a.name.localeCompare(b.name));
    return {
      title: "Historique",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${state.observations.length} relevés</div><h1>Historique des prix</h1><p>Tous les relevés, modifiables. Exporte-les pour les garder ou les partager avec ton pote.</p></div>
        <div class="actions"><button class="btn" data-act="import">${icon("upload", { size: 16 })}Importer</button>
          <button class="btn" data-act="csv">${icon("download", { size: 16 })}CSV</button><button class="btn" data-act="json">${icon("download", { size: 16 })}JSON</button>
          <button class="btn btn-primary" data-act="add">${icon("plus", { size: 16 })}Relevé</button></div></div>
      <div class="grid cols-3">
        <div class="span-2">
          <div class="toolbar" role="search" aria-label="Filtres">
            <label class="field" style="flex:1 1 200px"><span>Produit</span><select class="select" data-f="p"><option value="">Tous</option>${prods.map(p => html`<option value="${p.id}" ${p.id === f.p ? "selected" : ""}>${p.name}</option>`)}</select></label>
            <label class="field" style="flex:0 1 160px"><span>Boutique</span><select class="select" data-f="r"><option value="">Toutes</option><option value="none" ${f.r === "none" ? "selected" : ""}>Non précisée</option>${RETAILERS.map(r => html`<option value="${r.id}" ${r.id === f.r ? "selected" : ""}>${r.name}</option>`)}</select></label>
            <label class="field" style="flex:0 1 150px"><span>Statut</span><select class="select" data-f="s"><option value="">Tous</option>${[["verified", "Vérifié"], ["unverified", "Non vérifié"], ["estimate", "Estimation"]].map(([k, l]) => html`<option value="${k}" ${k === f.s ? "selected" : ""}>${l}</option>`)}</select></label>
            <label class="field" style="flex:0 1 150px"><span>Du</span><input class="input" type="date" data-f="from" value="${f.from}"></label>
            <label class="field" style="flex:0 1 150px"><span>Au</span><input class="input" type="date" data-f="to" value="${f.to}"></label>
          </div>
          <div class="table-wrap"><table class="dt stack"><thead><tr><th>Date</th><th>Produit</th><th class="r">Prix</th><th>Boutique</th><th>Statut</th><th>Méthode</th><th></th></tr></thead><tbody data-body></tbody></table></div>
          <p class="tiny faint" style="margin-top:8px" data-count></p>
        </div>
        <section class="panel"><div class="panel-head"><h2>${icon("shield", { size: 16 })}Qualité des données</h2></div><div class="panel-body" data-q></div></section>
      </div>`,
      mount(el, ctx) {
        const S = () => ctx.store.state, body = $("[data-body]", el);
        const name = id => S().products.find(p => p.id === id)?.name || id;
        const draw = () => {
          const list = filtered(S(), f), shown = list.slice(0, 500);
          body.innerHTML = shown.length ? shown.map(o => html`<tr data-id="${o.id}">
            <td class="num small">${fmtDate(o.ts, S().settings.dateFormat, { time: true })}</td>
            <td><a href="${productHref(o.productId)}" class="pname" style="text-decoration:none">${name(o.productId)}</a>${o.note ? html`<div class="psub">${o.note}</div>` : ""}</td>
            <td class="r num"><b>${money(o.price, o.currency)}</b></td>
            <td class="small">${o.sourceUrl ? html`<a href="${o.sourceUrl}" target="_blank" rel="noopener noreferrer nofollow">${retailerName(o.retailer)} ${icon("external", { size: 12 })}</a>` : retailerName(o.retailer)}</td>
            <td>${statusTag(o.status)}</td><td class="small muted" data-m="hide">${methodLabel(o.method)}</td>
            <td class="r"><div class="actions" style="flex-wrap:nowrap;justify-content:flex-end"><button class="btn btn-ghost btn-sm btn-icon" data-edit aria-label="Modifier">${icon("edit", { size: 14 })}</button><button class="btn btn-ghost btn-sm btn-icon" data-del aria-label="Supprimer">${icon("trash", { size: 14 })}</button></div></td></tr>`.s).join("")
            : `<tr><td colspan="7">${emptyState("Aucun relevé ne correspond aux filtres.", "history").s}</td></tr>`;
          $("[data-count]", el).textContent = `${list.length} relevé(s)${list.length > 500 ? " — 500 premiers affichés, l'export contient tout" : ""}.`;
          $("[data-q]", el).innerHTML = quality(S()).s;
        };
        const sync = () => { const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v)); history.replaceState(null, "", `#/history${p.toString() ? "?" + p : ""}`); };
        draw();
        const O = b => S().observations.find(o => o.id === b.closest("tr").dataset.id);
        const offs = [
          on(el, "change", "[data-f]", (e, i) => { f[i.dataset.f] = i.value; sync(); draw(); }),
          on(el, "click", "[data-edit]", (e, b) => observationDialog(ctx.store, { obs: O(b) })),
          on(el, "click", "[data-del]", (e, b) => deleteObservation(ctx.store, O(b))),
          on(el, "click", "[data-act=add]", () => observationDialog(ctx.store, { productId: f.p || null })),
          on(el, "click", "[data-act=import]", () => pickFile(ctx.store)),
          on(el, "click", "[data-act=csv]", () => download(`bourse-hardware-releves-${stamp()}.csv`, "﻿" + observationsCSV(S(), filtered(S(), f)), "text/csv;charset=utf-8")),
          on(el, "click", "[data-act=json]", () => download(`bourse-hardware-sauvegarde-${stamp()}.json`, JSON.stringify(fullBackup(S()), null, 1))),
        ];
        return { cleanup: () => offs.forEach(o => o()), update(c) { if (["observations", "products", "import", "external"].includes(c.type)) { draw(); return c.type !== "products"; } return false; } };
      },
    };
  },
};
