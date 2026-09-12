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
fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
console.log(`\n→ ${f}`);
console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · "));
