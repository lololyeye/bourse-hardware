import { html, on, toast, confirmDialog } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { notify } from "../ui/notify.js";
import { ALERT_TYPES, describeAlert } from "../core/alerts.js";
import { fmtDate, fmtAgo } from "../core/format.js";
import { alertDialog, emptyState, productHref } from "./common.js";

export function browserPanel(state) {
  const perm = notify.permission(), bg = notify.backgroundStatus();
  const permLabel = { granted: ["Autorisées", "ok"], denied: ["Bloquées par le navigateur", "bad"], default: ["Pas encore demandées", ""], unsupported: ["Non prises en charge", "bad"] }[perm];
  return html`<section class="panel" data-sec="browser"><div class="panel-head"><h2>${icon("bell", { size: 16 })}Notifications du navigateur</h2><span class="tag ${permLabel[1]}">${permLabel[0].toUpperCase()}</span></div>
    <div class="panel-body" style="display:flex;flex-direction:column;gap:12px">
      <label class="switch"><input type="checkbox" data-browser ${state.settings.browserNotif ? "checked" : ""} ${perm === "unsupported" ? "disabled" : ""}><span class="track"></span>Envoyer les alertes au système (en plus du centre de notifications)</label>
      <div class="actions">${perm === "default" ? html`<button class="btn btn-sm" data-perm>Autoriser les notifications</button>` : ""}<button class="btn btn-sm" data-test ${perm !== "granted" ? "disabled" : ""}>Envoyer une notification de test</button></div>
      ${perm === "denied" ? html`<p class="small muted">Pour les réactiver : icône du cadenas dans la barre d'adresse → Notifications → Autoriser. Sur Brave, vérifie aussi brave://settings/content/notifications.</p>` : ""}
      <div class="callout ${bg.available ? "ok" : "info"}">${icon(bg.available ? "check" : "info")}<div><b>Surveillance en arrière-plan : ${bg.available ? "disponible" : "indisponible"}</b><p class="small">${bg.reason}</p>
        ${bg.available ? "" : html`<p class="small" style="margin-top:4px">Un site statique ne peut pas surveiller les prix une fois fermé. Il faudrait un serveur qui relève les prix (source autorisée) et envoie des Web Push : l'architecture est prête (service worker, abonnement push, clé VAPID publique), voir le README.</p>`}</div></div>
    </div></section>`;
}

export default {
  title: "Alertes",
  render({ state, query }) {
    const tab = query.tab === "history" ? "history" : "rules", cur = state.settings.currency;
    const byProduct = new Map();
    for (const a of state.alerts) { if (!byProduct.has(a.productId)) byProduct.set(a.productId, []); byProduct.get(a.productId).push(a); }
    const pName = id => state.products.find(p => p.id === id)?.name || id;
    const unread = state.notifications.filter(n => !n.read).length;
    return {
      title: "Alertes",
      html: html`
      <div class="page-head"><div><div class="eyebrow">${state.alerts.filter(a => a.enabled).length} actives sur ${state.alerts.length}</div><h1>Alertes de prix</h1><p>Elles se déclenchent à chaque relevé et à l'ouverture du site, une seule fois par événement.</p></div>
        <div class="actions"><div class="seg" role="tablist"><button role="tab" data-tab="rules" aria-pressed="${tab === "rules"}">Règles</button><button role="tab" data-tab="history" aria-pressed="${tab === "history"}">Historique${unread ? ` (${unread})` : ""}</button></div>
          <button class="btn btn-primary" data-act="new">${icon("plus", { size: 16 })}Nouvelle alerte</button></div></div>
      <div class="grid cols-3">
        <div class="span-2">${tab === "rules"
          ? (byProduct.size ? html`<div style="display:flex;flex-direction:column;gap:14px">${[...byProduct].map(([pid, list]) => html`<section class="panel"><div class="panel-head"><h3><a href="${productHref(pid)}" style="text-decoration:none">${pName(pid)}</a></h3><span class="tiny faint">${list.length} règle${list.length > 1 ? "s" : ""}</span></div>
              <div style="padding:6px 0 4px">${list.map(a => html`<div class="alert-row ${a.enabled ? "" : "off"}" data-id="${a.id}">
                <span class="aic">${icon(ALERT_TYPES[a.type]?.icon || "bell", { size: 15 })}</span>
                <div><div style="font-weight:500">${describeAlert(a, cur)}</div><div class="tiny faint">Créée ${fmtDate(a.createdAt)} · ${a.lastTriggeredAt ? `déclenchée ${fmtAgo(a.lastTriggeredAt)}` : "jamais déclenchée"}</div></div>
                <label class="switch a-hide" title="Notification système"><input type="checkbox" data-notify ${a.notify ? "checked" : ""}><span class="track"></span><span class="tiny muted">Notif.</span></label>
                <label class="switch" title="Activer / désactiver"><input type="checkbox" data-enabled ${a.enabled ? "checked" : ""} aria-label="Alerte active"><span class="track"></span></label>
                <div class="actions" style="flex-wrap:nowrap"><button class="btn btn-ghost btn-sm btn-icon" data-edit aria-label="Modifier">${icon("edit", { size: 14 })}</button><button class="btn btn-ghost btn-sm btn-icon" data-del aria-label="Supprimer">${icon("trash", { size: 14 })}</button></div>
              </div>`)}</div></section>`)}</div>`
            : html`<div class="panel">${emptyState("Aucune alerte.", "bell")}</div>`)
          : html`<section class="panel"><div class="panel-head"><h2>${icon("history", { size: 16 })}Historique des notifications</h2><div class="actions"><button class="btn btn-ghost btn-sm" data-act="read">Tout marquer comme lu</button><button class="btn btn-ghost btn-sm btn-danger" data-act="clear">Effacer l'historique</button></div></div>
              <div class="panel-body" style="padding:6px">${state.notifications.length ? state.notifications.map(n => html`<a class="notif ${n.read ? "" : "unread"}" data-nid="${n.id}" href="${n.productId ? productHref(n.productId) : "#/alerts?tab=history"}"><span class="u"></span><span><b>${n.title}</b><p>${n.body}</p></span><time>${fmtDate(n.ts, "fr", { time: true })}</time></a>`) : emptyState("Aucune notification pour l'instant.", "bell")}</div></section>`}
        </div>
        <div>${browserPanel(state)}</div>
      </div>`,
      mount(el, ctx) {
        const st = () => ctx.store.state;
        const A = b => st().alerts.find(a => a.id === b.closest("[data-id]").dataset.id);
        const offs = [
          on(el, "click", "[data-tab]", (e, b) => (location.hash = b.dataset.tab === "history" ? "#/alerts?tab=history" : "#/alerts")),
          on(el, "click", "[data-act=new]", () => alertDialog(ctx.store)),
          on(el, "click", "[data-edit]", (e, b) => alertDialog(ctx.store, { alert: A(b) })),
          on(el, "click", "[data-del]", async (e, b) => { const a = A(b); if (await confirmDialog({ title: "Supprimer cette alerte ?", body: describeAlert(a, st().settings.currency), confirm: "Supprimer", danger: true })) ctx.store.commit("alerts", s => { s.alerts = s.alerts.filter(x => x.id !== a.id); }); }),
          on(el, "change", "[data-enabled]", (e, i) => { const id = A(i).id; ctx.store.commit("alerts", s => { const a = s.alerts.find(x => x.id === id); a.enabled = i.checked; a.armed = true; }); }),
          on(el, "change", "[data-notify]", (e, i) => { const id = A(i).id; ctx.store.commit("alerts", s => { s.alerts.find(x => x.id === id).notify = i.checked; }, { source: location.hash }); }),
          on(el, "click", "[data-act=read]", () => ctx.store.commit("notifications", s => s.notifications.forEach(n => (n.read = true)))),
          on(el, "click", "[data-act=clear]", async () => { if (await confirmDialog({ title: "Effacer l'historique des notifications ?", body: `${st().notifications.length} notification(s) seront supprimées. Les règles d'alerte sont conservées.`, confirm: "Effacer", danger: true })) ctx.store.commit("notifications", s => { s.notifications = []; }); }),
          on(el, "click", "[data-nid]", (e, a) => ctx.store.commit("notifications", s => { const n = s.notifications.find(x => x.id === a.dataset.nid); if (n) n.read = true; })),
          ...browserHandlers(el, ctx),
        ];
        return { cleanup: () => offs.forEach(o => o()) };
      },
    };
  },
};

export function browserHandlers(el, ctx) {
  return [
    on(el, "change", "[data-browser]", async (e, i) => {
      if (i.checked && notify.permission() === "default") { const r = await notify.request(); if (r !== "granted") { i.checked = false; toast("Notifications refusées par le navigateur", { tone: "warn" }); } }
      ctx.store.commit("settings", s => (s.settings.browserNotif = i.checked && notify.permission() === "granted"));
    }),
    on(el, "click", "[data-perm]", async () => { const r = await notify.request(); toast(r === "granted" ? "Notifications autorisées" : "Notifications refusées", { tone: r === "granted" ? "ok" : "warn" }); if (r === "granted") ctx.store.commit("settings", s => (s.settings.browserNotif = true)); else ctx.store.commit("settings", () => {}); }),
    on(el, "click", "[data-test]", async () => { const ok = await notify.show("Notification de test", { body: "Les alertes de Bourse du Hardware s'afficheront comme ceci.", tag: "test", route: "#/alerts" }); toast(ok ? "Notification envoyée" : "Le navigateur n'a pas affiché la notification", { tone: ok ? "ok" : "bad" }); }),
  ];
}
