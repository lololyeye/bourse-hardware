// Single source of truth. Only this module writes to localStorage.
import { loadState, normalize, KEY_V2, KEY_V1, DEFAULT_SETTINGS, VISUAL_KEYS } from "./migrate.js";
import { runAlerts } from "./alerts.js";
import { derive } from "./derive.js";
import { uid } from "./format.js";

let state = null, rev = 0, saveTimer = 0, lastSaveError = null;
const subs = new Set();
const hooks = { onNotify: () => {}, onError: () => {} };

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { lastSaveError = e; return false; } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
  available() { try { const k = "__bh_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch { return false; } },
};

function persist() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!ls.set(KEY_V2, JSON.stringify(state))) hooks.onError("Impossible d'enregistrer (stockage plein ou bloqué). Exporte tes données depuis Réglages.");
}
function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(persist, 250); }

function emit(change) { for (const fn of subs) { try { fn(change); } catch (e) { console.error(e); } } }

function evaluateAlerts() {
  const d = derive(state, rev);
  const { fired, patches } = runAlerts(state.alerts, pid => { const x = d.byId.get(pid); return x ? { obs: x.obs, watch: x.watch, signal: x.signal, product: x.product, currency: state.settings.currency } : null; });
  if (!patches.size && !fired.length) return;
  for (const a of state.alerts) if (patches.has(a.id)) Object.assign(a, patches.get(a.id));
  const notes = fired.map(f => ({ id: uid("n"), ts: Date.now(), alertId: f.alert.id, productId: f.alert.productId, kind: f.alert.type, title: f.title, body: f.body, read: false, browser: f.alert.notify }));
  state.notifications.unshift(...notes);
  state.notifications = state.notifications.slice(0, 300);
  rev++;
  if (notes.length) hooks.onNotify(notes);
}

const ALERT_AFFECTING = new Set(["observations", "watchlist", "alerts", "products", "import", "budget"]);

export const store = {
  get state() { return state; },
  get rev() { return rev; },
  get storageOk() { return ls.available(); },
  get derived() { return derive(state, rev); },
  setHooks(h) { Object.assign(hooks, h); },

  init() {
    const r = loadState(ls.get(KEY_V2), ls.get(KEY_V1));
    state = r.state;
    for (const [k, v] of Object.entries(r.writes)) ls.set(k, v);
    persist();
    // keep several tabs consistent
    addEventListener("storage", e => {
      if (e.key !== KEY_V2 || !e.newValue) return;
      try { state = normalize(JSON.parse(e.newValue)).state; rev++; emit({ type: "external" }); } catch {}
    });
    addEventListener("pagehide", () => saveTimer && persist());
    return r;
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

  /** All mutations go through here. type is used by views to decide what to refresh. */
  commit(type, mutate, { source = null } = {}) {
    const result = mutate(state);
    rev++;
    if (ALERT_AFFECTING.has(type)) evaluateAlerts();
    scheduleSave();
    emit({ type, source });
    return result;
  },
  runAlertsNow() { evaluateAlerts(); scheduleSave(); emit({ type: "notifications" }); },

  addNotifications(list) {
    this.commit("notifications", s => { s.notifications.unshift(...list.map(n => ({ id: uid("n"), ts: Date.now(), read: false, alertId: null, productId: null, kind: "info", ...n }))); s.notifications = s.notifications.slice(0, 300); });
    hooks.onNotify(list);
  },

  resetVisual() { this.commit("settings", s => { for (const k of VISUAL_KEYS) s.settings[k] = structuredClone(DEFAULT_SETTINGS[k]); }); },
  resetAll() {
    ls.set(`bourse-hardware-before-reset-${Date.now()}`, JSON.stringify(state));
    const r = loadState(null, null);
    state = r.state; rev++; persist(); emit({ type: "reset" });
  },
  replaceState(next) { state = normalize(next).state; rev++; persist(); emit({ type: "import" }); },

  storageInfo() {
    const keys = ls.keys().filter(k => k.startsWith("bourse-hardware"));
    return keys.map(k => ({ key: k, bytes: (ls.get(k) || "").length * 2 })).sort((a, b) => a.key.localeCompare(b.key));
  },
  readKey(k) { return ls.get(k); },
  removeKey(k) { if (k === KEY_V2) return false; try { localStorage.removeItem(k); return true; } catch { return false; } },
  flush() { persist(); },
};
