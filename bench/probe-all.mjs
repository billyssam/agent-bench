// 목록에 있는 모델 전부를 실제로 불러 본다.
// 🔴 404 와 400 을 반드시 가른다: 404 는 "그런 모델이 없다", 400 은 "모델은 있는데 이 요청 형식이 아니다"(이미지·TTS 모델).
//    둘을 뭉개면 "절반이 죽었다" 같은 거짓말이 나온다.
import fs from "node:fs";
import path from "node:path";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }
const BASE = "https://generativelanguage.googleapis.com/v1beta";

const list = await (await fetch(`${BASE}/models?key=${KEY}&pageSize=200`)).json();
const models = (list.models || [])
  .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
  .map(m => m.name.replace("models/", ""));
console.log(`목록에서 generateContent 지원: ${models.length}개\n`);

const rows = [];
for (const m of models) {
  const t0 = performance.now();
  let r, j = {};
  try {
    r = await fetch(`${BASE}/models/${m}:generateContent?key=${KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly one word: OK" }] }],
                             generationConfig: { temperature: 0, maxOutputTokens: 2048 } }),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    rows.push({ model: m, http: 0, verdict: "network", ms: Math.round(performance.now() - t0) });
    continue;
  }
  let ms = Math.round(performance.now() - t0);
  let http = r.status;
  // 🔴 429 는 404 를 가린다. 쿼터가 소진된 상태에서 없는 모델을 부르면 서버는
  //    모델 존재를 확인하기 전에 429 를 돌려준다. 그대로 적으면 "한도" 로 기록되고
  //    "나중에 다시 하면 되겠지" 라는 거짓 결론이 남는다. 식혀서 한 번 더 묻는다.
  let recheck = 0;
  while (http === 429 && recheck < 2) {
    recheck++;
    await new Promise(s => setTimeout(s, 6000));
    const t1 = performance.now();
    try {
      r = await fetch(`${BASE}/models/${m}:generateContent?key=${KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly one word: OK" }] }],
                               generationConfig: { temperature: 0, maxOutputTokens: 2048 } }),
      });
      j = await r.json().catch(() => ({}));
      http = r.status; ms = Math.round(performance.now() - t1);
    } catch { break; }
  }
  const err = j.error || {};
  // 판정은 네 갈래뿐이다. 애매한 것을 한쪽으로 밀지 않는다.
  const verdict = http === 200 ? "answers"
    : http === 404 ? "gone"
    : http === 429 ? "quota"
    : http === 400 ? "wrong-shape"
    : "other";
  const text = http === 200
    ? ((j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim().slice(0, 40))
    : "";
  rows.push({ model: m, http, verdict, ms, text, rechecked: recheck,
              reason: err.status || "", msg: (err.message || "").slice(0, 120) });
  console.log(`${m.padEnd(42)} ${String(http).padEnd(4)} ${verdict.padEnd(12)} ${String(ms).padStart(6)}ms${recheck ? `  (재확인 ${recheck}회)` : ""}`);
  await new Promise(s => setTimeout(s, 700));
}
const tally = rows.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
const out = { measured_at: new Date().toISOString(), listed: models.length, tally, rows };
const f = path.join("data", `all-${new Date().toISOString().slice(0, 10)}.json`);
// 🔴 전수 조사가 중간에 끊기면 부분 결과가 어제 잰 것을 덮는다. 측정은 되돌릴 수 없다.
//    (run-tasks 에는 있던 가드가 여기엔 없었다 — 게이트는 쓰는 자리 전부에 걸어야 한다.)
if (fs.existsSync(f)) {
  try {
    const prev = JSON.parse(fs.readFileSync(f, "utf-8"));
    const prevN = (prev.rows || []).length;
    const prevOk = (prev.rows || []).filter(r => r.verdict === "answers").length;
    const nowOk = rows.filter(r => r.verdict === "answers").length;
    if (rows.length < prevN || nowOk < prevOk) {
      console.error(`\n덮지 않는다: 이번 ${rows.length}행(응답 ${nowOk}) < 기존 ${prevN}행(응답 ${prevOk}).`);
      console.error(`중간에 끊겼거나 쿼터가 마른 것으로 보인다. 기존 파일을 그대로 둔다.`);
      process.exit(1);
    }
  } catch { /* 기존 파일이 깨졌으면 새로 쓴다 */ }
}
fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
console.log(`\n→ ${f}`);
console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · "));
