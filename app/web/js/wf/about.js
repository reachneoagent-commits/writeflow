// Writeflow: "About and credits" dialog (privacy, responsible use, credits, shortcuts, links) and an
// "Open logs folder" row in the More menu. Credits are required by the Apache 2.0 license (see NOTICE).
import { getJSON, postJSON } from "../api.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const REPO = "https://github.com/reachneoagent-commits/writeflow";
const LINKS = {
  upstream: ["sgaofen/humanizer-local-model", "https://github.com/sgaofen/humanizer-local-model"],
  model: ["jialinyyzz/humanizer", "https://huggingface.co/jialinyyzz/humanizer"],
  llama: ["llama.cpp", "https://github.com/ggml-org/llama.cpp"],
  blader: ["blader/humanizer", "https://github.com/blader/humanizer"],
  aboud: ["Aboudjem/humanizer-skill", "https://github.com/Aboudjem/humanizer-skill"],
  wise: ["brandonwise/humanizer", "https://github.com/brandonwise/humanizer"],
  wiki: ["Wikipedia: Signs of AI writing", "https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing"],
};

function link(key, label) {
  const [name, href] = LINKS[key];
  const a = el("a", "upd-link", label || name);
  a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
  return a;
}

function section(title, ...kids) {
  const s = el("section", "wf-sec");
  s.append(el("h3", null, title), ...kids);
  return s;
}

function list(items) {
  const ul = el("ul", "wf-about-list");
  for (const it of items) {
    const li = el("li");
    if (Array.isArray(it)) li.append(...it); else li.append(document.createTextNode(it));
    ul.append(li);
  }
  return ul;
}

let ui = null, open = false, opener = null;

function build() {
  const scrim = el("div", "upd-scrim"); scrim.id = "wf-about-scrim"; scrim.hidden = true;
  const dlg = el("section", "upd ext wf-about"); dlg.id = "wf-about"; dlg.hidden = true;
  dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "wf-about-title");
  const head = el("header", "upd-head");
  const ht = el("div", "upd-head-text");
  const eb = el("p", "eyebrow", "Version ..."); eb.id = "wf-about-ver";
  const title = el("h2", "upd-title", "About Writeflow"); title.id = "wf-about-title";
  ht.append(eb, title);
  const close = el("button", "icon-btn"); close.type = "button"; close.setAttribute("aria-label", "Close");
  close.innerHTML = '<svg><use href="#i-close"/></svg>';
  head.append(ht, close);

  const body = el("div", "upd-body");
  body.append(
    el("p", "ext-lede", "Writeflow scans text for AI-sounding habits and rewrites it with a model that runs on your own computer. It is part of the FlowApps suite."),
    section("Your privacy", list([
      "Your text stays on this computer. There is no account, no analytics and no tracking.",
      "The app contacts GitHub and Hugging Face only to check for updates and to download the model.",
      "If you turn on a cloud model (Cloud in the header), your drafts are sent to that provider, and your API key stays on this computer. It is off by default.",
      "Settings and your writing-style sample are stored only on this computer.",
    ])),
    section("Using it responsibly", el("p", "wf-score-note", "The score is a guide to writing habits. It is not proof that a person or an AI wrote something. AI detectors are less reliable on short texts and on writing by people who are learning English, and a score alone should never decide anything about a person. Check your school's or workplace's rules on AI help, and edit the result in your own words before you use it. The model can still change details, so check numbers, names and quotes.")),
    section("Shortcuts", list([
      "Ctrl or ⌘ + Enter: Humanize all (while it is writing, the same button stops it).",
      "Select any text, then Humanize selection: rewrite just that part.",
      "Esc: close a dialog or panel.",
    ])),
    section("Credits", el("p", "wf-score-note", "Writeflow is a modified version of humanizer by Stephen Yu, used under the Apache License 2.0. Thank you to everyone below."), list([
      [link("upstream"), document.createTextNode(": the app this is built on (Apache 2.0).")],
      [link("model"), document.createTextNode(": the rewrite model, fine-tuned from google/gemma-4-12B (Apache 2.0). Downloaded by you; not bundled.")],
      [link("llama"), document.createTextNode(": runs the model on your computer (MIT).")],
      [document.createTextNode("AI-sounding rules written in our own words, informed by "), link("wiki"), document.createTextNode(", "), link("blader"), document.createTextNode(", "), link("aboud"), document.createTextNode(" and "), link("wise"), document.createTextNode(" (MIT).")],
    ])),
    section("Help", list([
      [el("a", "upd-link", "Report a problem or suggest something"), ],
    ])),
  );
  // the help link needs a real href
  const help = body.querySelector("a.upd-link:not([href])");
  if (help) { help.href = REPO + "/issues"; help.target = "_blank"; help.rel = "noopener noreferrer"; }

  const foot = el("footer", "upd-foot");
  const logs = el("button", "btn", "Open logs folder"); logs.type = "button";
  logs.title = "Useful if something goes wrong: the log files show what happened.";
  const grow = el("span", "grow");
  const done = el("button", "btn primary", "Done"); done.type = "button";
  foot.append(logs, grow, done);
  dlg.append(head, body, foot);
  document.body.append(scrim, dlg);
  return { scrim, dlg, close, done, logs, eb };
}

export async function openAbout(on = true, from = null) {
  if (!ui || on === open) return;
  open = on;
  ui.dlg.hidden = !on; ui.scrim.hidden = !on;
  if (!on) { if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); return; }
  opener = from || document.activeElement;
  try { const p = await getJSON("/app/ping"); ui.eb.textContent = "Version " + (p.version || "dev"); } catch { ui.eb.textContent = "Version"; }
  requestAnimationFrame(() => ui.done.focus({ preventScroll: true }));
}

function revealLogs() {
  return postJSON("/app/reveal", { what: "logs" }).catch(() => {});
}

// the details dropdown swallows clicks inside it, so close it by toggling its own button
function closeMenu() { if ($("pop") && !$("pop").hidden) $("btn-menu")?.click(); }

function addMenuRows() {
  const actions = document.querySelector("#pop .pop-actions");
  if (!actions || $("pa-about")) return;
  const quit = $("pa-quit");
  const mk = (id, icon, label, fn) => {
    const b = el("button", "row-btn"); b.id = id; b.type = "button";
    b.innerHTML = `<svg><use href="#${icon}"/></svg>`;
    b.append(el("span", null, label));
    b.addEventListener("click", () => { closeMenu(); fn(); });
    return b;
  };
  actions.insertBefore(mk("pa-logs", "i-folder", "Open logs folder", revealLogs), quit);
  actions.insertBefore(mk("pa-about", "i-info", "About and credits", () => openAbout(true, $("btn-menu"))), quit);
}

function start() {
  ui = build();
  ui.close.addEventListener("click", () => openAbout(false));
  ui.done.addEventListener("click", () => openAbout(false));
  ui.scrim.addEventListener("click", () => openAbout(false));
  ui.logs.addEventListener("click", revealLogs);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { e.stopPropagation(); openAbout(false); } }, true);
  addMenuRows();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
