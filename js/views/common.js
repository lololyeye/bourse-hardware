// Shared view fragments and dialogs.
import { html, raw, formDialog, confirmDialog, toast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { sparkline } from "../ui/chart.js";
import { fmtPrice, fmtPct, fmtAgo, fmtDate, uid } from "../core/format.js";
import { CATEGORIES, RETAILERS, catById, retailerName } from "../core/catalog.js";
import { FRESH_LABEL } from "../core/analytics.js";
import { cleanObservation, checkObservation, CURRENCIES, safeUrl } from "../core/validate.js";
import { ALERT_TYPES, describeAlert } from "../core/alerts.js";

export const money = (n, cur = "EUR", decimals) => fmtPrice(n, cur, { decimals: decimals ?? (n != null && n % 1 ? 2 : 0) });
export const signalBadge = s => html`<span class="signal ${s.tone}" title="${s.def}">${s.label}</span>`;
export function delta(v, { suffix = "" } = {}) {
  if (v == null || !Number.isFinite(v)) return html`<span class="delta flat">—</span>`;
  const c = v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
  return html`<span class="delta ${c}">${c === "up" ? "▲" : c === "down" ? "▼" : "■"} ${fmtPct(v)}${suffix}</span>`;
}
export const freshBadge = (x, now = Date.now()) => html`<span class="fresh fresh-${x.fresh}" title="${FRESH_LABEL[x.fresh]}">${x.st.n ? fmtAgo(x.st.last.ts, now) : "aucun prix"}</span>`;
export const confBars = c => html`<span class="conf l${{ none: 0, low: 1, medium: 2, high: 3 }[c.level]}" title="Fiabilité : ${c.label}"><i></i><i></i><i></i></span>`;
export const sparkOf = (x, opts) => sparkline(x.obs.map(o => o.price), opts);
export const productHref = id => `#/product/${encodeURIComponent(id)}`;
export const catIcon = cat => icon(catById(cat).icon, { size: 16 });
export const statusTag = s => html`<span class="tag ${s === "estimate" ? "est" : s === "verified" ? "ok" : ""}">${{ estimate: "ESTIM.", verified: "VÉRIFIÉ", unverified: "NON VÉRIF." }[s] || s}</span>`;
export const methodLabel = m => ({ seed: "Prix de départ", manual: "Saisie manuelle", import: "Import", api: "Flux automatique", feed: "Relevé publié" }[m] || m);

export function emptyState(text, ic = "info", action = null) {
  return html`<div class="empty">${icon(ic, { size: 22 })}<p>${text}</p>${action ? html`<p style="margin-top:10px">${action}</p>` : ""}</div>`;
}

/* ---------------- Observation dialog (add / edit) ---------------- */
function toLocalInput(ts) { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }

export async function observationDialog(store, { productId = null, obs = null } = {}) {
  const st = store.state, cur = st.settings.currency;
  const o = obs || { productId, price: "", currency: cur, retailer: "", sourceUrl: "", ts: Date.now(), status: "verified", note: "" };
  const prods = [...st.products].sort((a, b) => a.name.localeCompare(b.name));
  const data = await formDialog({
    title: obs ? "Modifier le relevé" : "Nouveau relevé de prix",
    body: html`
      <label class="field"><span>Produit</span><select class="select" name="productId" required>${prods.map(p => html`<option value="${p.id}" ${p.id === o.productId ? "selected" : ""}>${p.name}</option>`)}</select></label>
      <div class="grid-form">
        <label class="field"><span>Prix</span><span class="input-affix"><input class="input num" name="price" inputmode="decimal" required value="${o.price}" placeholder="0"><em>${cur}</em></span></label>
        <label class="field"><span>Devise</span><select class="select" name="currency">${CURRENCIES.map(c => html`<option ${c === o.currency ? "selected" : ""}>${c}</option>`)}</select></label>
        <label class="field"><span>Date et heure</span><input class="input" type="datetime-local" name="ts" required value="${toLocalInput(o.ts)}"></label>
      </div>
      <div class="grid-form">
        <label class="field"><span>Boutique</span><select class="select" name="retailer"><option value="">Non précisée</option>${RETAILERS.map(r => html`<option value="${r.id}" ${r.id === o.retailer ? "selected" : ""}>${r.name}</option>`)}<option value="other" ${o.retailer && !RETAILERS.some(r => r.id === o.retailer) ? "selected" : ""}>Autre</option></select></label>
        <label class="field"><span>Statut</span><select class="select" name="status">
          <option value="verified" ${o.status === "verified" ? "selected" : ""}>Vérifié (vu en boutique)</option>
          <option value="unverified" ${o.status === "unverified" ? "selected" : ""}>Non vérifié (vu ailleurs)</option>
          <option value="estimate" ${o.status === "estimate" ? "selected" : ""}>Estimation</option></select></label>
      </div>
      <label class="field"><span>Lien de l'offre <small>(optionnel, http ou https)</small></span><input class="input" name="sourceUrl" type="url" value="${o.sourceUrl}" placeholder="https://…"></label>
      <label class="field"><span>Note <small>(optionnel)</small></span><input class="input" name="note" maxlength="200" value="${o.note || ""}"></label>
      <div class="callout info" data-warn hidden>${icon("info")}<span></span></div>`,
    submit: obs ? "Enregistrer" : "Ajouter le relevé",
    validate: (v, form) => {
      const c = cleanObservation({ ...v, id: o.id, ts: new Date(v.ts).getTime(), method: obs?.method || "manual" }, { currency: cur });
      if (v.sourceUrl && !safeUrl(v.sourceUrl)) return "Le lien doit commencer par http:// ou https://";
      const { errors, warnings } = checkObservation(c, { productIds: new Set(st.products.map(p => p.id)), existing: st.observations, currency: cur });
      if (errors.length) return errors.join(" · ");
      const box = form.querySelector("[data-warn]");
      if (warnings.length && box.dataset.ack !== JSON.stringify(warnings)) {
        box.hidden = false; box.querySelector("span").textContent = warnings.join(" · ") + " — clique à nouveau pour confirmer.";
        box.dataset.ack = JSON.stringify(warnings); return "Vérifie l'avertissement ci-dessous.";
      }
      return null;
    },
  });
  if (!data) return null;
  const rec = cleanObservation({ ...data, id: obs?.id, ts: new Date(data.ts).getTime(), method: obs?.method || "manual" }, { currency: cur });
  if (rec.retailer === "other") rec.retailer = "";
  store.commit("observations", s => {
    if (obs) Object.assign(s.observations.find(x => x.id === obs.id), rec);
    else s.observations.push(rec);
  });
  toast(obs ? "Relevé modifié" : `Relevé ajouté : ${fmtPrice(rec.price, rec.currency, { decimals: rec.price % 1 ? 2 : 0 })}`, { tone: "ok" });
  return rec;
}

export async function deleteObservation(store, obs) {
  const p = store.state.products.find(x => x.id === obs.productId);
  const ok = await confirmDialog({ title: "Supprimer ce relevé ?", body: `${p?.name || obs.productId} · ${fmtPrice(obs.price, obs.currency)} · ${fmtDate(obs.ts, "fr", { time: true })}. Cette action est définitive.`, confirm: "Supprimer", danger: true });
  if (!ok) return false;
  store.commit("observations", s => { s.observations = s.observations.filter(x => x.id !== obs.id); });
  toast("Relevé supprimé", { tone: "ok" });
  return true;
}

/* ---------------- Batch entry (the weekly routine from v1) ---------------- */
export async function batchDialog(store) {
  const d = store.derived, cur = store.state.settings.currency;
  const rows = d.rows.filter(r => r.watch).sort((a, b) => (a.watch.order ?? 0) - (b.watch.order ?? 0));
  const data = await formDialog({
    title: "Relevé groupé", wide: true,
    body: html`<p class="small muted">Le meilleur prix <b>fiable</b> vu aujourd'hui pour chaque produit suivi. Laisse vide ce que tu n'as pas regardé.</p>
      <label class="field" style="max-width:240px"><span>Boutique (pour tous)</span><select class="select" name="__retailer"><option value="">Non précisée</option>${RETAILERS.map(r => html`<option value="${r.id}">${r.name}</option>`)}</select></label>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Produit</th><th class="r">Dernier</th><th class="r">Cible</th><th class="r">Prix du jour</th></tr></thead><tbody>
      ${rows.map(r => html`<tr><td><div class="pname">${r.product.name}</div><div class="psub">${freshBadge(r)}</div></td><td class="r num">${r.st.cur != null ? money(r.st.cur, cur) : "—"}</td><td class="r num">${r.watch.target ? money(r.watch.target, cur) : "—"}</td>
        <td class="r" style="width:140px"><input class="input num" name="p_${r.product.id}" inputmode="decimal" placeholder="${cur}" aria-label="Prix du jour pour ${r.product.name}"></td></tr>`)}
      </tbody></table></div>`,
    submit: "Enregistrer les prix",
    validate: v => {
      for (const [k, val] of Object.entries(v)) if (k.startsWith("p_") && val.trim()) { const n = Number(val.replace(",", ".").replace(/[^\d.]/g, "")); if (!(n > 0 && n < 50000)) return `Prix invalide : « ${val} »`; }
      return Object.entries(v).some(([k, val]) => k.startsWith("p_") && val.trim()) ? null : "Saisis au moins un prix.";
    },
  });
  if (!data) return;
  const now = Date.now(), recs = [];
  for (const [k, val] of Object.entries(data)) if (k.startsWith("p_") && val.trim()) recs.push(cleanObservation({ productId: k.slice(2), price: val, currency: cur, retailer: data.__retailer, ts: now, method: "manual", status: "verified" }));
  store.commit("observations", s => s.observations.push(...recs));
  toast(`${recs.length} prix enregistré${recs.length > 1 ? "s" : ""}`, { tone: "ok" });
}

/* ---------------- Product dialog ---------------- */
export async function productDialog(store, product = null) {
  const p = product || { id: "", name: "", brand: "", category: "gpu", specs: {}, query: "" };
  const data = await formDialog({
    title: product ? "Modifier le produit" : "Suivre un nouveau produit",
    body: html`<div class="grid-form">
        <label class="field" style="grid-column:1/-1"><span>Nom</span><input class="input" name="name" required maxlength="80" value="${p.name}" placeholder="ex. Radeon RX 9070 XT 16 Go"></label>
        <label class="field"><span>Marque</span><input class="input" name="brand" maxlength="40" value="${p.brand}"></label>
        <label class="field"><span>Catégorie</span><select class="select" name="category">${CATEGORIES.map(c => html`<option value="${c.id}" ${c.id === p.category ? "selected" : ""}>${c.label}</option>`)}</select></label>
      </div>
      <details class="explain"><summary>${icon("chevronRight", { size: 14 })} Caractéristiques pour la compatibilité (optionnel)</summary>
        <p class="small muted" style="margin-bottom:8px">Ne remplis que ce que tu as vérifié chez le fabricant : les vérifications de compatibilité s'appuient dessus.</p>
        <div class="grid-form">
          <label class="field"><span>Socket</span><select class="select" name="socket"><option value="">—</option>${["AM4", "AM5", "LGA1700", "LGA1851"].map(x => html`<option ${p.specs?.socket === x ? "selected" : ""}>${x}</option>`)}</select></label>
          <label class="field"><span>Mémoire</span><select class="select" name="memType"><option value="">—</option>${["DDR4", "DDR5"].map(x => html`<option ${p.specs?.memType === x ? "selected" : ""}>${x}</option>`)}</select></label>
          <label class="field"><span>TDP / conso (W)</span><input class="input num" name="tdp" inputmode="numeric" value="${p.specs?.tdp || ""}"></label>
          <label class="field"><span>Puissance alim (W)</span><input class="input num" name="watts" inputmode="numeric" value="${p.specs?.watts || ""}"></label>
        </div></details>
      ${product ? "" : html`<label class="switch"><input type="checkbox" name="watch" checked><span class="track"></span>Ajouter à la watchlist</label>`}`,
    submit: product ? "Enregistrer" : "Ajouter",
    validate: v => (v.name.trim().length < 2 ? "Donne un nom au produit." : null),
  });
  if (!data) return null;
  const specs = {};
  if (data.socket) specs.socket = data.socket;
  if (data.memType) specs.memType = data.memType;
  if (+data.tdp > 0) specs.tdp = +data.tdp;
  if (+data.watts > 0) specs.watts = +data.watts;
  if (product?.specs?.sockets) specs.sockets = product.specs.sockets;
  if (product?.specs?.formFactor) specs.formFactor = product.specs.formFactor;
  const rec = { id: product?.id || `${data.category}-${data.name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${uid().slice(-4)}`, name: data.name.trim(), brand: data.brand.trim(), category: data.category, specs, query: `${data.brand} ${data.name}`.trim(), createdAt: product?.createdAt || Date.now() };
  store.commit("products", s => {
    if (product) Object.assign(s.products.find(x => x.id === product.id), rec);
    else { s.products.push(rec); if (data.watch) s.watchlist.push({ productId: rec.id, target: null, priority: "medium", note: "", favorite: false, deadline: null, order: s.watchlist.length }); }
  });
  toast(product ? "Produit modifié" : `${rec.name} ajouté`, { tone: "ok" });
  return rec;
}

export async function deleteProduct(store, product) {
  const n = store.state.observations.filter(o => o.productId === product.id).length;
  const ok = await confirmDialog({ title: `Supprimer « ${product.name} » ?`, body: `Le produit, ses ${n} relevé(s), ses alertes et sa place dans la watchlist seront supprimés. Exporte ton historique avant si tu veux le garder.`, confirm: "Supprimer définitivement", danger: true, typeToConfirm: n > 3 ? "SUPPRIMER" : null });
  if (!ok) return false;
  store.commit("products", s => {
    s.products = s.products.filter(p => p.id !== product.id);
    s.observations = s.observations.filter(o => o.productId !== product.id);
    s.alerts = s.alerts.filter(a => a.productId !== product.id);
    s.watchlist = s.watchlist.filter(w => w.productId !== product.id);
    for (const c of s.configs) for (const k in c.parts) if (c.parts[k] === product.id) c.parts[k] = null;
    for (const i of s.budget.plan) i.productIds = i.productIds.filter(x => x !== product.id);
  });
  toast("Produit supprimé", { tone: "ok" });
  return true;
}

/* ---------------- Alert dialog ---------------- */
export async function alertDialog(store, { productId = null, alert = null } = {}) {
  const st = store.state, a = alert || { productId, type: "below", threshold: "", notify: true, enabled: true };
  const watchT = pid => st.watchlist.find(w => w.productId === pid)?.target;
  const data = await formDialog({
    title: alert ? "Modifier l'alerte" : "Nouvelle alerte",
    body: html`<label class="field"><span>Produit</span><select class="select" name="productId" required>${[...st.products].sort((x, y) => x.name.localeCompare(y.name)).map(p => html`<option value="${p.id}" ${p.id === a.productId ? "selected" : ""}>${p.name}</option>`)}</select></label>
      <div class="grid-form"><label class="field"><span>Condition</span><select class="select" name="type">${Object.entries(ALERT_TYPES).map(([k, t]) => html`<option value="${k}" ${k === a.type ? "selected" : ""}>${t.label}</option>`)}</select></label>
      <label class="field" data-thr><span>Seuil</span><span class="input-affix"><input class="input num" name="threshold" inputmode="decimal" value="${a.threshold ?? ""}"><em data-unit></em></span></label></div>
      <label class="switch"><input type="checkbox" name="notify" ${a.notify ? "checked" : ""}><span class="track"></span>Notification du navigateur (si activée dans Réglages)</label>
      <label class="switch"><input type="checkbox" name="enabled" ${a.enabled ? "checked" : ""}><span class="track"></span>Alerte active</label>`,
    submit: alert ? "Enregistrer" : "Créer l'alerte",
    onMount: d => {
      const sel = d.querySelector('[name="type"]'), thr = d.querySelector("[data-thr]"), unit = d.querySelector("[data-unit]"), inp = d.querySelector('[name="threshold"]'), prod = d.querySelector('[name="productId"]');
      const sync = () => {
        const t = ALERT_TYPES[sel.value]; thr.hidden = !t.unit; unit.textContent = t.unit === "€" ? st.settings.currency : t.unit === "j" ? "jours" : "%"; inp.required = !!t.unit;
        if (!inp.value && t.unit) inp.value = t.unit === "€" ? (watchT(prod.value) || "") : t.def ?? "";
      };
      sel.onchange = () => { inp.value = ""; sync(); }; prod.onchange = () => { if (ALERT_TYPES[sel.value].unit === "€") { inp.value = ""; sync(); } };
      sync();
    },
    validate: v => { const t = ALERT_TYPES[v.type]; if (t.unit && !(Number(String(v.threshold).replace(",", ".")) > 0)) return "Le seuil doit être un nombre positif."; if (v.type === "nearTarget" && !watchT(v.productId)) return "Ce produit n'a pas de prix cible : règle-le dans la watchlist."; return null; },
  });
  if (!data) return null;
  const thr = ALERT_TYPES[data.type].unit ? Number(String(data.threshold).replace(",", ".")) : null;
  const lastId = store.derived.byId.get(data.productId)?.obs.at(-1)?.id || null;
  store.commit("alerts", s => {
    if (alert) Object.assign(s.alerts.find(x => x.id === alert.id), { productId: data.productId, type: data.type, threshold: thr, notify: data.notify, enabled: data.enabled, armed: true, lastKey: lastId });
    // event alerts start "caught up" so they don't fire on old observations
    else s.alerts.push({ id: uid("a"), productId: data.productId, type: data.type, threshold: thr, notify: data.notify, enabled: data.enabled, createdAt: Date.now(), lastTriggeredAt: null, armed: true, lastKey: ALERT_TYPES[data.type].kind === "event" ? lastId : null });
  });
  toast(alert ? "Alerte modifiée" : "Alerte créée", { tone: "ok" });
  return true;
}
export { describeAlert, retailerName, raw };
