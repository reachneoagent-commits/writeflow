// Writeflow workspace: scan first, then humanize.
//
//   LEFT  "Your text"           paste / import, press Scan. After a scan it becomes a review view where the
//                               AI-sounding sentences and phrases are highlighted; select any text (or click a
//                               highlighted sentence) to humanize just that part.
//   RIGHT [Score] [Rewrite]     Score: gauge, verdict, most AI-sounding sentences, details, "Humanize all".
//                               Rewrite: a slim score strip on top, then the rewrite (the app's own diff view),
//                               plus selection rewrites you can drop into your text, and Undo.
//
// It reads and drives the page through its public elements (#draft, #output, #btn-go, ...), so the app's own
// rewrite code is untouched. User text is only ever inserted with textContent.
import { analyze, BAND_TEXT } from "./score.js";
import { compareFacts } from "./factcheck.js";
import { readingGrade, levelAdvice, LEVELS, fingerprint, similarity, styleGaps } from "./style.js";
import { rankSentences } from "./sentences.js";
import { rewriteSelection } from "./rewrite.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const svgNS = "http://www.w3.org/2000/svg";

const store = {
  get(k, d) { try { const v = localStorage.getItem("wf." + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wf." + k, v); } catch { /* storage blocked: still works this session */ } },
  del(k) { try { localStorage.removeItem("wf." + k); } catch { /* ignore */ } },
};

const BAND_LABEL = { low: "Low", medium: "Medium", high: "High" };
const BAND_TONE = { low: "ok", medium: "warn", high: "bad" };
const MIN_SEL = 8;

const S = {
  tab: "score",            // "score" | "rewrite"
  mode: "edit",            // "edit" | "review"
  scan: null,              // { text, a, rk, at }
  stale: false,
  level: store.get("level", "high"),
  profileText: store.get("profile", ""),
  undo: [],                // earlier versions of the text (for Undo)
  sel: null,               // selection rewrite { start, end, text, out, state, ctl }
  note: "",                // short message in the status line
  lastDraft: "",
  flagsOpen: false,
};
let ui = null;

const draftText = () => $("draft")?.value || "";
const outText = () => ($("output")?.textContent || "").trim();
const words = (t) => (t.trim().match(/\S+/g) || []).length;

// ───────────────────────── small builders ─────────────────────────
function chip(label, value, tone) {
  const b = el("span", "wf-sig");
  b.dataset.tone = tone || "neutral";
  b.append(el("span", "wf-sig-k", label));
  if (value != null) b.append(el("span", "wf-sig-v", String(value)));
  return b;
}

function groupFlags(flags) {
  const seen = new Map();
  for (const f of flags) {
    const g = seen.get(f.id) || { label: f.label, tip: f.tip, hits: [] };
    g.hits.push(f.text.trim());
    seen.set(f.id, g);
  }
  return [...seen.values()];
}

function flagList(groups) {
  const ul = el("ul", "wf-flags");
  for (const g of groups) {
    const li = el("li");
    li.append(el("b", null, `${g.label} (${g.hits.length}): `));
    li.append(document.createTextNode(`"${g.hits.slice(0, 3).map((h) => (h.length > 60 ? h.slice(0, 57) + "..." : h)).join('", "')}". ${g.tip}`));
    ul.append(li);
  }
  return ul;
}

function factsSummary(c) {
  if (c.ok) return { ok: true, text: "Numbers, dates, quotes and names all carried over." };
  const bits = [];
  const m = c.missing, a = c.added;
  if (m.numbers.length) bits.push("missing numbers: " + m.numbers.join(", "));
  if (m.dates.length) bits.push("missing dates: " + m.dates.join(", "));
  if (m.quotes.length) bits.push("changed quotes: " + m.quotes.length);
  if (m.names.length) bits.push("missing names: " + m.names.join(", "));
  if (a.numbers.length) bits.push("new numbers: " + a.numbers.join(", "));
  if (a.dates.length) bits.push("new dates: " + a.dates.join(", "));
  if (a.names.length) bits.push("new names: " + a.names.join(", "));
  return { ok: false, text: "Please review: " + bits.join("; ") + "." };
}

function gauge(score, band) {
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("class", "wf-gauge"); svg.dataset.tone = BAND_TONE[band] || "neutral";
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `AI-sounding score ${score} out of 100`);
  const mk = (cls, extra) => { const c = document.createElementNS(svgNS, "circle"); c.setAttribute("cx", "32"); c.setAttribute("cy", "32"); c.setAttribute("r", "27"); c.setAttribute("class", cls); for (const [k, v] of Object.entries(extra || {})) c.setAttribute(k, v); return c; };
  const circ = 2 * Math.PI * 27;
  svg.append(mk("wf-gauge-bg"), mk("wf-gauge-fg", { "stroke-dasharray": `${(circ * score) / 100} ${circ}`, transform: "rotate(-90 32 32)" }));
  const t = document.createElementNS(svgNS, "text");
  t.setAttribute("x", "32"); t.setAttribute("y", "38"); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "wf-gauge-num");
  t.textContent = String(score);
  svg.append(t);
  return svg;
}

// ───────────────────────── build ─────────────────────────
function build() {
  const editor = $("view-editor"), sd = $("sheet-draft"), so = $("sheet-out");
  if (!editor || !sd || !so || $("wf-score-pane")) return null;

  // banner slot above the editor (cloud notice)
  const banner = el("div", "wf-banner"); banner.id = "wf-banner"; banner.hidden = true;
  editor.before(banner);

  // ── LEFT: status line, review view, footer buttons
  const status = el("div", "wf-status"); status.id = "wf-status"; status.setAttribute("aria-live", "polite");
  sd.querySelector(".sheet-head")?.after(status);

  const review = el("div", "wf-review textview"); review.id = "wf-review"; review.hidden = true; review.tabIndex = 0;
  review.setAttribute("aria-label", "Scanned text. Select any part to humanize it.");
  sd.querySelector(".sheet-body")?.append(review);

  const foot = sd.querySelector(".sheet-foot");
  const grow = foot?.querySelector(".grow");
  const selBtn = el("button", "tool wf-selbtn", "Humanize selection"); selBtn.type = "button"; selBtn.hidden = true;
  const editBtn = el("button", "tool", "Edit text"); editBtn.type = "button"; editBtn.hidden = true;
  const scanBtn = el("button", "tool solid wf-scanbtn", "Scan"); scanBtn.type = "button"; scanBtn.id = "wf-scan";
  scanBtn.title = "Check this text: AI-sounding score, flagged phrases, reading level";
  const humBtn = el("button", "tool wf-actbtn", "Humanize all"); humBtn.type = "button"; humBtn.id = "wf-humanize";
  humBtn.title = "Humanize the whole text (Ctrl or \u2318 + Enter)";
  scanBtn.classList.add("wf-actbtn");
  const actions = el("div", "wf-actions");
  actions.append(selBtn, editBtn, scanBtn, humBtn);
  if (grow) grow.after(actions); else foot?.append(actions);

  // selection popover (review view)
  const pop = el("div", "wf-selpop"); pop.id = "wf-selpop"; pop.hidden = true;
  const popBtn = el("button", "wf-selpop-btn", "Humanize selection"); popBtn.type = "button";
  const popNote = el("span", "wf-selpop-note");
  pop.append(popBtn, popNote);
  document.body.append(pop);

  // ── RIGHT: tabs in the card header
  const head = so.querySelector(".sheet-head");
  const tabs = el("div", "wf-tabs"); tabs.setAttribute("role", "tablist");
  const tScore = el("button", "wf-tab", "Score"); tScore.type = "button"; tScore.setAttribute("role", "tab");
  const tRewrite = el("button", "wf-tab", "Rewrite"); tRewrite.type = "button"; tRewrite.setAttribute("role", "tab");
  tabs.append(tScore, tRewrite);
  head?.prepend(tabs);

  // Score pane
  const pane = el("div", "wf-pane"); pane.id = "wf-score-pane";
  const paneBody = el("div", "wf-pane-body");
  pane.append(paneBody);
  head?.after(pane);

  // controls (reading level, writing style): built once so typing is never interrupted
  const controls = el("div", "wf-controls");
  const lvLabel = el("label", "wf-field"); lvLabel.append(el("span", null, "Target reading level"));
  const sel = el("select");
  for (const [k, v] of Object.entries(LEVELS)) { const o = el("option", null, v.label); o.value = k; sel.append(o); }
  sel.value = S.level; lvLabel.append(sel); controls.append(lvLabel);
  const det = el("details", "wf-profile");
  det.append(el("summary", null, S.profileText ? "My writing style (saved)" : "My writing style (optional)"));
  det.append(el("p", "wf-score-note", "Paste a few paragraphs you wrote yourself. Writeflow compares each rewrite to your habits and shows where it drifts. It stays in this browser."));
  const ta = el("textarea"); ta.rows = 5; ta.placeholder = "Paste something you wrote yourself (at least 40 words)..."; ta.value = S.profileText; ta.spellcheck = false;
  det.append(ta);
  const pmsg = el("p", "wf-score-note");
  const prow = el("div", "wf-row");
  const psave = el("button", "tool", "Save my style"); psave.type = "button";
  const pclear = el("button", "tool", "Clear"); pclear.type = "button";
  prow.append(psave, pclear); det.append(prow, pmsg); controls.append(det);

  // Rewrite tab: strip + selection result (above the app's own rewrite view)
  const strip = el("div", "wf-strip"); strip.id = "wf-strip";
  const selres = el("div", "wf-selres"); selres.id = "wf-selres"; selres.hidden = true;
  const outBody = $("out-body");
  outBody?.before(strip, selres);

  // extra button in the Rewrite footer
  const outFoot = so.querySelector(".sheet-foot");
  const useBtn = el("button", "tool", "Use as my text"); useBtn.type = "button"; useBtn.id = "wf-use";
  useBtn.title = "Put this rewrite in the text box, then scan it";
  outFoot?.prepend(useBtn);

  return { editor, sd, so, status, review, selBtn, editBtn, scanBtn, pop, popBtn, popNote, tScore, tRewrite, pane, paneBody, humBtn, controls, sel, ta, pmsg, psave, pclear, det, strip, selres, useBtn, banner };
}

// ───────────────────────── state changes ─────────────────────────
function setTab(name) {
  S.tab = name;
  ui.so.dataset.tab = name;
  ui.tScore.setAttribute("aria-selected", String(name === "score"));
  ui.tRewrite.setAttribute("aria-selected", String(name === "rewrite"));
  ui.tScore.classList.toggle("on", name === "score");
  ui.tRewrite.classList.toggle("on", name === "rewrite");
}

function setMode(mode) {
  if (mode === "review" && !S.scan) mode = "edit";
  S.mode = mode;
  ui.sd.classList.toggle("wf-reviewing", mode === "review");
  ui.review.hidden = mode !== "review";
  ui.editBtn.hidden = mode !== "review";
  hidePop();
  if (mode === "edit") updateEditSelection();
  else ui.selBtn.hidden = true;
}

// On phones the right card is below the text, so bring it into view after an action.
function revealRight() {
  if (innerWidth <= 980) setTimeout(() => ui.so.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
}

function pushUndo(text) { S.undo.push(text); if (S.undo.length > 20) S.undo.shift(); }

function setDraft(text) {
  const d = $("draft");
  d.value = text;
  d.dispatchEvent(new Event("input", { bubbles: true }));
  S.lastDraft = text;
}

function scan({ quiet = false } = {}) {
  const text = draftText();
  const a = analyze(text);
  if (a.band === "short") {
    S.scan = null; S.stale = false;
    S.note = words(text) ? "Add about 25 words to scan." : "";
    setMode("edit");
    renderAll();
    return false;
  }
  S.scan = { text, a, rk: rankSentences(text, a.flags), at: Date.now() };
  S.stale = false; S.note = "";
  if (!quiet) { setMode("review"); setTab("score"); revealRight(); }
  renderAll();
  return true;
}

function humanizeAll() {
  if ($("btn-go")?.classList.contains("running")) { $("btn-go").click(); return; } // Stop
  const text = draftText();
  if (!text.trim()) return;
  if (!S.scan || S.stale) scan({ quiet: true });
  setMode("edit");
  setTab("rewrite");
  revealRight();
  $("btn-go")?.click();
}

function useAsText() {
  const out = outText();
  if (!out) return;
  pushUndo(draftText());
  setDraft(out);
  S.note = "Rewrite is now your text.";
  scan();
}

function undo() {
  if (!S.undo.length) return;
  setDraft(S.undo.pop());
  S.note = "Undone.";
  if (S.scan) scan(); else renderAll();
}

// ───────────────────────── selection rewrite ─────────────────────────
function startSelectionRewrite(sel) {
  if (!sel || sel.text.trim().length < MIN_SEL) return;
  S.sel?.ctl?.abort();
  const ctl = new AbortController();
  S.sel = { ...sel, out: "", state: "running", ctl, error: "" };
  setTab("rewrite");
  hidePop();
  renderSel();
  revealRight();
  rewriteSelection(sel.text, { signal: ctl.signal, onText: (t) => { if (S.sel?.ctl === ctl) { S.sel.out = t; renderSel(); } } })
    .then((final) => { if (S.sel?.ctl === ctl) { S.sel.out = final; S.sel.state = "done"; renderSel(); } })
    .catch((e) => {
      if (S.sel?.ctl !== ctl) return;
      if (e?.name === "AbortError") { S.sel.state = "stopped"; }
      else { S.sel.state = "error"; S.sel.error = e?.message || "Something went wrong."; }
      renderSel();
    });
}

function applySelection() {
  const s = S.sel;
  if (!s || s.state !== "done" || !s.out) return;
  let text = draftText();
  let at = text.slice(s.start, s.end) === s.text ? s.start : text.indexOf(s.text);
  if (at < 0) { s.state = "error"; s.error = "Your text changed since you selected this. Select it again."; renderSel(); return; }
  pushUndo(text);
  text = text.slice(0, at) + s.out + text.slice(at + s.text.length);
  S.sel = null;
  setDraft(text);
  S.note = "Replaced the selection.";
  scan();
}

function renderSel() {
  const r = ui.selres, s = S.sel;
  r.replaceChildren();
  r.hidden = !s;
  if (!s) return;
  const head = el("div", "wf-selres-head");
  head.append(el("b", null, "Selection rewrite"));
  const close = el("button", "icon-btn"); close.type = "button"; close.setAttribute("aria-label", "Discard"); close.innerHTML = '<svg><use href="#i-close"/></svg>';
  close.addEventListener("click", () => { s.ctl?.abort(); S.sel = null; renderSel(); });
  head.append(close);
  r.append(head);
  r.append(el("p", "wf-selres-k", "Original"), el("p", "wf-selres-old", s.text));
  r.append(el("p", "wf-selres-k", s.state === "running" ? "Writing..." : "Humanized"));
  const out = el("p", "wf-selres-new", s.out || (s.state === "running" ? "…" : ""));
  r.append(out);
  if (s.state === "error") r.append(el("p", "wf-facts-bad wf-score-note", s.error));
  if (s.state === "stopped") r.append(el("p", "wf-score-note", "Stopped."));
  if (s.state === "done") {
    const f = factsSummary(compareFacts(s.text, s.out));
    r.append(el("p", "wf-score-note " + (f.ok ? "wf-facts-ok" : "wf-facts-bad"), (f.ok ? "Facts kept. " : "") + (f.ok ? "" : f.text)));
  }
  const row = el("div", "wf-selres-row");
  if (s.state === "running") {
    const stop = el("button", "btn", "Stop"); stop.type = "button"; stop.addEventListener("click", () => s.ctl.abort()); row.append(stop);
  } else {
    const again = el("button", "btn", "Try again"); again.type = "button"; again.addEventListener("click", () => startSelectionRewrite({ start: s.start, end: s.end, text: s.text }));
    row.append(again);
    if (s.state === "done") {
      const apply = el("button", "btn primary", "Replace in my text"); apply.type = "button"; apply.addEventListener("click", applySelection);
      row.append(apply);
    }
  }
  r.append(row);
}

// ───────────────────────── selection capture ─────────────────────────
function reviewSelection() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!ui.review.contains(r.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(ui.review);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  const raw = r.toString();
  const text = raw.trim();
  if (!text) return null;
  const lead = raw.length - raw.trimStart().length;
  return { start: start + lead, end: start + lead + text.length, text, rect: r.getBoundingClientRect() };
}

function hidePop() { if (ui) ui.pop.hidden = true; }

function showPop(sel) {
  if (!sel || sel.text.length < MIN_SEL) { hidePop(); return; }
  const inside = S.scan ? S.scan.a.flags.filter((f) => f.start < sel.end && f.end > sel.start) : [];
  ui.popNote.textContent = inside.length ? `${inside.length} AI-sounding phrase${inside.length > 1 ? "s" : ""} in this selection` : "";
  ui.pop.hidden = false;
  const w = ui.pop.offsetWidth, h = ui.pop.offsetHeight;
  const x = Math.min(Math.max(8, sel.rect.left + sel.rect.width / 2 - w / 2), innerWidth - w - 8);
  const y = sel.rect.top - h - 8 > 8 ? sel.rect.top - h - 8 : sel.rect.bottom + 8;
  ui.pop.style.left = Math.round(x) + "px";
  ui.pop.style.top = Math.round(y) + "px";
  ui.pop._sel = sel;
}

function updateEditSelection() {
  const d = $("draft");
  if (!d || S.mode !== "edit") { ui.selBtn.hidden = true; return; }
  const a = d.selectionStart, b = d.selectionEnd;
  const ok = a != null && b != null && d.value.slice(a, b).trim().length >= MIN_SEL;
  ui.selBtn.hidden = !ok;
}

function editSelection() {
  const d = $("draft");
  const a = d.selectionStart, b = d.selectionEnd;
  const raw = d.value.slice(a, b);
  const text = raw.trim();
  const lead = raw.length - raw.trimStart().length;
  return { start: a + lead, end: a + lead + text.length, text };
}

// ───────────────────────── render ─────────────────────────
function renderAll() {
  renderStatus();
  renderReview();
  renderPane();
  renderStrip();
  renderSel();
  renderActions();
}

// One primary action at a time: Scan until it is scanned, then Humanize all. While the model is writing, the
// same button becomes Stop (it drives the app's own Rewrite button, which is hidden).
function renderActions() {
  const go = $("btn-go");
  const running = !!go?.classList.contains("running");
  ui.scanBtn.textContent = S.scan ? "Re-scan" : "Scan";
  ui.scanBtn.classList.toggle("solid", !running && (!S.scan || S.stale));
  ui.scanBtn.disabled = running;
  ui.humBtn.textContent = running ? "Stop" : "Humanize all";
  ui.humBtn.classList.toggle("solid", running || (!!S.scan && !S.stale));
  ui.humBtn.disabled = go ? go.disabled : !draftText().trim();
}

function renderStatus() {
  const st = ui.status;
  st.replaceChildren();
  const text = draftText();
  const n = words(text);
  let msg;
  if (S.note) msg = S.note;
  else if (!n) msg = "Paste or import your text, then press Scan.";
  else if (!S.scan) msg = `${n} words. Press Scan to check it.`;
  else if (S.stale) msg = "Text changed since the scan. Press Re-scan.";
  else msg = `Scanned: AI-sounding ${S.scan.a.score} (${BAND_LABEL[S.scan.a.band]}). Select any part to humanize it.`;
  const span = el("span", "wf-status-text", msg);
  if (S.stale || (!S.scan && n >= 25)) span.dataset.tone = "warn";
  st.append(span);
  if (S.undo.length) {
    const u = el("button", "wf-link", "Undo"); u.type = "button"; u.addEventListener("click", undo);
    st.append(u);
  }
}

function renderReview() {
  const box = ui.review;
  box.replaceChildren();
  if (!S.scan) return;
  const { text, a, rk } = S.scan;
  let pos = 0;
  const addText = (to) => { if (to > pos) box.append(document.createTextNode(text.slice(pos, to))); pos = to; };
  for (const s of rk.flagged) {
    addText(s.start);
    const span = el("span", "wf-sent");
    span.dataset.w = String(Math.min(3, s.weight >= 6 ? 3 : s.weight >= 3 ? 2 : 1));
    span.dataset.start = String(s.start);
    pos = s.start;
    for (const f of s.flags) {
      if (f.start < pos || f.start >= s.end) continue;
      if (f.start > pos) span.append(document.createTextNode(text.slice(pos, f.start)));
      const m = el("mark", "wf-ai", text.slice(f.start, Math.min(f.end, s.end)));
      m.title = f.label + ": " + f.tip;
      span.append(m);
      pos = Math.min(f.end, s.end);
    }
    if (pos < s.end) span.append(document.createTextNode(text.slice(pos, s.end)));
    pos = s.end;
    box.append(span);
  }
  addText(text.length);
  box.classList.toggle("is-stale", S.stale);
  void a;
}

function renderPane() {
  const body = ui.paneBody;
  body.replaceChildren();
  const text = draftText();
  if (!S.scan) {
    const e = el("div", "wf-empty");
    e.append(el("h3", null, "Check your text"));
    e.append(el("p", "wf-score-note", S.note || (words(text) && words(text) < 25 ? "Add about 25 words to scan." : "Press Scan to see how AI-sounding it is, which phrases give it away, and its reading level. After you humanize it you also get a facts check.")));
    const ul = el("ul", "wf-empty-list");
    for (const t of ["AI-sounding score and the phrases behind it", "The most AI-sounding sentences, one click to humanize", "Reading level for your grade", "Facts check after a rewrite (numbers, dates, quotes, names)"]) ul.append(el("li", null, t));
    e.append(ul, el("p", "wf-score-note", "Scans run on this computer. Nothing is sent anywhere."));
    body.append(e, ui.controls);
    return;
  }
  const { a, rk, text: scanned } = S.scan;
  const profile = S.profileText ? fingerprint(S.profileText) : null;

  if (S.stale) {
    const b = el("div", "wf-stale");
    b.append(el("span", null, "The text changed since this scan."));
    const r = el("button", "wf-link", "Re-scan"); r.type = "button"; r.addEventListener("click", () => scan());
    b.append(r);
    body.append(b);
  }

  // summary
  const sum = el("div", "wf-summary");
  sum.append(gauge(a.score, a.band));
  const tx = el("div", "wf-summary-text");
  tx.append(el("p", "wf-verdict", BAND_TEXT[a.band]));
  tx.append(el("p", "wf-score-note", `${a.flags.length} flagged phrase${a.flags.length === 1 ? "" : "s"} in ${rk.flagged.length} sentence${rk.flagged.length === 1 ? "" : "s"} · ${words(scanned)} words`));
  sum.append(tx);
  body.append(sum);
  if (words(scanned) < 100) body.append(el("p", "wf-score-note wf-short", "Short text: scores are less reliable under about 100 words. Treat this as a rough guide."));

  const chips = el("div", "wf-chips");
  chips.append(chip("AI-sounding", `${a.score} · ${BAND_LABEL[a.band]}`, BAND_TONE[a.band]));
  chips.append(chip("Flagged", a.flags.length, a.flags.length ? "warn" : "ok"));
  const g = readingGrade(scanned);
  if (g != null) chips.append(chip("Grade", g, levelAdvice(g, S.level).includes("fits") ? "ok" : "warn"));
  if (profile) { const s = similarity(profile, scanned); if (s != null) chips.append(chip("Like you", s)); }
  body.append(chips);

  // most AI-sounding sentences
  const sec = el("section", "wf-sec");
  sec.append(el("h3", null, "Most AI-sounding sentences"));
  if (!rk.ranked.length) sec.append(el("p", "wf-score-note wf-facts-ok", "None found. This reads like a person wrote it."));
  for (const s of rk.ranked.slice(0, 6)) {
    const row = el("div", "wf-srow");
    const dots = el("span", "wf-dots"); dots.setAttribute("aria-hidden", "true");
    const lvl = s.weight >= 6 ? 3 : s.weight >= 3 ? 2 : 1;
    for (let i = 1; i <= 3; i++) dots.append(el("i", i <= lvl ? "on" : ""));
    const label = el("button", "wf-srow-text", s.text.length > 110 ? s.text.slice(0, 107) + "..." : s.text);
    label.type = "button"; label.title = s.flags.map((f) => f.label).filter((x, i, arr) => arr.indexOf(x) === i).join(", ");
    label.addEventListener("click", () => focusSentence(s));
    const h = el("button", "wf-srow-act", "Humanize"); h.type = "button";
    h.addEventListener("click", () => startSelectionRewrite({ start: s.start, end: s.end, text: s.text }));
    row.append(dots, label, h);
    sec.append(row);
  }
  body.append(sec);

  // flagged phrases
  if (a.flags.length) {
    const fs = el("section", "wf-sec");
    fs.append(el("h3", null, "Flagged phrases"));
    fs.append(flagList(groupFlags(a.flags)));
    body.append(fs);
  }

  // reading level
  const lv = el("section", "wf-sec");
  lv.append(el("h3", null, "Reading level"));
  lv.append(el("p", "wf-score-note", levelAdvice(g, S.level) || "Add a little more text to measure the reading level."));
  body.append(lv);

  // style compare
  if (profile) {
    const st = el("section", "wf-sec");
    st.append(el("h3", null, "Sounds like you"));
    const gaps = styleGaps(profile, scanned);
    if (gaps.length) {
      const ul = el("ul", "wf-flags");
      for (const x of gaps) ul.append(el("li", null, x));
      st.append(el("p", "wf-score-note", "Where this text differs from your style:"), ul);
    } else if (similarity(profile, scanned) != null) st.append(el("p", "wf-score-note", "This reads close to your own style."));
    body.append(st);
  }

  body.append(ui.controls);
  body.append(el("p", "wf-score-note", "A guide to writing habits, not a verdict. Formal or non-native writing can score high too. Edit the result in your own words before you use it."));
}

function focusSentence(s) {
  setMode("review");
  const span = ui.review.querySelector(`.wf-sent[data-start="${s.start}"]`);
  if (!span) return;
  span.scrollIntoView({ block: "center", behavior: "smooth" });
  span.classList.add("is-focus");
  setTimeout(() => span.classList.remove("is-focus"), 1600);
}

function renderStrip() {
  const strip = ui.strip;
  strip.replaceChildren();
  const out = outText();
  ui.useBtn.hidden = !out;
  if (!out) { strip.hidden = true; return; }
  strip.hidden = false;
  const text = draftText();
  const before = S.scan && !S.stale ? S.scan.a : analyze(text);
  const r = analyze(out);
  const profile = S.profileText ? fingerprint(S.profileText) : null;
  const row = el("div", "wf-chips");
  if (r.band !== "short") {
    const delta = before.band !== "short" ? r.score - before.score : null;
    const label = before.band !== "short" ? `${before.score} → ${r.score}` : String(r.score);
    row.append(chip("AI-sounding", `${label} · ${BAND_LABEL[r.band]}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`, BAND_TONE[r.band]));
  }
  const f = text ? factsSummary(compareFacts(text, out)) : null;
  if (f) {
    const fc = chip("Facts", f.ok ? "✓ kept" : "⚠ review", f.ok ? "ok" : "bad");
    fc.classList.add("wf-sig-btn"); fc.setAttribute("role", "button"); fc.tabIndex = 0;
    fc.addEventListener("click", () => { detail.hidden = !detail.hidden; });
    fc.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail.hidden = !detail.hidden; } });
    row.append(fc);
  }
  const g = readingGrade(out);
  if (g != null) row.append(chip("Grade", g, levelAdvice(g, S.level).includes("fits") ? "ok" : "warn"));
  if (profile) { const s = similarity(profile, out); if (s != null) row.append(chip("Like you", s)); }
  strip.append(row);
  const detail = el("p", "wf-score-note " + (f && f.ok ? "wf-facts-ok" : "wf-facts-bad"), f ? f.text : "");
  detail.hidden = !f || f.ok;
  strip.append(detail);
  if (r.flags.length) {
    const left = el("p", "wf-score-note", `Still AI-sounding in the rewrite: ${groupFlags(r.flags).map((x) => x.label).join(", ")}.`);
    strip.append(left);
  }
}

// ───────────────────────── wiring ─────────────────────────
function start() {
  ui = build();
  if (!ui) return;
  setTab("score");
  setMode("edit");

  ui.tScore.addEventListener("click", () => setTab("score"));
  ui.tRewrite.addEventListener("click", () => setTab("rewrite"));
  ui.scanBtn.addEventListener("click", () => scan());
  ui.humBtn.addEventListener("click", humanizeAll);
  if ($("btn-go")) new MutationObserver(renderActions).observe($("btn-go"), { attributes: true, attributeFilter: ["class", "disabled"] });
  ui.editBtn.addEventListener("click", () => { setMode("edit"); $("draft")?.focus(); });
  ui.useBtn.addEventListener("click", useAsText);
  ui.selBtn.addEventListener("click", () => startSelectionRewrite(editSelection()));
  ui.popBtn.addEventListener("click", () => { const s = ui.pop._sel; if (s) startSelectionRewrite(s); });

  // the app's own Rewrite button (round arrow) and keyboard shortcut also move us to the Rewrite tab
  $("btn-go")?.addEventListener("click", () => { if (!$("btn-go").classList.contains("running")) { setTab("rewrite"); setMode("edit"); } }, true);
  // paste / import / clear act on the text box, so make sure it is visible
  for (const id of ["btn-paste", "btn-upload", "btn-clear"]) $(id)?.addEventListener("click", () => setMode("edit"), true);

  // review view: select text or click a highlighted sentence
  ui.review.addEventListener("mouseup", () => {
    setTimeout(() => {
      const sel = reviewSelection();
      if (sel) { showPop(sel); return; }
      hidePop();
    }, 0);
  });
  ui.review.addEventListener("click", (e) => {
    const sent = e.target.closest?.(".wf-sent");
    if (!sent || !getSelection().isCollapsed) return;
    const r = document.createRange();
    r.selectNodeContents(sent);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const sel = reviewSelection();
    if (sel) showPop(sel);
  });
  ui.review.addEventListener("keyup", () => { const sel = reviewSelection(); if (sel) showPop(sel); else hidePop(); });
  document.addEventListener("mousedown", (e) => { if (!ui.pop.hidden && !ui.pop.contains(e.target) && !ui.review.contains(e.target)) hidePop(); });
  document.addEventListener("scroll", hidePop, true);

  // edit view: selection button in the footer
  const d = $("draft");
  for (const ev of ["select", "keyup", "mouseup", "focus", "input"]) d?.addEventListener(ev, updateEditSelection);
  d?.addEventListener("blur", () => { /* keep the button: clicking it blurs the box but the selection stays */ });

  // level + writing style controls
  ui.sel.addEventListener("change", () => { S.level = ui.sel.value; store.set("level", S.level); renderAll(); });
  ui.psave.addEventListener("click", () => {
    const v = ui.ta.value.trim();
    if (!fingerprint(v)) { ui.pmsg.textContent = "Add a bit more of your own writing (about 40 words, a few sentences)."; return; }
    S.profileText = v; store.set("profile", v);
    ui.pmsg.textContent = "Saved. Scores now compare to your style.";
    ui.det.querySelector("summary").textContent = "My writing style (saved)";
    renderAll();
  });
  ui.pclear.addEventListener("click", () => {
    S.profileText = ""; ui.ta.value = ""; store.del("profile");
    ui.pmsg.textContent = "Cleared.";
    ui.det.querySelector("summary").textContent = "My writing style (optional)";
    renderAll();
  });

  // watch the text box and the rewrite output
  S.lastDraft = draftText();
  setInterval(() => {
    const cur = draftText();
    if (cur === S.lastDraft) return;
    S.lastDraft = cur;
    if (S.scan && cur !== S.scan.text) S.stale = true;
    if (!cur.trim()) { S.scan = null; S.stale = false; S.note = ""; if (S.mode === "review") setMode("edit"); }
    else if (S.note && S.note.startsWith("Add about")) S.note = "";
    renderAll();
  }, 350);
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(renderStrip, 250); }).observe($("output") || document.body, { childList: true, subtree: true, characterData: true });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ui.pop.hidden) { hidePop(); } });
  renderAll();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
