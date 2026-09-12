// 실제 작업을 시켜 보고 끝냈는지 본다. 판정은 전부 기계가 한다 — 내 의견이 끼면 그 순간 벤치마크가 아니다.
// 각 작업은 "정답이 하나로 정해지는 것" 만 쓴다. 애매하면 넣지 않는다.

const filler = (() => {
  const s = [];
  for (let i = 0; i < 220; i++) {
    s.push(`Section ${i}. Routine maintenance notes for unit ${100 + i}: pressure nominal, valve seated, log archived.`);
  }
  return s;
})();
const needleDoc = [...filler.slice(0, 110), "Section 110. The access code is MAPLE-7731.", ...filler.slice(110)].join("\n");

// 코드펜스로 감싸 보내는 모델이 많다. 그건 형식 위반이 아니라 관례라서 벗겨 주고 내용을 본다.
const strip = t => t.replace(/^\s*```(?:json|javascript|js)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
const words = t => t.trim().split(/\s+/).filter(Boolean).length;

export const TASKS = [
  {
    id: "json-schema",
    title: "Return valid JSON that matches a schema",
    why: "Anything that calls a model from code needs parseable output. Prose wrapped around it breaks the caller.",
    prompt: 'Return only JSON with exactly these keys: {"city": string, "population": number, "country": string}. The city is Seoul. No markdown, no explanation.',
    check(text) {
      let o;
      try { o = JSON.parse(strip(text)); } catch { return { pass: false, note: "not parseable" }; }
      if (typeof o !== "object" || o === null) return { pass: false, note: "not an object" };
      const miss = ["city", "population", "country"].filter(k => !(k in o));
      if (miss.length) return { pass: false, note: `missing ${miss.join(",")}` };
      if (typeof o.population !== "number") return { pass: false, note: "population not a number" };
      return { pass: true, note: `population=${o.population}` };
    },
  },
  {
    id: "exact-length",
    title: "Answer in exactly seven words",
    why: "A hard format constraint the model must count against, not approximate.",
    prompt: "Answer in exactly 7 words, no more and no fewer. Question: what is photosynthesis?",
    check(text) {
      const w = words(strip(text));
      return { pass: w === 7, note: `${w} words` };
    },
  },
  {
    id: "needle",
    title: "Find one fact buried in a long document",
    why: "Retrieval over a long context. The answer is present exactly once and is unguessable.",
    prompt: `Read the document and answer with the access code only.\n\n${needleDoc}\n\nWhat is the access code?`,
    check(text) {
      return { pass: /MAPLE-7731/.test(text), note: /MAPLE-7731/.test(text) ? "found" : "missed" };
    },
  },
  {
    id: "no-preamble",
    title: "Output the number and nothing else",
    why: "Models like to explain. Here any extra character is a failure a parser would hit.",
    prompt: "Output only the number, with no words, no punctuation, no explanation. What is 17 * 23?",
    check(text) {
      const t = strip(text);
      return { pass: t === "391", note: t === "391" ? "clean" : `got "${t.slice(0, 28)}"` };
    },
  },
  {
    id: "letter-ban",
    title: "Write a sentence without the letter E",
    why: "A constraint the model must hold across every token it writes. The most common letter in English.",
    prompt: "Describe the ocean in one sentence. Do not use the letter 'e' anywhere in your answer. Output only the sentence.",
    check(text) {
      const t = strip(text);
      if (words(t) < 5) return { pass: false, note: `too short (${words(t)} words)` };
      const bad = (t.match(/e/gi) || []).length;
      return { pass: bad === 0, note: bad === 0 ? `${words(t)} words, clean` : `${bad} × "e"` };
    },
  },
  {
    id: "multi-constraint",
    title: "Hold three format rules at once",
    why: "Each rule is easy alone. Together they need the model to check its own output before finishing.",
    prompt: "Write exactly 3 lines about rain. Each line must be exactly 4 words. Each line must start with a capital letter. Output only the 3 lines.",
    check(text) {
      const lines = strip(text).split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length !== 3) return { pass: false, note: `${lines.length} lines` };
      const wrong = lines.map((l, i) => words(l) !== 4 ? `L${i + 1}=${words(l)}w` : null).filter(Boolean);
      if (wrong.length) return { pass: false, note: wrong.join(" ") };
      const lower = lines.filter(l => !/^[A-Z]/.test(l));
      if (lower.length) return { pass: false, note: `${lower.length} line(s) not capitalised` };
      return { pass: true, note: "3×4, capitalised" };
    },
  },
  {
    id: "array-count",
    title: "Return an array of exactly five items",
    why: "Counting its own output while producing structured data — the two failure modes combined.",
    prompt: 'Return only a JSON array containing exactly 5 strings, each the name of a colour. No markdown, no explanation.',
    check(text) {
      let a;
      try { a = JSON.parse(strip(text)); } catch { return { pass: false, note: "not parseable" }; }
      if (!Array.isArray(a)) return { pass: false, note: "not an array" };
      if (a.length !== 5) return { pass: false, note: `${a.length} items` };
      if (!a.every(x => typeof x === "string")) return { pass: false, note: "non-string item" };
      return { pass: true, note: a.join(",") };
    },
  },
  {
    id: "reverse-order",
    title: "Reverse a list exactly",
    why: "No reasoning needed, only careful transcription. Errors here are attention slips, not knowledge gaps.",
    prompt: "Reverse the order of this list and output only the reversed list, comma-separated, no spaces after commas: alpha,bravo,charlie,delta,echo,foxtrot,golf,hotel,india,juliet",
    check(text) {
      const want = "juliet,india,hotel,golf,foxtrot,echo,delta,charlie,bravo,alpha";
      const got = strip(text).replace(/\s*,\s*/g, ",").trim();
      return { pass: got === want, note: got === want ? "exact" : `got "${got.slice(0, 40)}"` };
    },
  },
  {
    id: "multi-hop-math",
    title: "Four-step arithmetic, number only",
    why: "Each step is trivial; the chain is where models drop a carry or answer the wrong step.",
    prompt: "Compute step by step internally but output only the final number: take 47, multiply by 13, subtract 211, divide by 5, then add 88.",
    check(text) {
      const t = strip(text).replace(/[,\s]/g, "");
      return { pass: t === "168", note: t === "168" ? "correct" : `got "${t.slice(0, 24)}"` };
    },
  },
  {
    id: "nested-json",
    title: "Fill a nested schema without inventing fields",
    why: "Shallow JSON is easy. Two levels down is where models add helpful extras that break a strict parser.",
    prompt: 'Return only JSON shaped exactly like this, no extra keys: {"city":{"name":string,"country":string},"stats":{"population":number,"area_km2":number}}. The city is Lyon, France. No markdown.',
    check(text) {
      let o;
      try { o = JSON.parse(strip(text)); } catch { return { pass: false, note: "not parseable" }; }
      const top = Object.keys(o || {}).sort().join(",");
      if (top !== "city,stats") return { pass: false, note: `top keys: ${top || "none"}` };
      const ck = Object.keys(o.city || {}).sort().join(",");
      const sk = Object.keys(o.stats || {}).sort().join(",");
      if (ck !== "country,name") return { pass: false, note: `city keys: ${ck}` };
      if (sk !== "area_km2,population") return { pass: false, note: `stats keys: ${sk}` };
      if (typeof o.stats.population !== "number") return { pass: false, note: "population not a number" };
      return { pass: true, note: `pop=${o.stats.population}` };
    },
  },
  {
    id: "order-preserved",
    title: "Map a list without reordering it",
    why: "The work is trivial; keeping the original order under a transformation is what slips.",
    prompt: "Uppercase each word and output them comma-separated with no spaces, in the same order as given: delta,alpha,foxtrot,bravo,echo,charlie",
    check(text) {
      const want = "DELTA,ALPHA,FOXTROT,BRAVO,ECHO,CHARLIE";
      const got = strip(text).replace(/\s*,\s*/g, ",").trim();
      if (got === want) return { pass: true, note: "exact" };
      const sorted = got.split(",").slice().sort().join(",") === want.split(",").slice().sort().join(",");
      return { pass: false, note: sorted ? "right words, wrong order" : `got "${got.slice(0, 40)}"` };
    },
  },
  {
    id: "unknown-answer",
    title: "Say it does not know",
    why: "A made-up answer costs more than a refusal. This asks for a fact that does not exist.",
    prompt: 'What is the name of the cat owned by the 47th president of Mars? If no such thing exists, reply with exactly: UNKNOWN',
    check(text) {
      const t = strip(text).toUpperCase();
      if (t === "UNKNOWN") return { pass: true, note: "declined cleanly" };
      if (t.includes("UNKNOWN")) return { pass: false, note: "said UNKNOWN but added words" };
      return { pass: false, note: `invented: "${strip(text).slice(0, 40)}"` };
    },
  },
  {
    id: "non-english",
    title: "Answer in Korean when told to",
    why: "Language is an instruction like any other. Models drift back to English on technical prompts.",
    prompt: "한국어로만 답하세요. 영어 단어를 쓰지 마세요. 질문: 물은 몇 도에서 끓나요? 숫자와 단위만 쓰고 한 문장으로.",
    check(text) {
      const t = strip(text);
      const hangul = (t.match(/[가-힣]/g) || []).length;
      const latin = (t.match(/[A-Za-z]/g) || []).length;
      if (hangul === 0) return { pass: false, note: "no Korean at all" };
      if (latin > 0) return { pass: false, note: `${latin} Latin letters leaked in` };
      return { pass: true, note: `${hangul} Hangul chars, no Latin` };
    },
  },
  {
    id: "unit-chain",
    title: "Convert through three units",
    why: "Each conversion is simple; the chain is where a dropped factor hides.",
    prompt: "Output only the final number, no units and no words: convert 2.5 kilometres to metres, then to centimetres, then divide by 1000.",
    check(text) {
      const t = strip(text).replace(/[,\s]/g, "");
      const num = parseFloat(t);
      if (!isFinite(num)) return { pass: false, note: `got "${t.slice(0, 24)}"` };
      return { pass: Math.abs(num - 250) < 0.001, note: num === 250 ? "correct" : `got ${num}` };
    },
  },
];

// 🔴 목록에 쉼표를 하나 더 찍으면 빈 슬롯이 생기고, 그 칸은 조용히 건너뛰어진다
//    (두 번 밟았다 — forEach 가 빈 슬롯을 건너뛰어 개수만 하나 늘어 보였다).
//    불러오는 순간 검사해서, 다음엔 조용히 지나가지 못하게 한다.
{
  const problems = [];
  // 🔴 forEach 는 빈 슬롯을 건너뛴다 — 가드가 같은 함정에 빠지면 아무것도 못 잡는다.
  //    (돌연변이를 넣어 보니 실제로 그냥 통과했다.) 인덱스로 직접 돈다.
  for (let i = 0; i < TASKS.length; i++) {
    const t = TASKS[i];
    if (!t) problems.push(`${i + 1}번 칸이 비어 있다 (쉼표가 하나 더 찍혔다)`);
    else if (!t.id || !t.prompt || typeof t.check !== "function") problems.push(`${i + 1}번(${t.id || "이름없음"})이 불완전하다`);
  }
  const ids = TASKS.filter(Boolean).map(t => t.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) problems.push(`중복된 id: ${[...new Set(dup)].join(", ")}`);
  if (problems.length) {
    console.error("TASKS 정의가 잘못됐다:\n  " + problems.join("\n  "));
    process.exit(1);
  }
}
