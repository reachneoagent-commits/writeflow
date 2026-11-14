import test from "node:test";
import assert from "node:assert/strict";
import { analyze, findFlags } from "../js/wf/score.js";
import { compareFacts, extractFacts } from "../js/wf/factcheck.js";

const AI = `In today's fast-paced world, it is important to note that renewable energy plays a crucial role in shaping our future. Moreover, this multifaceted landscape serves as a testament to human innovation, highlighting the pivotal need to leverage cutting-edge solutions. Furthermore, it is worth noting that experts agree the future looks bright, and only time will tell.`;

const HUMAN = `I spent Saturday fixing the bike. The chain had rusted through, so I swapped it for a $14 one from the shop on Elm Street. It took two hours, mostly because I lost a bolt. Found it under the fridge, of all places. Rides fine now, though the left pedal clicks.`;

test("AI-flavoured text scores higher than plain human text", () => {
  const a = analyze(AI);
  const h = analyze(HUMAN);
  assert.ok(a.score > h.score + 25, `ai ${a.score} vs human ${h.score}`);
  assert.equal(a.band, "high");
  assert.ok(h.score < 30);
});

test("flags have offsets that point at the matched text", () => {
  for (const f of findFlags(AI)) assert.equal(AI.slice(f.start, f.end), f.text);
  assert.ok(findFlags(AI).length >= 6);
});

test("short text is not scored", () => {
  assert.equal(analyze("Too short.").band, "short");
});

test("facts: identical text passes", () => {
  assert.equal(compareFacts(HUMAN, HUMAN).ok, true);
});

test("facts: dropped and invented numbers are caught", () => {
  const r = compareFacts("The fee was $14 and it took 2 hours.", "The fee was cheap and it took 3 hours.");
  assert.deepEqual(r.missing.numbers.sort(), ["14", "2"]);
  assert.deepEqual(r.added.numbers, ["3"]);
  assert.equal(r.ok, false);
});

test("facts: dates, quotes and names", () => {
  const o = 'Dr. Patel said on March 3, 2024 that "the results were never replicated" in Lagos.';
  assert.equal(compareFacts(o, o).ok, true);
  const bad = 'The doctor said earlier this year that the results were replicated in Accra.';
  const r = compareFacts(o, bad);
  assert.ok(r.missing.dates.length === 1);
  assert.ok(r.missing.quotes.length === 1);
  assert.ok(r.missing.names.includes("Lagos"));
  assert.ok(r.added.names.includes("Accra"));
  assert.ok(extractFacts(o).quotes.length === 1);
});

import { readingGrade, levelAdvice, fingerprint, similarity, styleGaps } from "../js/wf/style.js";

const KID = `I don't really like mornings. My alarm goes off at six and I just lie there. Mom yells up the stairs, so I get up. Breakfast is toast, mostly. I'm usually late for the bus, which is annoying, but the driver knows me now. Today I forgot my lunch again, and I had to borrow a sandwich from Jake.`;
const FORMAL = `The comprehensive implementation of renewable infrastructure necessitates substantial coordination between governmental institutions, private enterprises, and community organizations, thereby establishing sustainable methodologies for long-term environmental stewardship across multiple jurisdictions and demographic populations.`;

test("reading grade: simple text is lower than formal text", () => {
  const a = readingGrade(KID), b = readingGrade(FORMAL + " " + FORMAL);
  assert.ok(a < 8, `kid ${a}`);
  assert.ok(b > 14, `formal ${b}`);
  assert.equal(readingGrade("too short"), null);
});

test("level advice names the problem", () => {
  assert.match(levelAdvice(15, "middle"), /above/);
  assert.match(levelAdvice(4, "high"), /below/);
  assert.match(levelAdvice(10, "high"), /fits/);
});

test("style profile: own writing matches itself better than formal text", () => {
  const p = fingerprint(KID);
  assert.ok(p);
  const self = similarity(p, KID), other = similarity(p, FORMAL + " " + FORMAL + " " + FORMAL);
  assert.ok(self > 90, `self ${self}`);
  assert.ok(other < self - 25, `other ${other} self ${self}`);
  assert.ok(styleGaps(p, FORMAL + " " + FORMAL + " " + FORMAL).length > 0);
  assert.equal(similarity(null, KID), null);
});

test("facts: 'six' and '6' count as the same number", () => {
  assert.equal(compareFacts("We have six laptops and three rooms.", "We have 6 laptops and 3 rooms.").ok, true);
  assert.equal(compareFacts("We have six laptops.", "We have seven laptops.").ok, false);
});

import { isCloud, providerFor, cloudMessages, CLOUD_SYSTEM_PROMPT, PROVIDERS } from "../js/wf/cloudcore.js";

test("cloud: internet addresses are cloud, local ones are not", () => {
  for (const u of ["https://api.openai.com/v1", "https://integrate.api.nvidia.com/v1", "https://api.anthropic.com/v1"]) assert.equal(isCloud(u), true, u);
  for (const u of ["http://localhost:1234/v1", "http://127.0.0.1:8080/v1", "http://192.168.1.20:11434/v1", "http://10.0.0.5/v1", "http://172.20.1.1/v1", "http://mybox.local:1234/v1", "not a url", ""]) assert.equal(isCloud(u), false, u);
  assert.equal(isCloud("http://172.32.0.1/v1"), true); // outside the 172.16-31 private range
});

test("cloud: providers are matched by address, unknown internet hosts become 'other'", () => {
  assert.equal(providerFor("https://api.openai.com/v1/").id, "openai");
  assert.equal(providerFor("https://integrate.api.nvidia.com/v1").id, "nvidia");
  assert.equal(providerFor("https://my-gateway.example.com/v1").id, "other");
  assert.equal(providerFor("http://localhost:1234/v1"), null);
  assert.ok(PROVIDERS.every((p) => p.id === "other" || p.url.startsWith("https://")));
});

test("cloud: messages carry instructions, the draft, and the fact-lock rule", () => {
  const m = cloudMessages("Hello [[HZ_LOCK_0]] world.");
  assert.equal(m[0].role, "system");
  assert.equal(m[1].role, "user");
  assert.equal(m[1].content, "Hello [[HZ_LOCK_0]] world.");
  assert.match(CLOUD_SYSTEM_PROMPT, /HZ_LOCK/);
  assert.match(CLOUD_SYSTEM_PROMPT, /rewritten text only/);
});

test("facts: 'March 14th, 2024' equals 'March 14, 2024'", () => {
  assert.equal(compareFacts("It happened on March 14, 2024 in Austin.", "It happened on March 14th, 2024 in Austin.").ok, true);
  assert.equal(compareFacts("It happened on March 14, 2024 in Austin.", "It happened on March 15, 2024 in Austin.").ok, false);
});

import { splitSentences, rankSentences, sentenceAt } from "../js/wf/sentences.js";
import { buildRequest } from "../js/wf/rewrite.js";

test("sentences: offsets point at the exact sentence text", () => {
  const t = "First one here.  Second one, with a comma! Third?\n\nFourth after a gap.";
  const s = splitSentences(t);
  assert.equal(s.length, 4);
  for (const x of s) assert.equal(t.slice(x.start, x.end), x.text);
  assert.equal(s[1].text, "Second one, with a comma!");
  assert.equal(sentenceAt(s, t.indexOf("Third")).text, "Third?");
});

test("sentences: ranking puts the most AI-sounding sentence first", () => {
  const t = "I fixed the bike on Saturday. Moreover, it is important to note that renewable energy plays a crucial role in our future. Furthermore, it is worth noting this.";
  const r = rankSentences(t, findFlags(t));
  assert.equal(r.all.length, 3);
  assert.equal(r.flagged.length, 2);
  assert.match(r.ranked[0].text, /^Moreover/);
  assert.ok(r.ranked[0].weight >= r.ranked[1].weight);
});

const CFG = { instr: "INSTR", sep: "\n\n### Rewritten:\n\n", sampling: { temperature: 1, top_p: 0.95, top_k: 0 }, n_predict: { factor: 2.5, min: 256, max: 2048 } };

test("rewrite request: local model uses the exact trained prompt", () => {
  const r = buildRequest({ cfg: CFG, engine: { external: false }, text: "  Hello there.  " });
  assert.equal(r.kind, "completion");
  assert.equal(r.body.prompt, "INSTR\n\nHello there.\n\n### Rewritten:\n\n");
  assert.equal(r.body.top_k, 0);
  assert.equal(r.body.stream, true);
});

test("rewrite request: cloud model gets instructions and no local-only sampling", () => {
  const r = buildRequest({ cfg: CFG, engine: { external: true, cloud: true, model: "gpt-x" }, text: "Hello there." });
  assert.equal(r.kind, "chat");
  assert.equal(r.body.model, "gpt-x");
  assert.equal(r.body.messages[0].role, "system");
  assert.equal(r.body.messages[1].content, "Hello there.");
  assert.equal("top_k" in r.body, false);
  assert.equal("max_tokens" in r.body, false);
});

test("rewrite request: a local server gets the draft only, with sampling", () => {
  const r = buildRequest({ cfg: CFG, engine: { external: true, cloud: false, model: "" }, text: "Hello there." });
  assert.equal(r.kind, "chat");
  assert.equal(r.body.messages.length, 1);
  assert.equal(r.body.top_k, 0);
  assert.ok(r.body.max_tokens >= 256);
});

test("sentences: abbreviations like Dr. and initials do not split a sentence", () => {
  const t = "Moreover, Dr. Maria Santos from Texas said so. Then J. R. Smith agreed, e.g. in March. Done.";
  const s = splitSentences(t).map((x) => x.text);
  assert.deepEqual(s, ["Moreover, Dr. Maria Santos from Texas said so.", "Then J. R. Smith agreed, e.g. in March.", "Done."]);
});

test("facts: names compare ignoring case; months and titles are not treated as names", () => {
  const o = "Dr. Maria Santos from Texas said it in March.";
  const same = compareFacts(o, "dr maria santos from texas said it in march.");
  assert.deepEqual(same.missing.names, []);
  assert.equal(compareFacts(o, "Dr. Maria Santos from Ohio said it in March.").ok, false);
});
