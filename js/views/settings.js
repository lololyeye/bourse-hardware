import { html, on, $, toast, formDialog, confirmDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { CURRENCIES } from "../core/validate.js";
import { KEY_V2 } from "../core/migrate.js";
import { buildSnapshot, encodeSnapshot, fullBackup, download, stamp } from "../core/share.js";
import { chartLibStatus } from "../ui/chart.js";
import { browserPanel, browserHandlers } from "./alerts.js";
import { pickFile } from "./import.js";

const seg = (key, cur, opts) => html`<div class="seg" role="group">${opts.map(([v, l]) => html`<button data-set="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`)}</div>`;
const row = (label, help, control) => html`<div class="set-row"><div class="lbl"><b>${label}</b>${help ? html`<small>${help}</small>` : ""}</div><div>${control}</div></div>`;
const ACCENTS = [["amber", "#e3ad4f", "Laiton"], ["green", "#3ecf8e", "Vert"], ["blue", "#5b9cf5", "Bleu"], ["violet", "#a78bfa", "Violet"]];

/** Share a read-only snapshot. Budget is off unless explicitly ticked. */
export async function shareDialog(store, preset = {}) {
  const st = store.state;
  const parts = { watchlist: true, configs: false, history: false, alerts: false, budget: false, ...preset };
  const v = await formDialog({
    title: "Partager un instantané",
    body: html`<p class="small muted">Le lien contient une copie figée des éléments cochés, compressée dans l'adresse. Rien n'est envoyé sur un serveur. Ton pote pourra l'importer chez lui.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label class="switch"><input type="checkbox" name="watchlist" ${parts.watchlist ? "checked" : ""}><span class="track"></span>Watchlist et prix cibles (${st.watchlist.length})</label>
        <label class="switch"><input type="checkbox" name="configs" ${parts.configs ? "checked" : ""}><span class="track"></span>Configurations (${st.configs.length})</label>
        <label class="switch"><input type="checkbox" name="history" ${parts.history ? "checked" : ""}><span class="track"></span>Historique des prix (${st.observations.length} relevés, sans les notes)</label>
        <label class="switch"><input type="checkbox" name="alerts" ${parts.alerts ? "checked" : ""}><span class="track"></span>Règles d'alerte (${st.alerts.length})</label>
        <label class="switch"><input type="checkbox" name="budget"><span class="track"></span><span>Budget personnel <span class="tag est">PRIVÉ</span> <small class="faint">salaire, charges, épargne</small></span></label>
      </div>
      <div data-out hidden><label class="field"><span>Lien</span><input class="input" name="__url" readonly></label><p class="tiny faint" data-len></p></div>`,
    submit: "Créer le lien",
    onMount: d => {
      const form = d.querySelector("form"), out = d.querySelector("[data-out]"), url = d.querySelector('[name="__url"]');
      form.addEventListener("submit", async e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const sel = Object.fromEntries(["watchlist", "configs", "history", "alerts", "budget"].map(k => [k, form.elements[k].checked]));
        if (!Object.values(sel).some(Boolean)) return toast("Coche au moins un élément", { tone: "warn" });
        const code = await encodeSnapshot(buildSnapshot(store.state, sel));
        const link = `${location.origin}${location.pathname}#/import?d=${code}`;
        out.hidden = false; url.value = link; url.select();
        d.querySelector("[data-len]").textContent = `${link.length.toLocaleString("fr-FR")} caractères${link.length > 8000 ? " — long : certaines messageries le couperont, préfère l'export JSON." : ""}${sel.budget ? " · contient ton budget." : ""}`;
        try { await navigator.clipboard.writeText(link); toast("Lien copié dans le presse-papiers", { tone: "ok" }); } catch { toast("Lien créé : copie-le à la main", { tone: "info" }); }
        d.querySelector('button[type="submit"]').textContent = "Recréer le lien";
      }, { capture: true });
    },
  });
  return v;
}

export default {
  title: "Réglages",
  render({ state, store }) {
    const s = state.settings, mqR = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const eff = document.documentElement.dataset.motionEffective;
    const keys = store.storageInfo(), total = keys.reduce((a, k) => a + k.bytes, 0);
    return {
      title: "Réglages",
      html: html`
      <div class="page-head"><div><div class="eyebrow">Préférences</div><h1>Réglages</h1><p>Tout est enregistré dans ce navigateur uniquement.</p></div></div>
      <div class="panel"><div class="panel-body">
        <section class="set-section"><div><h2>Apparence</h2><p>Thème, couleur d'accent et densité.</p></div><div>
          ${row("Thème", "Système suit le réglage clair/sombre de l'OS.", seg("theme", s.theme, [["dark", "Sombre"], ["light", "Clair"], ["system", "Système"]]))}
          ${row("Couleur d'accent", null, html`<div class="swatches">${ACCENTS.map(([k, c, l]) => html`<button class="swatch" style="--c:${c}" data-set="accent" data-v="${k}" aria-pressed="${s.accent === k}" aria-label="${l}" title="${l}"></button>`)}</div>`)}
          ${row("Densité", null, seg("density", s.density, [["comfortable", "Confort"], ["compact", "Compacte"]]))}
        </div></section>
        <section class="set-section"><div><h2>Animations</h2><p>Auto suit le réglage « effets d'animation » de ton système.</p></div><div>
          ${row("Niveau d'animation", null, seg("motion", s.motion, [["auto", "Auto"], ["full", "Pleines"], ["reduced", "Réduites"], ["none", "Aucune"]]))}
          <div class="callout info" style="margin-top:6px">${icon("info")}<div><b>Diagnostic</b>
            <p class="small">Préférence système « réduire les animations » : <b>${mqR ? "activée" : "désactivée"}</b> · Mode appliqué : <b data-eff>${{ full: "pleines", reduced: "réduites", none: "aucune" }[eff] || eff}</b></p>
            ${mqR ? html`<p class="small" style="margin-top:4px">C'est pour ça que Brave (ou Chrome) affichait le site sans animation : Windows a « Effets d'animation » désactivé (Paramètres → Accessibilité → Effets visuels), et le navigateur transmet ce choix au site. Choisis « Pleines » ici pour forcer les animations sur ce site uniquement.</p>` : ""}</div></div>
        </div></section>
        <section class="set-section"><div><h2>Graphiques</h2><p>Moteur : ${chartLibStatus() === "loaded" ? "Lightweight Charts" : "graphique simplifié (bibliothèque non chargée)"}.</p></div><div>
          ${row("Style de courbe", null, seg("chartStyle", s.chartStyle, [["area", "Aire"], ["line", "Ligne"]]))}
          ${row("Points sur les relevés", "Marque chaque relevé sur la courbe.", html`<label class="switch"><input type="checkbox" data-bool="chartMarkers" ${s.chartMarkers ? "checked" : ""}><span class="track"></span></label>`)}
        </div></section>
        <section class="set-section"><div><h2>Formats</h2><p>Les relevés dans une autre devise sont conservés mais exclus des graphiques.</p></div><div>
          ${row("Devise", null, html`<select class="select" data-sel="currency" style="width:120px">${CURRENCIES.map(c => html`<option ${c === s.currency ? "selected" : ""}>${c}</option>`)}</select>`)}
          ${row("Format de date", null, seg("dateFormat", s.dateFormat, [["fr", "19/11/2026"], ["iso", "2026-11-19"], ["relative", "il y a 2 j"]]))}
        </div></section>
        <section class="set-section"><div><h2>Données & rappels</h2><p>Aucun prix n'est récupéré automatiquement : un rappel t'invite à faire un relevé.</p></div><div>
          ${row("Rappel de relevé", "Tous les combien de jours.", html`<span class="input-affix" style="width:120px"><input class="input num" data-numset="reminderDays" inputmode="numeric" value="${s.reminderDays}"><em>jours</em></span>`)}
          ${row("Prix périmé après", "Au-delà, un prix est marqué périmé et les signaux deviennent prudents.", html`<span class="input-affix" style="width:120px"><input class="input num" data-numset="staleDays" inputmode="numeric" value="${s.staleDays}"><em>jours</em></span>`)}
        </div></section>
        <section class="set-section"><div><h2>Notifications</h2><p>Le centre de notifications du site fonctionne toujours. Les notifications système sont en option.</p></div><div>${browserPanel(state)}</div></section>
        <section class="set-section"><div><h2>Partage & sauvegarde</h2><p>Le budget n'est jamais partagé sauf si tu le coches.</p></div><div>
          <div class="actions"><button class="btn" data-act="share">${icon("share", { size: 16 })}Partager un instantané</button>
            <button class="btn" data-act="backup">${icon("download", { size: 16 })}Sauvegarde complète (JSON)</button>
            <button class="btn" data-act="restore">${icon("upload", { size: 16 })}Importer un fichier</button></div>
          <p class="tiny faint" style="margin-top:8px">L'import ajoute sans rien écraser et affiche un rapport avant d'écrire.</p>
        </div></section>
        <section class="set-section"><div><h2>Stockage</h2><p>${keys.length} clé(s), ${(total / 1024).toFixed(1)} Ko. Les sauvegardes automatiques (migration, réinitialisation, données illisibles) sont listées ici.</p></div><div>
          <div class="table-wrap"><table class="dt"><thead><tr><th>Clé</th><th class="r">Taille</th><th></th></tr></thead><tbody>
            ${keys.map(k => html`<tr><td class="small num" style="word-break:break-all">${k.key}${k.key === KEY_V2 ? html` <span class="tag ok">ACTIVE</span>` : ""}</td><td class="r num small">${(k.bytes / 1024).toFixed(1)} Ko</td>
              <td class="r"><div class="actions" style="flex-wrap:nowrap;justify-content:flex-end"><button class="btn btn-ghost btn-sm btn-icon" data-dl="${k.key}" aria-label="Télécharger">${icon("download", { size: 14 })}</button>${k.key !== KEY_V2 ? html`<button class="btn btn-ghost btn-sm btn-icon" data-rm="${k.key}" aria-label="Supprimer">${icon("trash", { size: 14 })}</button>` : ""}</div></td></tr>`)}
          </tbody></table></div>
          ${store.storageOk ? "" : html`<div class="callout bad" style="margin-top:8px">${icon("warning")}<span>Le stockage local est bloqué (navigation privée ou réglage du navigateur) : rien ne sera conservé après fermeture.</span></div>`}
        </div></section>
        <section class="set-section"><div><h2>Réinitialiser</h2><p>Une copie est toujours enregistrée avant.</p></div><div class="actions">
          <button class="btn" data-act="resetVisual">Réinitialiser l'apparence</button>
          <button class="btn btn-danger" data-act="resetAll">${icon("trash", { size: 16 })}Tout réinitialiser</button></div></section>
      </div></div>`,
      mount(el, ctx) {
        const st = ctx.store, set = (k, v) => st.commit("settings", s => (s.settings[k] = v));
        const offs = [
          on(el, "click", "[data-set]", (e, b) => set(b.dataset.set, b.dataset.v)),
          on(el, "change", "[data-bool]", (e, i) => set(i.dataset.bool, i.checked)),
          on(el, "change", "[data-sel]", (e, i) => set(i.dataset.sel, i.value)),
          on(el, "change", "[data-numset]", (e, i) => { const n = Math.round(Number(i.value)); if (!(n >= 1 && n <= 365)) { toast("Entre 1 et 365 jours", { tone: "bad" }); i.value = st.state.settings[i.dataset.numset]; return; } set(i.dataset.numset, n); }),
          on(el, "click", "[data-act=share]", () => shareDialog(st)),
          on(el, "click", "[data-act=backup]", () => download(`bourse-hardware-sauvegarde-${stamp()}.json`, JSON.stringify(fullBackup(st.state), null, 1))),
          on(el, "click", "[data-act=restore]", () => pickFile(st)),
          on(el, "click", "[data-dl]", (e, b) => download(`${b.dataset.dl}.json`, st.readKey(b.dataset.dl) || "")),
          on(el, "click", "[data-rm]", async (e, b) => { if (await confirmDialog({ title: "Supprimer cette sauvegarde ?", body: `${b.dataset.dl} sera effacée de ce navigateur. Télécharge-la avant si tu as un doute.`, confirm: "Supprimer", danger: true })) { st.removeKey(b.dataset.dl); st.commit("settings", () => {}); } }),
          on(el, "click", "[data-act=resetVisual]", async () => { if (await confirmDialog({ title: "Réinitialiser l'apparence ?", body: "Thème, accent, animations, graphiques et densité reviennent par défaut. Tes données ne bougent pas.", confirm: "Réinitialiser" })) st.resetVisual(); }),
          on(el, "click", "[data-act=resetAll]", async () => {
            if (!(await confirmDialog({ title: "Tout réinitialiser ?", body: `Produits, ${st.state.observations.length} relevés, alertes, budget et configs reviennent à l'état de départ. Une copie est enregistrée dans le stockage avant (Réglages → Stockage).`, confirm: "Tout réinitialiser", danger: true, typeToConfirm: "RÉINITIALISER" }))) return;
            st.resetAll(); toast("Données réinitialisées. Copie de sécurité enregistrée.", { tone: "ok" });
          }),
          ...browserHandlers(el, ctx),
        ];
        return { cleanup: () => offs.forEach(o => o()) };
      },
    };
  },
};
