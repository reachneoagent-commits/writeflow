// Writeflow: pure helpers for cloud models (no DOM, no network), so they can be unit tested and
// imported by the editor without loading the dialog code.

export const PROVIDERS = [
  { id: "openai", label: "OpenAI", url: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Claude (Anthropic)", url: "https://api.anthropic.com/v1", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "nvidia", label: "NVIDIA", url: "https://integrate.api.nvidia.com/v1", keyUrl: "https://build.nvidia.com" },
  { id: "gemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { id: "other", label: "Other (OpenAI-compatible)", url: "", keyUrl: "" },
];

/** True when the address is a server on the internet rather than this computer or the local network. */
export function isCloud(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return false; }
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "[::1]") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

export function providerFor(url) {
  return PROVIDERS.find((p) => p.url && url && url.replace(/\/+$/, "") === p.url) || (isCloud(url) ? PROVIDERS.at(-1) : null);
}

export const CLOUD_SYSTEM_PROMPT = [
  "You rewrite drafts so they read like a person wrote them, not a language model.",
  "Reorganize as you see fit. Vary sentence length on purpose. Cut hedging, throat-clearing, and any sentence that only announces what comes next. Prefer the concrete word over the abstract one. It is fine to sound uneven.",
  "Every fact, number, unit, date, name and quotation must survive unchanged. Add nothing new.",
  "If the draft contains placeholders like [[HZ_LOCK_0]], keep each one exactly as written, once each.",
  "Write in the same language as the draft.",
  "Reply with the rewritten text only: no preface, no notes, no quotation marks around it.",
].join("\n\n");

/** Chat messages for a general-purpose cloud model. */
export const cloudMessages = (draft) => [
  { role: "system", content: CLOUD_SYSTEM_PROMPT },
  { role: "user", content: draft },
];

