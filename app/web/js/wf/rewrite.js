// Writeflow: rewrite just a selected piece of text (a sentence, a phrase, a paragraph) with the same model
// and the same settings the main Rewrite button uses. Works with the local model, a local server, or a cloud model.
// The whole-text rewrite stays with the main editor code; this is only for selections.
import { getJSON, streamCompletion, streamChat } from "../api.js";
import { buildPrompt, nPredictFor } from "../prompt.js";
import { pyStrip, estimateTokens, isMostlyCJK } from "../text.js";
import { isCloud, cloudMessages } from "./cloudcore.js";

let cfgCache = null;
export async function loadConfig() {
  if (!cfgCache) cfgCache = await getJSON("/app/config");
  return cfgCache;
}

/** Which engine is active: { cloud, external, model }. */
export async function engineInfo() {
  let ext = null;
  try { ext = await getJSON("/app/external"); } catch { /* local engine */ }
  const on = !!(ext && ext.enabled);
  return { external: on, cloud: on && isCloud(ext.url), model: on ? ext.model || "" : "" };
}

/**
 * Build the request for one piece of text.
 * Returns { kind: "completion" | "chat", body }.
 * Same rules as the main rewrite: the local model gets its exact trained prompt and sampling; a local server gets
 * the draft as the only message; a cloud model gets our instructions and no local-only sampling options.
 */
export function buildRequest({ cfg, engine, text }) {
  const nPred = nPredictFor(cfg, estimateTokens(text));
  if (!engine.external) {
    return {
      kind: "completion",
      body: { ...cfg.sampling, prompt: buildPrompt(cfg, text), n_predict: nPred, stream: true, cache_prompt: true },
    };
  }
  const model = engine.model ? { model: engine.model } : {};
  if (engine.cloud) {
    return { kind: "chat", body: { ...model, messages: cloudMessages(pyStrip(text)), stream: true } };
  }
  return {
    kind: "chat",
    body: { ...model, messages: [{ role: "user", content: pyStrip(text) }], ...cfg.sampling, max_tokens: nPred, stream: true },
  };
}

const hanCount = (s) => (s.match(/[㐀-鿿]/g) || []).length;

/**
 * Rewrite `text`. Calls onText(partial) as it streams. Resolves to the final text. Throws AbortError if stopped.
 * If an English draft comes back mostly Chinese (a known rare slip of the model) it tries again, up to 2 more times.
 */
export async function rewriteSelection(text, { signal, onText } = {}) {
  const cfg = await loadConfig();
  const engine = await engineInfo();
  const req = buildRequest({ cfg, engine, text });
  const english = !isMostlyCJK(text);
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let acc = "";
    const stream = req.kind === "chat" ? streamChat(req.body, signal) : streamCompletion(req.body, signal);
    for await (const ev of stream) {
      if (ev.content) { acc += ev.content; onText?.(acc); }
    }
    last = acc.trim();
    if (!(english && hanCount(last) > 15)) break;
  }
  if (!last) throw new Error("The model returned nothing. Try again.");
  return last;
}
