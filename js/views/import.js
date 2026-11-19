// Import: shared link (#/import?d=…), JSON file or CSV file. Always shows a validation report before writing.
import { html, on, toast, formDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { decodeSnapshot, normalizeIncoming, planImport } from "../core/share.js";
import { uid } from "../core/format.js";
import { emptyState } from "./common.js";

const PRIOS = ["high", "medium", "low"];

/** Show the report, let the user choose what to apply, then commit once. */
export async function reviewImport(store, incoming, { origin = "fichier" } = {}) {
  let plan;
  try { plan = planImport(normalizeIncoming(incoming, store.state), store.state); }
  catch (e) { toast(e.message || "Import impossible", { tone: "bad" }); return false; }
  const { obs } = plan, nOk = obs.valid.length, nW = obs.warned.length, nBad = obs.invalid.length;
  const nothing = !plan.newProducts.length && !nOk && !nW && !plan.watchlist.length && !plan.configs.length && !plan.alerts.length && !plan.budget;
  const v = await formDialog({
    title: `Importer depuis un ${origin}`, wide: true, submit: nothing ? "Fermer" : "Importer la sélection",
    body: html`<p class="small muted">Rien n'est écrasé : les éléments sont ajoutés à tes données. Les relevés déjà présents (même identifiant) sont ignorés.</p>
      <dl class="kv" style="margin:12px 0">
        <dt>Produits nouveaux</dt><dd>${plan.newProducts.length}</dd>
        <dt>Relevés valides</dt><dd class="pos">${nOk}</dd>
        <dt>Relevés avec avertissement</dt><dd style="color:var(--warn)">${nW}</dd>
        <dt>Relevés refusés</dt><dd class="neg">${nBad}</dd>
        ${plan.skippedSame ? html`<dt>Déjà présents</dt><dd>${plan.skippedSame}</dd>` : ""}
      </dl>
      ${nBad ? html`<details class="explain"><summary>${icon("chevronRight", { size: 14 })} Voir les refus</summary><ul class="small" style="margin:6px 0 0 18px">${obs.invalid.slice(0, 30).map(x => html`<li>${x.raw?.productId || "?"} · ${x.raw?.price ?? "?"} : ${x.errors.join(", ")}</li>`)}</ul></details>` : ""}
      ${nW ? html`<details class="explain"><summary>${icon("chevronRight", { size: 14 })} Voir les avertissements</summary><ul class="small" style="margin:6px 0 0 18px">${obs.warned.slice(0, 30).map(x => html`<li>${x.o.productId} · ${x.o.price} : ${x.warnings.join(", ")}</li>`)}</ul></details>
        <label class="switch"><input type="checkbox" name="warned"><span class="track"></span>Importer aussi les ${nW} relevés avec avertissement</label>` : ""}
      ${plan.watchlist.length ? html`<label class="switch"><input type="checkbox" name="watchlist" checked><span class="track"></span>Watchlist : ${plan.watchlist.length} produit(s), prix cibles</label>` : ""}
      ${plan.configs.length ? html`<label class="switch"><input type="checkbox" name="configs" checked><span class="track"></span>Configurations : ${plan.configs.length} (ajoutées en copie)</label>` : ""}
      ${plan.alerts.length ? html`<label class="switch"><input type="checkbox" name="alerts" checked><span class="track"></span>Alertes : ${plan.alerts.length}</label>` : ""}
      ${plan.budget ? html`<label class="switch"><input type="checkbox" name="budget"><span class="track"></span>Remplacer mon budget par celui du fichier</label>` : ""}
      ${plan.settings ? html`<label class="switch"><input type="checkbox" name="settings"><span class="track"></span>Reprendre aussi les réglages (thème, devise…)</label>` : ""}
      ${nothing ? html`<div class="callout info">${icon("info")}<span>Rien de nouveau à importer.</span></div>` : ""}`,
  });
  if (!v || nothing) return false;
  const added = applyImport(store, plan, v);
  toast(`Import terminé : ${added.obs} relevé(s), ${added.products} produit(s)`, { tone: "ok" });
  return true;
}

export function applyImport(store, plan, choice) {
  const out = { obs: 0, products: plan.newProducts.length };
  store.commit("import", s => {
    s.products.push(...plan.newProducts.map(p => ({ ...p, createdAt: Date.now() })));
    const recs = [...plan.obs.valid, ...(choice.warned ? plan.obs.warned.map(x => x.o) : [])].map(o => ({ ...o, id: o.id || uid("o") }));
    s.observations.push(...recs); out.obs = recs.length;
    if (choice.watchlist) for (const w of plan.watchlist) {
      const cur = s.watchlist.find(x => x.productId === w.productId);
      const target = Number(w.target) > 0 ? Number(w.target) : null;
      if (cur) { if (target) cur.target = target; }
      else s.watchlist.push({ productId: w.productId, target, priority: PRIOS.includes(w.priority) ? w.priority : "medium", note: "", favorite: !!w.favorite, deadline: null, order: s.watchlist.length });
    }
    if (choice.configs) for (const c of plan.configs) s.configs.push({ ...structuredClone(c), id: uid("cfg"), name: String(c.name || "Config importée").slice(0, 52) + " (import)" });
    if (choice.alerts) for (const a of plan.alerts) if (!s.alerts.some(x => x.productId === a.productId && x.type === a.type && x.threshold === a.threshold))
      s.alerts.push({ id: uid("a"), productId: a.productId, type: a.type, threshold: a.threshold ?? null, notify: a.notify !== false, enabled: a.enabled !== false, createdAt: Date.now(), lastTriggeredAt: null, armed: true, lastKey: null });
    if (choice.budget && plan.budget) s.budget = structuredClone(plan.budget);
    if (choice.settings && plan.settings) Object.assign(s.settings, plan.settings);
  });
  // normalise everything that came from outside (budget/configs/settings shapes)
  store.replaceState(store.state);
  return out;
}

/** Pick a .json or .csv file and review it. */
export function pickFile(store) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,.csv,application/json,text/csv";
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f) return;
    if (f.size > 5e6) return toast("Fichier trop volumineux (5 Mo max)", { tone: "bad" });
    const text = await f.text();
    let data = text;
    if (/\.json$/i.test(f.name) || text.trim().startsWith("{")) { try { data = JSON.parse(text); } catch { return toast("JSON invalide", { tone: "bad" }); } }
    reviewImport(store, data, { origin: "fichier" });
  };
  inp.click();
}

export default {
  title: "Importer",
  render({ query }) {
    return {
      title: "Importer un partage",
      html: html`<div class="page-head"><div><div class="eyebrow">Lien partagé</div><h1>Importer un partage</h1><p>Quelqu'un t'a envoyé un instantané de sa watchlist, de ses configs ou de son historique.</p></div></div>
        <div class="panel" data-box>${query.d ? html`<div class="panel-body"><div class="skeleton" style="height:80px"></div></div>` : emptyState("Ce lien ne contient pas de données.", "link")}</div>`,
      mount(el, ctx) {
        const box = el.querySelector("[data-box]");
        let alive = true;
        if (ctx.query.d) decodeSnapshot(ctx.query.d).then(async data => {
          if (!alive) return;
          box.innerHTML = html`<div class="panel-body"><p>Instantané du ${new Date(data.createdAt || Date.now()).toLocaleDateString("fr-FR")} : ${(data.parts || []).join(", ") || "données"}.</p><p class="actions" style="margin-top:10px"><button class="btn btn-primary" data-go>${icon("download", { size: 16 })}Voir et importer</button><a class="btn" href="#/overview">Ignorer</a></p></div>`.s;
          const offs = on(box, "click", "[data-go]", async () => { if (await reviewImport(ctx.store, data, { origin: "lien partagé" })) location.hash = "#/watchlist"; });
          cleanup = offs;
          reviewImport(ctx.store, data, { origin: "lien partagé" }).then(ok => ok && alive && (location.hash = "#/watchlist"));
        }).catch(e => { if (alive) box.innerHTML = emptyState(`Lien illisible : ${e.message}`, "warning").s; });
        let cleanup = () => {};
        return { cleanup: () => { alive = false; cleanup(); }, update: () => true };
      },
    };
  },
};
