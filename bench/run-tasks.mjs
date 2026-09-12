// 모델 × 작업 을 순차로 돌린다. 결과는 data/tasks-<날짜>.json.
// 🔴 판정이 틀릴 수 있으므로 실패한 응답의 앞부분을 같이 남긴다 — 나중에 사람이 되읽어 확인한다.
import fs from "node:fs";
import path from "node:path";
import { TASKS } from "./tasks.mjs";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }
const TIMEOUT_MS = 60000;

// 🔴 5xx 와 429 는 "모델이 못했다" 가 아니라 "지금 못 물었다" 이다.
//    그걸 실패로 적으면 벤치마크가 거짓말을 한다. 물러섰다가 다시 묻는다.
async function callRetry(model, prompt, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await call(model, prompt);
    if (last.ok) return { ...last, attempts: i + 1 };
    if (!(last.http >= 500 || last.http === 429 || last.http === 0)) return { ...last, attempts: i + 1 };
    await new Promise(s => setTimeout(s, 2500 * (i + 1)));
  }
  return { ...last, attempts: tries };
}

async function call(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const body = { contents: [{ parts: [{ text: prompt }] }],
                 generationConfig: { temperature: 0, maxOutputTokens: 4096 } };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                 body: JSON.stringify(body), signal: ac.signal });
    const ms = Math.round(performance.now() - t0);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, ms, http: r.status, reason: (j.error?.status) || "ERR" };
    const c = j.candidates?.[0];
    const text = (c?.content?.parts || []).map(p => p.text || "").join("");
    const u = j.usageMetadata || {};
    return { ok: true, ms, http: 200, text, finish: c?.finishReason || "",
             in_tok: u.promptTokenCount ?? null, out_tok: u.candidatesTokenCount ?? null,
             think_tok: u.thoughtsTokenCount ?? null };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), http: 0,
             reason: e.name === "AbortError" ? "TIMEOUT" : "FETCH" };
  } finally { clearTimeout(timer); }
}

const models = process.argv.slice(2);
const results = [];
for (const m of models) {
  for (const t of TASKS) {
    const r = await callRetry(m, t.prompt);
    let pass = false, note = "";
    if (r.ok) { const v = t.check(r.text); pass = v.pass; note = v.note; }
    else { note = `${r.http} ${r.reason}`; }
    results.push({ model: m, task: t.id, called: r.ok, pass, note, ms: r.ms, attempts: r.attempts || 1,
                   in_tok: r.in_tok ?? null, out_tok: r.out_tok ?? null, think_tok: r.think_tok ?? null,
                   finish: r.finish || null,
                   // 판정이 거짓말하지 않는지 사람이 되읽을 수 있게 — 실패한 것만 남긴다
                   sample: (r.ok && !pass) ? String(r.text).slice(0, 160) : null });
    console.log(`${m.padEnd(26)} ${t.id.padEnd(14)} ${r.ok ? (pass ? "PASS" : "FAIL") : "ERR "} ${String(r.ms).padStart(6)}ms  ${note}`);
    await new Promise(s => setTimeout(s, 1100));
  }
}
const out = { measured_at: new Date().toISOString(), timeout_ms: TIMEOUT_MS,
              tasks: TASKS.map(t => ({ id: t.id, title: t.title, why: t.why, prompt_chars: t.prompt.length })),
              results };
const f = path.join("data", `tasks-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
const passed = results.filter(r => r.pass).length;
console.log(`\n→ ${f} · ${passed}/${results.length} 통과`);
