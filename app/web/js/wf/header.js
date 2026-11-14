// Writeflow header: the things people actually change are one click away, next to the logo.
//   [logo]  [Model: Q8_0]  [Cloud]  [more ...]                    [status] [history] [theme] [lang]
// "Model" opens the model-size picker, "Cloud" opens the API-key dialog, and "more ..." (the old right-hand
// menu button, moved here) holds everything used less often, plus the model/engine/device details.
// The menu's own code is untouched: we only move its button and add buttons that click its existing rows.
import { openCloud } from "./cloud.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function navButton(id, icon, label) {
  const b = el("button", "wf-nav-btn"); b.id = id; b.type = "button";
  b.innerHTML = `<svg aria-hidden="true"><use href="#${icon}"/></svg>`;
  b.append(el("span", "wf-nav-label", label));
  return b;
}

function start() {
  const bar = document.querySelector("header.bar");
  const brand = bar?.querySelector(".brand");
  const more = $("btn-menu");
  if (!bar || !brand || !more || $("wf-nav")) return;

  const nav = el("nav", "wf-nav"); nav.id = "wf-nav"; nav.setAttribute("aria-label", "Model and settings");
  const model = navButton("wf-nav-model", "i-layers", "Model");
  const modelVal = el("span", "wf-nav-val", "");
  model.append(modelVal);
  model.title = "Change the local model size";
  const cloud = navButton("wf-nav-cloud", "i-plug", "Cloud");
  const dot = el("span", "wf-nav-dot"); dot.hidden = true; cloud.append(dot);
  cloud.title = "Use a cloud model with your API key";

  // Restart is the recovery button: always one click away, and it turns coral when the engine reports an error.
  const restart = navButton("wf-nav-restart", "i-redo", "Restart");
  restart.title = "Restart the local engine. Use this if rewriting stops working.";

  more.setAttribute("title", "More: storage, updates, logs, about");
  more.classList.add("wf-nav-more");
  nav.append(model, cloud, restart, more); // moving #btn-menu keeps its click handler
  brand.after(nav);

  // upstream's own rows do the work, so behaviour stays identical
  model.addEventListener("click", () => $("pa-tier")?.click());
  cloud.addEventListener("click", () => openCloud(true, cloud));
  restart.addEventListener("click", () => $("pa-restart")?.click());

  // current model name on the Model button, and "on" state on Cloud
  const sync = () => {
    // status pill reads "Ready · Q8_0 · Metal": the second part is the model size
    const parts = ($("status-text")?.textContent || "").split("·").map((x) => x.trim());
    const first = parts[0] === "Ready" && parts.length >= 3 && parts[1] !== "Cloud" ? parts[1] : "";
    const cloudOn = document.documentElement.hasAttribute("data-wf-cloud");
    modelVal.textContent = !cloudOn && first && first !== "—" ? first : "";
    model.classList.toggle("is-dim", cloudOn);
    cloud.classList.toggle("is-on", cloudOn);
    dot.hidden = !cloudOn;
    cloud.title = cloudOn ? "Cloud model is on. Click to change or switch back." : "Use a cloud model with your API key";
    // restart only applies to the local engine, and glows when the engine is in an error state
    const external = cloudOn || /External/i.test($("status-text")?.textContent || "");
    restart.hidden = external;
    restart.classList.toggle("is-alert", $("status")?.dataset.state === "error");
  };
  if ($("status-text")) new MutationObserver(sync).observe($("status-text"), { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-wf-cloud"] });
  if ($("status")) new MutationObserver(sync).observe($("status"), { attributes: true, attributeFilter: ["data-state"] });
  setInterval(sync, 3000);
  sync();

  // the details dropdown opens under whichever button was used: "more" (left) or the status pill (right)
  let anchor = more;
  document.addEventListener("click", (e) => { const t = e.target.closest?.("#btn-menu, #status"); if (t) anchor = t; }, true);
  const pop = $("pop");
  if (pop) new MutationObserver(() => {
    if (pop.hidden) return;
    if (innerWidth <= 980) { pop.style.left = pop.style.right = ""; return; }
    const r = anchor.getBoundingClientRect();
    if (anchor === more) { pop.style.left = Math.max(12, Math.round(r.left)) + "px"; pop.style.right = "auto"; }
    else { pop.style.left = "auto"; pop.style.right = "24px"; }
  }).observe(pop, { attributes: true, attributeFilter: ["hidden"] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
