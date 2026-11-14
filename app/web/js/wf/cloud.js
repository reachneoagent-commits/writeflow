// Writeflow: use a cloud model (OpenAI, Claude, NVIDIA, Gemini, OpenRouter, or any OpenAI-compatible API)
// with your own API key, instead of the local model. Off by default.
//
// It reuses the launcher's existing "external service" plumbing (the launcher keeps the key on this computer
// and adds it to the request; the page never sees it again). This file adds: provider presets, a dialog,
// a menu entry, an onboarding choice, a privacy notice, and the instruction prompt for general models
// (the local humanizer model is trained on one fixed prompt; general chat models need instructions).
import { getJSON, postJSON } from "../api.js";
import { applyExternal, describeTest } from "../external.js";

import { PROVIDERS, isCloud, providerFor } from "./cloudcore.js";
export { PROVIDERS, isCloud, providerFor, CLOUD_SYSTEM_PROMPT, cloudMessages } from "./cloudcore.js";

// ───────────────────────── UI ─────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const store = {
  get(k) { try { return localStorage.getItem("wf." + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("wf." + k, v); } catch { /* ignore */ } },
};

const S = { open: false, opener: null, st: null, keyDirty: false, busy: false };
let ui = null;

function build() {
  const scrim = el("div", "upd-scrim"); scrim.id = "wf-cloud-scrim"; scrim.hidden = true;
  const dlg = el("section", "upd ext wf-cloud"); dlg.id = "wf-cloud"; dlg.hidden = true;
  dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "wf-cloud-title");

  const head = el("header", "upd-head");
  const ht = el("div", "upd-head-text");
  const eb = el("p", "eyebrow", "Advanced");
  const title = el("h2", "upd-title", "Use a cloud model"); title.id = "wf-cloud-title";
  ht.append(eb, title);
  const close = el("button", "icon-btn"); close.type = "button"; close.setAttribute("aria-label", "Close");
  close.innerHTML = '<svg><use href="#i-close"/></svg>';
  head.append(ht, close);

  const body = el("div", "upd-body");
  body.append(el("p", "ext-lede", "Rewrite with your own account at an AI provider instead of the local model. Your drafts are sent to that provider over the internet and may be billed to your account. Nothing is sent unless you turn this on. The local model stays the default and is the private option."));

  const fProv = el("label", "ext-field"); fProv.append(el("span", null, "Provider"));
  const sel = el("select"); sel.id = "wf-cloud-provider";
  for (const p of PROVIDERS) { const o = el("option", null, p.label); o.value = p.id; sel.append(o); }
  fProv.append(sel);

  const fUrl = el("label", "ext-field"); fUrl.append(el("span", null, "Server address"));
  const url = el("input"); url.id = "wf-cloud-url"; url.type = "text"; url.spellcheck = false; url.autocomplete = "off"; url.placeholder = "https://api.example.com/v1";
  fUrl.append(url);

  const fKey = el("label", "ext-field"); fKey.append(el("span", null, "API key"));
  const keyRow = el("div", "ext-key-row");
  const key = el("input"); key.id = "wf-cloud-key"; key.type = "password"; key.autocomplete = "off"; key.spellcheck = false; key.placeholder = "Paste your API key";
  const keyClear = el("button", "btn ghost", "Remove saved key"); keyClear.type = "button"; keyClear.hidden = true;
  keyRow.append(key, keyClear); fKey.append(keyRow);
  const getKey = el("a", "upd-link", "Where do I get a key?"); getKey.id = "wf-cloud-getkey"; getKey.target = "_blank"; getKey.rel = "noopener noreferrer"; getKey.hidden = true;

  const fModel = el("label", "ext-field"); fModel.append(el("span", null, "Model"));
  const model = el("input"); model.id = "wf-cloud-model"; model.type = "text"; model.spellcheck = false; model.autocomplete = "off";
  model.placeholder = "Press Test connection, then pick a model"; model.setAttribute("list", "wf-cloud-models");
  const dl = el("datalist"); dl.id = "wf-cloud-models";
  fModel.append(model, dl);

  const consent = el("label", "wf-consent");
  const cb = el("input"); cb.type = "checkbox"; cb.id = "wf-cloud-consent";
  const cbText = el("span"); cbText.id = "wf-cloud-consent-text";
  consent.append(cb, cbText);

  const result = el("div", "ext-result"); result.id = "wf-cloud-result"; result.hidden = true; result.setAttribute("role", "status");
  const note = el("p", "wf-score-note", "Use a key from your own account. The key is stored only on this computer. A key is a password: don't share it. Rewrites use your provider's usage and billing. Models can change details, so Writeflow still checks facts after each rewrite.");

  body.append(fProv, fUrl, fKey, getKey, fModel, consent, result, note);

  const foot = el("footer", "upd-foot");
  const test = el("button", "btn", "Test connection"); test.type = "button";
  const local = el("button", "btn ghost", "Use the local model"); local.type = "button"; local.hidden = true;
  const grow = el("span", "grow");
  const save = el("button", "btn primary", "Save and use"); save.type = "button";
  foot.append(test, local, grow, save);

  dlg.append(head, body, foot);
  document.body.append(scrim, dlg);
  return { scrim, dlg, close, sel, url, key, keyClear, getKey, model, dl, cb, cbText, result, test, local, save, title };
}

function showResult(kind, text) {
  ui.result.hidden = !text;
  ui.result.className = "ext-result" + (kind ? " " + kind : "");
  ui.result.textContent = text || "";
}

const providerOf = () => PROVIDERS.find((p) => p.id === ui.sel.value) || PROVIDERS.at(-1);

function refresh() {
  const p = providerOf();
  ui.getKey.hidden = !p.keyUrl;
  if (p.keyUrl) ui.getKey.href = p.keyUrl;
  ui.url.readOnly = p.id !== "other";
  ui.cbText.textContent = `I understand my drafts will be sent to ${p.id === "other" ? "this server" : p.label} and may be billed to my account.`;
  const hasKey = !!S.st?.has_key && !S.keyDirty;
  ui.key.placeholder = hasKey ? "A key is saved. Paste a new one to replace it." : "Paste your API key";
  ui.keyClear.hidden = !S.st?.has_key;
  ui.local.hidden = !(S.st?.enabled);
  ui.save.disabled = S.busy || !ui.cb.checked;
  ui.test.disabled = S.busy;
}

function applyProvider(id, keepUrl) {
  ui.sel.value = id;
  const p = providerOf();
  if (!keepUrl) ui.url.value = p.url;
  store.set("cloudProvider", id);
  refresh();
}

async function test() {
  const url = ui.url.value.trim();
  if (!url) { showResult("err", "Enter the server address first."); return null; }
  S.busy = true; refresh(); showResult("", "Testing...");
  let r;
  try {
    r = await postJSON("/app/external/test", { url, api_key: S.keyDirty ? ui.key.value.trim() : undefined }, { timeout: 20000 });
  } catch (e) { r = { ok: false, code: "http", message: e.message }; }
  S.busy = false;
  const d = describeTest(r);
  showResult(d.kind, d.text);
  if (r.ok) {
    ui.dl.replaceChildren(...(r.models || []).map((m) => Object.assign(document.createElement("option"), { value: m })));
    if (!ui.model.value.trim()) showResult("ok", d.text + " Pick a model below.");
  }
  refresh();
  return r;
}

async function save() {
  const url = ui.url.value.trim(), model = ui.model.value.trim();
  if (!url) { showResult("err", "Enter the server address."); ui.url.focus(); return; }
  if (!model) { showResult("err", "Enter a model name. Press Test connection to see the list."); ui.model.focus(); return; }
  if (!S.st?.has_key && !ui.key.value.trim()) { showResult("err", "Paste your API key."); ui.key.focus(); return; }
  S.busy = true; refresh();
  try {
    const st = await applyExternal({ enabled: true, url, model, apiKey: S.keyDirty ? ui.key.value.trim() : undefined });
    S.st = st;
    openCloud(false);
  } catch (e) {
    showResult("err", "Could not save: " + e.message);
  } finally {
    S.busy = false; refresh();
  }
}

async function useLocal() {
  S.busy = true; refresh();
  try {
    S.st = await applyExternal({ enabled: false, url: S.st?.url || ui.url.value.trim(), model: S.st?.model || "", apiKey: undefined });
    openCloud(false);
  } catch (e) { showResult("err", "Could not switch: " + e.message); }
  finally { S.busy = false; refresh(); }
}

export async function openCloud(open = true, opener = null) {
  if (!ui || open === S.open) return;
  S.open = open;
  ui.dlg.hidden = !open; ui.scrim.hidden = !open;
  if (!open) { if (S.opener && document.contains(S.opener)) S.opener.focus({ preventScroll: true }); return; }
  S.opener = opener || document.activeElement;
  S.keyDirty = false; ui.key.value = ""; showResult("", ""); ui.cb.checked = false;
  try { S.st = await getJSON("/app/external"); } catch { S.st = {}; }
  const cur = S.st.enabled && isCloud(S.st.url) ? providerFor(S.st.url) : null;
  if (cur) { applyProvider(cur.id, true); ui.url.value = S.st.url; ui.model.value = S.st.model || ""; ui.cb.checked = true; }
  else { applyProvider(store.get("cloudProvider") || "openai", false); ui.model.value = ""; }
  refresh();
  requestAnimationFrame(() => ui.key.focus({ preventScroll: true }));
}

// ───────────────────────── entry points ─────────────────────────
function addMenuRow() {
  const actions = document.querySelector("#pop .pop-actions");
  if (!actions || $("pa-cloud")) return;
  const btn = el("button", "row-btn"); btn.id = "pa-cloud"; btn.type = "button";
  btn.innerHTML = '<svg><use href="#i-plug"/></svg>';
  btn.append(el("span", null, "Cloud model (API key)"));
  const badge = el("span", "row-badge", "On"); badge.id = "pa-cloud-badge"; badge.hidden = true; btn.append(badge);
  btn.addEventListener("click", () => openCloud(true, $("btn-menu")));
  actions.insertBefore(btn, $("pa-external") || actions.firstChild);
}

function addOnboardingChoice() {
  const card = $("setup-card");
  if (!card || $("wf-choice")) return;
  const box = el("div", "wf-choice"); box.id = "wf-choice";
  box.append(el("p", "wf-choice-title", "How do you want to rewrite?"));
  const row = el("div", "wf-choice-row");
  const local = el("button", "wf-choice-btn on"); local.type = "button";
  local.append(el("b", null, "Download a local model"), el("span", null, "Free, private and offline. Recommended."));
  const cloud = el("button", "wf-choice-btn"); cloud.type = "button";
  cloud.append(el("b", null, "Use an API key"), el("span", null, "OpenAI, Claude, NVIDIA, Gemini and more. Text is sent online."));
  local.addEventListener("click", () => { local.classList.add("on"); cloud.classList.remove("on"); $("tiers")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
  cloud.addEventListener("click", () => openCloud(true, cloud));
  row.append(local, cloud); box.append(row);
  card.prepend(box);
}

/** Show "Cloud" in the status pill and a privacy line in the Writeflow panel while a cloud model is active. */
function watchStatus() {
  const text = $("status-text");
  const sync = async () => {
    let st; try { st = await getJSON("/app/external"); } catch { return; }
    const on = !!st.enabled && isCloud(st.url);
    S.active = on ? { st, p: providerFor(st.url) } : null;
    const badge = $("pa-cloud-badge"); if (badge) badge.hidden = !on;
    document.documentElement.toggleAttribute("data-wf-cloud", on);
    if (text && on) {
      const p = S.active.p;
      const want = `Ready · Cloud · ${p ? p.label : "API"}${st.model ? " · " + st.model : ""}`;
      if (text.textContent !== want && /^Ready/.test(text.textContent)) text.textContent = want;
    }
    let line = $("wf-cloud-line");
    const banner = $("wf-banner");
    if (on && banner) {
      if (!line) { line = el("p", "wf-cloud-line"); line.id = "wf-cloud-line"; banner.append(line); }
      line.textContent = `Cloud mode: your drafts are sent to ${S.active.p ? S.active.p.label : new URL(st.url).hostname}. Use the menu to switch back to the local model.`;
      banner.hidden = false;
    } else {
      line?.remove();
      if (banner && !banner.children.length) banner.hidden = true;
    }
  };
  sync();
  setInterval(sync, 4000);
  if (text) new MutationObserver(() => { if (S.active && /^Ready · (?!Cloud)/.test(text.textContent)) sync(); }).observe(text, { childList: true, characterData: true, subtree: true });
}

function start() {
  ui = build();
  ui.sel.addEventListener("change", () => { applyProvider(ui.sel.value, false); showResult("", ""); });
  ui.cb.addEventListener("change", refresh);
  ui.key.addEventListener("input", () => { S.keyDirty = true; refresh(); });
  ui.keyClear.addEventListener("click", async () => {
    try { S.st = await postJSON("/app/external", { enabled: !!S.st?.enabled, url: S.st?.url || "", model: S.st?.model || "", api_key: "" }); S.keyDirty = false; ui.key.value = ""; showResult("ok", "Saved key removed."); }
    catch (e) { showResult("err", "Could not remove the key: " + e.message); }
    refresh();
  });
  ui.test.addEventListener("click", () => test());
  ui.save.addEventListener("click", () => save());
  ui.local.addEventListener("click", () => useLocal());
  ui.close.addEventListener("click", () => openCloud(false));
  ui.scrim.addEventListener("click", () => openCloud(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.open) { e.stopPropagation(); openCloud(false); } }, true);
  for (const i of [ui.url, ui.model, ui.key]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (!ui.save.disabled) save(); } });
  addMenuRow();
  addOnboardingChoice();
  watchStatus();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
