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

// --fill : 지난번에 못 물어본 칸만 다시 묻는다.
// 무료 쿼터로 매번 전체를 돌면 매번 뒷부분이 잘려, 같은 칸만 재고 나머지는 영영 비어 있다.
const FILL = process.argv.includes("--fill");
const models = process.argv.slice(2).filter(a => !a.startsWith("--"));

const OUTF = path.join("data", `tasks-${new Date().toISOString().slice(0, 10)}.json`);
let prior = [];
if (FILL && fs.existsSync(OUTF)) {
  try { prior = JSON.parse(fs.readFileSync(OUTF, "utf-8")).results || []; } catch {}
}
const askedAlready = new Set(prior.filter(r => r.called).map(r => `${r.model}|${r.task}`));
if (FILL) console.log(`채우기 모드 — 이미 답을 받은 ${askedAlready.size}칸은 건너뛴다`);

const results = [];
for (const m of models) {
  for (const t of TASKS) {
    if (FILL && askedAlready.has(`${m}|${t.id}`)) {
      results.push(prior.find(r => r.model === m && r.task === t.id));
      continue;
    }
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
// 🔴 이번에 부르지 않은 모델의 기존 결과를 먼저 되돌려 놓는다.
//    가드보다 뒤에 두면 보존되기도 전에 "줄었다" 로 판정돼 채우기가 영영 안 된다(실제로 밟음).
if (FILL) {
  for (const r of prior) {
    if (!models.includes(r.model)) results.push(r);
  }
}

// 🔴 쿼터가 마른 날 돌리면 전부 429 가 되고, 그대로 쓰면 **어제 잰 것이 지워진다.**
//    측정에 성공한 건수가 기존보다 적으면 덮지 않는다. 측정은 되돌릴 수 없다.
const prevFile = path.join("data", `tasks-${new Date().toISOString().slice(0, 10)}.json`);
if (fs.existsSync(prevFile)) {
  try {
    const prev = JSON.parse(fs.readFileSync(prevFile, "utf-8"));
    const prevOk = (prev.results || []).filter(r => r.called).length;
    const nowOk = results.filter(r => r.called).length;
    if (nowOk < prevOk) {
      console.error(`\n덮지 않는다: 이번에 측정된 건 ${nowOk}건, 기존은 ${prevOk}건. 쿼터가 마른 것으로 보인다.`);
      process.exit(1);
    }
  } catch { /* 기존 파일이 깨졌으면 새로 쓴다 */ }
}

const out = { measured_at: new Date().toISOString(), timeout_ms: TIMEOUT_MS,
              tasks: TASKS.map(t => ({ id: t.id, title: t.title, why: t.why, prompt_chars: t.prompt.length })),
              results };
fs.writeFileSync(OUTF, JSON.stringify(out, null, 1) + "\n");
const passed = results.filter(r => r.pass).length;
const asked = results.filter(r => r.called).length;
console.log(`\n→ ${OUTF} · 물어봄 ${asked}/${results.length} · 통과 ${passed}`);
