// Minimal Chrome DevTools Protocol harness — drives real Chromium browsers (Brave, Chrome, Edge)
// without any npm dependency. Node >= 22 (global WebSocket, fetch).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BROWSERS = {
  brave: ["C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", `${process.env.LOCALAPPDATA}/BraveSoftware/Brave-Browser/Application/brave.exe`],
  chrome: ["C:/Program Files/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`],
  edge: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"],
};
export const findBrowser = name => (BROWSERS[name] || []).find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(name, { port = 9300 + Math.floor(Math.random() * 500), headless = true, extraArgs = [] } = {}) {
  const exe = findBrowser(name);
  if (!exe) return null;
  const dir = mkdtempSync(join(tmpdir(), `cdp-${name}-`));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", ...(headless ? ["--headless=new"] : []), ...extraArgs, "about:blank"];
  const proc = spawn(exe, args, { stdio: "ignore" });
  let ver;
  for (let i = 0; i < 60 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }
  if (!ver) { proc.kill(); throw new Error(`${name}: DevTools endpoint did not start`); }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else listeners.forEach(l => l(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Runtime.enable"); await s("Page.enable"); await s("Log.enable");
  const errors = [];
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`${m.params.entry.text} ${m.params.entry.url || ""}`);
  });
  const api = {
    name, version: ver.Browser, errors,
    send: s,
    async goto(url, waitMs = 1500) { await s("Page.navigate", { url }); await sleep(waitMs); },
    async eval(expr) {
      const r = await s("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async emulateMotion(value) { await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] }); },
    async viewport(width, height, mobile = false) { await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }); },
    async screenshot(path) { const { data } = await s("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(path, Buffer.from(data, "base64")); },
    async close() { try { ws.close(); } catch {} proc.kill(); await sleep(400); try { rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
  return api;
}
