// 전수 조사에서 "미확인(quota)" 으로 남은 모델을 하나씩 단독으로 다시 묻는다.
// 🔴 429 는 404 를 가린다. 쿼터가 식은 뒤 한 번에 하나씩 물어야 진짜 코드가 나온다.
//    그래서 이 스크립트는 느리다. 느린 게 목적이다.
import fs from "node:fs";
import path from "node:path";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const GAP_MS = Number(process.env.VERIFY_GAP_MS || 90000);   // 기본 90초
const MAX = Number(process.env.VERIFY_MAX || 6);             // 한 번에 몇 개까지

const files = fs.readdirSync("data").filter(f => /^all-.*\.json$/.test(f)).sort();
if (!files.length) { console.error("data/all-*.json 없음"); process.exit(1); }
const f = path.join("data", files.at(-1));
const d = JSON.parse(fs.readFileSync(f, "utf-8"));

const pending = d.rows.filter(r => r.verdict === "quota" && !r.verified_at);
if (!pending.length) { console.log("미확인 모델 없음 — 할 일 없다"); process.exit(0); }
console.log(`미확인 ${pending.length}개 중 최대 ${MAX}개를 ${GAP_MS / 1000}초 간격으로 확인한다`);

let changed = 0;
for (const r of pending.slice(0, MAX)) {
  const t0 = performance.now();
  let http = 0, msg = "";
  try {
    const res = await fetch(`${BASE}/models/${r.model}:generateContent?key=${KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly one word: OK" }] }],
                             generationConfig: { temperature: 0, maxOutputTokens: 2048 } }),
    });
    http = res.status;
    const j = await res.json().catch(() => ({}));
    msg = (j.error?.message || "").slice(0, 100);
  } catch (e) { msg = String(e.message).slice(0, 80); }
  const ms = Math.round(performance.now() - t0);

  if (http === 404) { r.verdict = "gone"; r.confirmed_solo_404 = true; }
  else if (http === 200) { r.verdict = "answers"; r.ms = ms; r.http = 200; }
  else if (http === 400) { r.verdict = "wrong-shape"; }
  // 여전히 429 면 판정을 바꾸지 않는다 — 모르는 것을 아는 척하지 않는다
  if (http !== 429) { r.verified_at = new Date().toISOString(); r.verified_http = http; changed++; }
  console.log(`  ${r.model.padEnd(42)} ${http} → ${r.verdict}${http === 429 ? " (여전히 한도, 판정 보류)" : ""}`);
  if (pending.indexOf(r) < Math.min(MAX, pending.length) - 1) await new Promise(s => setTimeout(s, GAP_MS));
}

d.tally = {};
for (const r of d.rows) d.tally[r.verdict] = (d.tally[r.verdict] || 0) + 1;
d.verified_last = new Date().toISOString();
fs.writeFileSync(f, JSON.stringify(d, null, 1) + "\n");
console.log(`\n판정 갱신 ${changed}건 · ${JSON.stringify(d.tally)}`);
console.log(`남은 미확인: ${d.rows.filter(r => r.verdict === "quota" && !r.verified_at).length}개`);
