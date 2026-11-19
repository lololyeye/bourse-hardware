// Tiny DOM toolkit: escaped templates, event delegation, toasts, dialogs.
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const part = v => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join("") : v == null || v === false ? "" : esc(v));
/** Tagged template: every interpolation is escaped unless it is a Raw (from html`` or raw()). */
export function html(strings, ...vals) { let s = strings[0]; for (let i = 0; i < vals.length; i++) s += part(vals[i]) + strings[i + 1]; return new Raw(s); }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated listener; returns an off() function. */
export function on(root, type, selector, fn, opts) {
  const h = e => { const t = e.target.closest?.(selector); if (t && root.contains(t)) fn(e, t); };
  root.addEventListener(type, h, opts);
  return () => root.removeEventListener(type, h, opts);
}

export function setHTML(el, content) { el.innerHTML = content instanceof Raw ? content.s : esc(content); }

/* ---------- Toasts ---------- */
let toastHost;
export function toast(message, { tone = "info", action = null, timeout = 4200 } = {}) {
  toastHost ||= Object.assign(document.body.appendChild(document.createElement("div")), { className: "toasts", role: "status" });
  toastHost.setAttribute("aria-live", "polite");
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="btn btn-ghost btn-sm">${esc(action.label)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => { action.run(); dismiss(); };
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const dismiss = () => { el.classList.remove("in"); setTimeout(() => el.remove(), 220); };
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}

/* ---------- Dialogs (native <dialog>, focus trapped by the browser) ---------- */
function openDialog(inner, { wide = false, label = "Dialogue" } = {}) {
  const d = document.createElement("dialog");
  d.className = `dlg${wide ? " dlg-wide" : ""}`;
  d.setAttribute("aria-label", label);
  d.innerHTML = inner instanceof Raw ? inner.s : inner;
  document.body.append(d);
  if (typeof d.showModal === "function") d.showModal(); else { d.setAttribute("open", ""); d.classList.add("dlg-fallback"); }
  requestAnimationFrame(() => d.classList.add("in"));
  return d;
}
function closeDialog(d) { d.classList.remove("in"); setTimeout(() => { try { d.close(); } catch {} d.remove(); }, 160); }

export function confirmDialog({ title, body = "", confirm = "Confirmer", cancel = "Annuler", danger = false, typeToConfirm = null }) {
  return new Promise(resolve => {
    const d = openDialog(html`<form method="dialog" class="dlg-form">
      <header class="dlg-head"><h2>${title}</h2></header>
      <div class="dlg-body">${body instanceof Raw ? body : html`<p>${body}</p>`}
        ${typeToConfirm ? html`<label class="field"><span>Tape <b>${typeToConfirm}</b> pour confirmer</span><input class="input" name="confirm" autocomplete="off" required></label>` : ""}
      </div>
      <footer class="dlg-foot"><button class="btn btn-ghost" value="cancel" formnovalidate>${cancel}</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" value="ok">${confirm}</button></footer>
    </form>`, { label: title });
    const ok = d.querySelector('button[value="ok"]'), input = d.querySelector('input[name="confirm"]');
    if (input) { ok.disabled = true; input.oninput = () => (ok.disabled = input.value.trim() !== typeToConfirm); setTimeout(() => input.focus(), 30); }
    d.addEventListener("close", () => { resolve(d.returnValue === "ok"); closeDialog(d); }, { once: true });
    d.addEventListener("cancel", () => (d.returnValue = "cancel"));
  });
}

/**
 * Form dialog. `validate(data, form)` may return an error string. Resolves with an object of field values, or null.
 * `onMount(dialog)` lets the caller wire dynamic behaviour.
 */
export function formDialog({ title, body, submit = "Enregistrer", wide = false, validate = null, onMount = null }) {
  return new Promise(resolve => {
    const d = openDialog(html`<form class="dlg-form" novalidate>
      <header class="dlg-head"><h2>${title}</h2><button type="button" class="btn btn-icon btn-ghost" data-x aria-label="Fermer">${raw('<svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18"/></svg>')}</button></header>
      <div class="dlg-body">${body}<p class="form-error" role="alert" hidden></p></div>
      <footer class="dlg-foot"><button type="button" class="btn btn-ghost" data-x>Annuler</button><button class="btn btn-primary" type="submit">${submit}</button></footer>
    </form>`, { wide, label: title });
    const form = d.querySelector("form"), err = d.querySelector(".form-error");
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); closeDialog(d); };
    d.querySelectorAll("[data-x]").forEach(b => (b.onclick = () => finish(null)));
    d.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === "checkbox") data[el.name] = el.checked;
        else if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
        else data[el.name] = el.value;
      }
      const msg = validate?.(data, form);
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      finish(data);
    });
    onMount?.(d);
    setTimeout(() => form.querySelector("input:not([type=hidden]),select,textarea")?.focus(), 40);
  });
}

/** Simple dropdown/popover anchored to a button. Closes on outside click / Escape. */
export function popover(anchor, content, { align = "end", className = "" } = {}) {
  closePopovers();
  const p = document.createElement("div");
  p.className = `popover ${className}`;
  p.setAttribute("role", "dialog");
  p.innerHTML = content instanceof Raw ? content.s : content;
  document.body.append(p);
  const r = anchor.getBoundingClientRect(), w = Math.min(p.offsetWidth, innerWidth - 16);
  const left = align === "end" ? Math.max(8, r.right - w) : Math.min(r.left, innerWidth - w - 8);
  p.style.left = `${left + scrollX}px`; p.style.top = `${r.bottom + 6 + scrollY}px`;
  anchor.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => p.classList.add("in"));
  const close = () => { p.remove(); anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", key); };
  const outside = e => { if (!p.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = e => { if (e.key === "Escape") { close(); anchor.focus(); } };
  setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", key); });
  p._close = close;
  return p;
}
export function closePopovers() { $$(".popover").forEach(p => p._close?.()); }
