// Browser notifications, service worker and (optional) Web Push subscription.
import { CONFIG } from "../config.js";

let reg = null, swError = null;
const listeners = new Set();

export const notify = {
  get supported() { return "Notification" in window; },
  get swSupported() { return "serviceWorker" in navigator && window.isSecureContext; },
  get pushSupported() { return this.swSupported && "PushManager" in window; },
  get registration() { return reg; },
  get swError() { return swError; },
  permission() { return this.supported ? Notification.permission : "unsupported"; },

  async request() {
    if (!this.supported) return "unsupported";
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  },

  async registerSW() {
    if (!this.swSupported) return null;
    try {
      reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      navigator.serviceWorker.addEventListener("message", e => listeners.forEach(l => l(e.data)));
    } catch (e) { swError = e?.message || String(e); }
    return reg;
  },
  onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Shows a system notification. Returns false (never throws) if unavailable. */
  async show(title, { body = "", tag = undefined, route = "#/overview" } = {}) {
    if (this.permission() !== "granted") return false;
    try {
      if (reg) { await reg.showNotification(title, { body, tag, data: { route } }); return true; }
      const n = new Notification(title, { body, tag });
      n.onclick = () => { window.focus(); location.hash = route; n.close(); };
      return true;
    } catch { return false; }
  },

  /** Background monitoring needs a server: report exactly what is missing. */
  backgroundStatus() {
    if (!this.pushSupported) return { available: false, reason: "Ce navigateur ne prend pas en charge Web Push (ou la page n'est pas en HTTPS)." };
    if (!CONFIG.pushEndpoint || !CONFIG.vapidPublicKey) return { available: false, reason: "Aucun serveur de surveillance n'est configuré. Les alertes fonctionnent quand le site est ouvert, pas quand il est fermé." };
    if (!reg) return { available: false, reason: `Service worker non enregistré${swError ? ` (${swError})` : ""}.` };
    return { available: true, reason: "Serveur configuré." };
  },

  async subscribePush(productIds = []) {
    const st = this.backgroundStatus();
    if (!st.available) throw new Error(st.reason);
    const key = Uint8Array.from(atob(CONFIG.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const res = await fetch(CONFIG.pushEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub, productIds }) });
    if (!res.ok) throw new Error(`Le serveur a refusé l'abonnement (${res.status})`);
    return true;
  },
};
