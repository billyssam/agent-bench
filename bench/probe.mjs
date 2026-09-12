// 모델이 "목록에 있다" 와 "실제로 답한다" 는 다르다. 그걸 가르는 것이 이 스크립트의 전부다.
// 결과는 data/probe-<날짜>.json 에 쌓고, 페이지는 그 파일만 읽는다.
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }

const PROMPT = "Reply with exactly one word: OK";
const TIMEOUT_MS = 30000;

async function probe(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const body = { contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0, maxOutputTokens: 2048 } };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                 body: JSON.stringify(body), signal: ac.signal });
    const ms = Math.round(performance.now() - t0);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = j.error || {};
      return { model, ok: false, http: r.status, ms, reason: e.status || "", msg: (e.message || "").slice(0, 140) };
    }
    const c = j.candidates?.[0];
    const text = (c?.content?.parts || []).map(p => p.text || "").join("").trim();
    const u = j.usageMetadata || {};
    return { model, ok: true, http: 200, ms, text: text.slice(0, 60),
             finish: c?.finishReason || "", in_tok: u.promptTokenCount ?? null,
             out_tok: u.candidatesTokenCount ?? null, think_tok: u.thoughtsTokenCount ?? null };
  } catch (e) {
    return { model, ok: false, http: 0, ms: Math.round(performance.now() - t0),
             reason: e.name === "AbortError" ? "TIMEOUT" : "FETCH", msg: String(e.message).slice(0, 140) };
  } finally { clearTimeout(timer); }
}

const models = process.argv.slice(2);
const rows = [];
for (const m of models) {                    // 순차 — 동시에 때리면 429 가 섞여 측정이 거짓말을 한다
  const r = await probe(m);
  rows.push(r);
  const tag = r.ok ? `OK   ${String(r.ms).padStart(6)}ms  out=${r.out_tok ?? "-"} think=${r.think_tok ?? "-"}`
                   : `FAIL ${String(r.ms).padStart(6)}ms  ${r.http} ${r.reason}`;
  console.log(`${m.padEnd(38)} ${tag}`);
  await new Promise(s => setTimeout(s, 900));
}
const out = { measured_at: new Date().toISOString(), prompt: PROMPT, timeout_ms: TIMEOUT_MS, rows };
const f = path.join("data", `probe-${new Date().toISOString().slice(0,10)}.json`);
fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
console.log(`\n→ ${f} · 성공 ${rows.filter(r=>r.ok).length}/${rows.length}`);
