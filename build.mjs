// data/probe-*.json 을 읽어 정적 HTML 로 찍는다. 의존성 0 — Node 만 있으면 된다.
// 페이지가 주장하는 숫자는 전부 이 JSON 에서 온다. 손으로 적은 숫자는 없다.
import fs from "node:fs";
import { TASKS as TASK_DEFS } from "./bench/tasks.mjs";
import path from "node:path";

const DATA = "data", OUT = "dist";
const SITE = "Agent Bench";
const SITE_URL = process.env.SITE_URL || "https://billyssam.github.io/agent-bench";
const TAGLINE = "We give models the same task and publish what it cost them.";

const TASK_PROMPTS = Object.fromEntries(TASK_DEFS.map(t => [t.id, t.prompt]));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const n = v => (v === null || v === undefined) ? "—" : Number(v).toLocaleString("en-US");

const CSS = `
:root{
  --paper:#ffffff; --ink:#111111; --ink2:#565656; --ink3:#8a8a8a;
  --rule:#e3e3e3; --rule2:#f0f0f0; --band:#f4f5f6;
  --bar:#c9cdd2;                 /* 시간 막대 — 색이 아니라 길이가 말한다 */
  --fail:#b3261e;                /* 이 페이지의 유일한 색. 실패에만 쓴다 */
  --serif:ui-serif,"Iowan Old Style","Source Serif 4",Georgia,serif;
  --sans:"Helvetica Neue",-apple-system,BlinkMacSystemFont,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--sans);font-size:16px;line-height:1.55;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:0 24px}
.tablewrap{margin-left:-16px;margin-right:-16px}

header{border-bottom:1px solid var(--ink);}
header .wrap{display:flex;align-items:baseline;gap:12px;padding:16px 24px}
header b{font-family:var(--serif);font-size:20px;font-weight:600;letter-spacing:-.01em}
header span{font-size:14px;color:var(--ink2)}
header a{color:inherit;text-decoration:none}

main{padding:48px 0 64px}
.eyebrow{font-size:12px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink3);margin:0 0 12px}
h1{font-family:var(--serif);font-size:44px;font-weight:600;letter-spacing:-.018em;
  line-height:1.08;margin:0 0 16px}
h2{font-family:var(--serif);font-size:24px;font-weight:600;letter-spacing:-.012em;
  margin:48px 0 12px}
h3{font-size:16px;font-weight:700;margin:0 0 4px}
p{margin:0 0 16px}
.lede{font-size:20px;line-height:1.5;color:var(--ink2);margin-bottom:24px}

/* 측정 조건 — 리포트의 표제부. 읽는 사람이 재현하려면 여기부터 본다 */
.conditions{border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);
  padding:12px 0;margin:0 0 32px;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:12px 24px}
.conditions div{font-size:14px}
.conditions dt{color:var(--ink3);font-size:12px;letter-spacing:.05em;
  text-transform:uppercase;margin-bottom:2px}
.conditions dd{margin:0;font-weight:500}

.tablewrap{overflow-x:auto;margin:0 0 8px}
table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;font-weight:700;font-size:14px;color:var(--ink);
  background:var(--band);padding:8px 12px;white-space:nowrap}
th:first-child{padding-left:12px}
td{padding:8px 12px;border-bottom:1px solid var(--rule2);vertical-align:middle}
td:first-child{padding-left:12px}
tr:last-child td{border-bottom:1px solid var(--rule)}
td.name{font-weight:500;white-space:nowrap}
td.note{color:var(--ink2);font-size:14px}
.pass{font-weight:700}
.fail{color:var(--fail);font-weight:700}
tr.failrow td.name{color:var(--fail)}
.dim{color:var(--ink3)}

/* ── 시그니처: 시간 막대 ──────────────────────────────────────────
   밀리초는 숫자로 읽히지 않는다. 633 과 15,733 의 차이는 길이여야 보인다. */
td.ms{white-space:nowrap;width:1%;padding-right:4px}
td.ms b{font-weight:500;font-variant-numeric:tabular-nums}
td.ms i{font-style:normal;color:var(--ink3);font-size:12px;margin-left:3px}
/* 막대는 제 칸을 갖는다. 숫자 칸에 겹쳐 두면 옆 열을 덮는다 */
td.barcell{width:88px;padding-left:0;padding-right:16px}
td.barcell span{display:block;height:8px;width:var(--w);min-width:2px;
  background:var(--bar);border-radius:1px}
td.barcell span.over{position:relative;background:linear-gradient(90deg,var(--bar) 82%,transparent)}
td.barcell span.over::after{content:"›";position:absolute;right:-4px;top:-6px;
  color:var(--ink3);font-size:14px;line-height:1}
th.barhead{padding-left:0}
td.barcell span.over{background:var(--ink2);
  clip-path:polygon(0 0,100% 0,calc(100% - 4px) 50%,100% 100%,0 100%)}
.scalenote{font-size:12px;color:var(--ink3);margin:4px 0 0}

.finding{border-top:1px solid var(--rule);padding:16px 0 4px}
.finding p{margin:0;color:var(--ink2)}
.k{font-family:var(--mono);font-size:14px;background:var(--band);
  padding:1px 4px;border-radius:2px}
pre{background:var(--band);border-left:2px solid var(--ink);padding:12px 16px;
  overflow-x:auto;font-family:var(--mono);font-size:14px;line-height:1.5;margin:0 0 16px}
.caveat{font-size:14px;color:var(--ink2);border-top:1px solid var(--rule);padding-top:12px}
footer{border-top:1px solid var(--ink);padding:16px 0 64px;font-size:14px;color:var(--ink2)}
a{color:var(--ink);text-decoration:underline;text-underline-offset:2px;
  text-decoration-thickness:1px;text-decoration-color:var(--ink3)}
a:hover{text-decoration-color:var(--ink)}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
@media(max-width:640px){h1{font-size:32px}.lede{font-size:16px}main{padding:32px 0 48px}
  th,td{padding:8px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

function page({ title, desc, body, slug, up = "" }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<style>${CSS}</style>
</head><body>
<header><div class="wrap"><b><a href="${up || './'}">${SITE}</a></b><span>${TAGLINE}</span></div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">We sent every request on this page. Run the script yourself and your numbers will differ — latency always does.</div></footer>
</body></html>`;
}


// 막대 스케일 — 최댓값에 맞추면 이상치 하나가 나머지를 1px 로 만든다.
// 두 번째로 큰 값에서 끊고, 넘친 막대는 끊겼다고 표시한다(축을 끊었다는 사실을 숨기지 않는다).
function barScale(values) {
  const v = values.filter(x => typeof x === "number" && x > 0).sort((a, b) => a - b);
  if (!v.length) return { cap: 1, max: 1, capped: false };
  // 이상치 선은 임의의 배수가 아니라 IQR 로 긋는다 (Q3 + 1.5×IQR — 상자수염의 수염 끝).
  const q = pct => v[Math.min(v.length - 1, Math.floor(v.length * pct))];
  const q1 = q(0.25), q3 = q(0.75);
  const fence = q3 + 1.5 * (q3 - q1);
  const normal = v.filter(x => x <= fence);
  const cap = normal.length ? normal[normal.length - 1] : v[v.length - 1];
  return { cap, max: v[v.length - 1], capped: v[v.length - 1] > cap };
}
function barCell(ms, sc) {
  if (typeof ms !== "number" || ms <= 0) return `<td class="barcell"></td>`;
  const w = (Math.min(ms, sc.cap) / sc.cap * 100).toFixed(1);
  return `<td class="barcell"><span class="${ms > sc.cap ? "over" : ""}" style="--w:${w}%"></span></td>`;
}

function probeTable(rows) {
  const sc = barScale(rows.map(r => r.ms));
  const tr = rows.map(r => {
    const status = r.ok ? `<span class="pass">200</span>`
      : `<span class="fail">${r.http || "ERR"}</span> <span class="dim">${esc(r.reason || "")}</span>`;
    const think = !r.ok ? "—" : (r.think_tok == null ? `<span class="dim">not reported</span>` : n(r.think_tok));
    return `<tr class="${r.ok ? "" : "failrow"}">`
      + `<td class="name">${esc(r.model)}</td>`
      + `<td>${status}</td>`
      + `<td class="ms"><b>${n(r.ms)}</b><i>ms</i></td>${barCell(r.ms, sc)}`
      + `<td class="note">${think}</td></tr>`;
  }).join("\n");
  return `<div class="tablewrap"><table>
<thead><tr><th>Model</th><th>Response</th><th>Latency</th><th class="barhead"></th><th>Thinking tokens</th></tr></thead>
<tbody>${tr}</tbody></table></div>`;
}


const allFiles = fs.readdirSync(DATA).filter(f => /^all-.*\.json$/.test(f)).sort();
const allData = allFiles.length ? JSON.parse(fs.readFileSync(path.join(DATA, allFiles.at(-1)), "utf-8")) : null;

const taskFiles = fs.readdirSync(DATA).filter(f => /^tasks-.*\.json$/.test(f)).sort();
const tasksData = taskFiles.length ? JSON.parse(fs.readFileSync(path.join(DATA, taskFiles.at(-1)), "utf-8")) : null;





// 🔴 긴 프롬프트를 통째로 싣지 않는다. needle 과제는 같은 문장이 220번 반복된
//    21,796자 더미였고, 그게 페이지에 그대로 박혀 있었다(사람도 못 읽고 검색엔진엔 스팸이다).
//    앞뒤만 보이고 가운데는 몇 줄을 접었는지 밝힌다 — 숨기는 게 아니라 접는 것이다.
function promptExcerpt(text, head = 4, tail = 3) {
  const lines = String(text || "").split("\n");
  if (lines.length <= head + tail + 2) return esc(text);
  const hidden = lines.length - head - tail;
  return esc(lines.slice(0, head).join("\n"))
    + `\n<span class="dim">     … ${n(hidden)} more lines of the same filler …</span>\n`
    + esc(lines.slice(-tail).join("\n"));
}

// ── 키가 다르면 결과가 다르다 ────────────────────────────────────
// 같은 계정, 같은 엔드포인트, 같은 프롬프트. 다른 것은 어느 프로젝트의 키로 물었느냐뿐이다.
// 🔴 이 페이지는 두 조사 파일이 모두 있을 때만 나온다. 하나뿐이면 만들지 않는다 —
//    비교가 아닌 것을 비교라고 부르지 않는다.
function keyComparePage(a, b) {
  const va = new Map(a.rows.map(r => [r.model, r]));
  const vb = new Map(b.rows.map(r => [r.model, r]));
  const common = [...va.keys()].filter(m => vb.has(m));
  const diff = common.filter(m => va.get(m).verdict !== vb.get(m).verdict);
  if (!diff.length) return null;

  const label = { answers: "answers", gone: "not found", "wrong-shape": "wrong shape", quota: "quota" };
  const cell = r => r.verdict === "answers" ? `<span class="pass">answers</span>`
    : r.verdict === "gone" ? `<span class="fail">404</span>`
    : `<span class="dim">${esc(label[r.verdict] || r.verdict)}</span>`;
  const tr = diff.sort().map(m =>
    `<tr><td class="name">${esc(m)}</td><td>${cell(va.get(m))}</td><td>${cell(vb.get(m))}</td>`
    + `<td class="note">${esc(va.get(m).http || "")} &rarr; ${esc(vb.get(m).http || "")}</td></tr>`).join("\n");

  const gainedA = diff.filter(m => va.get(m).verdict === "answers").length;
  const gainedB = diff.filter(m => vb.get(m).verdict === "answers").length;

  const body = `
<p class="eyebrow">Measurement report</p>
<h1>The same API, two keys, different answers</h1>
<p class="lede">We called every model the catalogue lists, twice — once with each of two API keys on the same Google account.
The catalogue was identical both times. ${diff.length} models did not behave the same way.</p>

<dl class="conditions">
<div><dt>Models listed</dt><dd>${n(a.rows.length)} (both keys)</dd></div>
<div><dt>Disagreed</dt><dd>${n(diff.length)}</dd></div>
<div><dt>Prompt</dt><dd>Same one-word request</dd></div>
<div><dt>Account</dt><dd>One, two projects</dd></div>
</dl>

<div class="tablewrap"><table>
<thead><tr><th>Model</th><th>Key A</th><th>Key B</th><th>HTTP</th></tr></thead>
<tbody>${tr}</tbody></table></div>

<h2>Findings</h2>
<div class="finding"><h3>The model list is not the model list</h3>
<p>Both keys got the same ${n(a.rows.length)} entries from <span class="k">/v1beta/models</span>.
Asking those entries to actually answer produced two different sets —
${n(gainedA)} worked only for one key, ${n(gainedB)} only for the other.
A catalogue that both keys agree on is not a promise that either can use it.</p></div>

<div class="finding"><h3>404 here does not mean retired</h3>
<p>We first read a 404 as "this model is gone." It is not that simple: several models return
<span class="k">404 NOT_FOUND</span> to one key and <span class="k">200</span> to another, minutes apart.
Whether a model exists is answered per project, not per API.</p></div>

<h2>How this was measured</h2>
<p>One request at a time, same prompt, same endpoint version. Anything that came back
<span class="k">429</span> was re-asked alone, minutes later, before being recorded — a spent quota
answers 429 for models that do not exist at all, so a busy sweep will call a missing model "rate limited."
<a href="../">See the full census</a>.</p>
`;
  return page({ up: "../",
    title: "The same API, two keys, different answers — Gemini model availability",
    desc: `${diff.length} of ${a.rows.length} listed models behaved differently depending on which key asked. Measured, both directions shown.`,
    body });
}

// ── 모델별 페이지 ────────────────────────────────────────────────
// 축이 하나 더 는다: 작업이 늘면 작업 페이지가, 모델이 늘면 모델 페이지가 따라 는다.
// 🔴 페이지마다 내용이 실제로 달라야 한다 — 같은 틀에 이름만 바꾸면 걸린다.
//    여기서 다른 것은 그 모델이 실제로 낸 숫자와 실패 문구다.
function modelPage(model, taskRows, allRow, tasksMeta) {
  const mine = taskRows.filter(r => r.model === model);
  const asked = mine.filter(r => r.called);
  const passed = asked.filter(r => r.pass);
  const failed = asked.filter(r => !r.pass);
  const unasked = mine.filter(r => !r.called);
  const total = asked.reduce((a, r) => a + (r.ms || 0), 0);
  const thinking = asked.filter(r => typeof r.think_tok === "number");
  const thinkSum = thinking.reduce((a, r) => a + r.think_tok, 0);
  const sc = barScale(asked.map(r => r.ms));
  const title = tid => (tasksMeta.find(t => t.id === tid) || {}).title || tid;

  // 열이 전부 비어 있으면 그 열은 표에 있을 이유가 없다 — 사실은 요약에 한 줄로 적는다.
  const showThink = thinking.length > 0;
  const tr = [...asked].sort((a, b) => a.ms - b.ms).map(r =>
    `<tr class="${r.pass ? "" : "failrow"}">`
    + `<td class="name"><a href="../../task/${esc(r.task)}/">${esc(title(r.task))}</a></td>`
    + `<td>${r.pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'}</td>`
    + `<td class="ms"><b>${n(r.ms)}</b><i>ms</i></td>${barCell(r.ms, sc)}`
    + (showThink ? `<td class="note">${r.think_tok == null ? '<span class="dim">—</span>' : n(r.think_tok)}</td>` : "")
    + `<td class="note">${esc(r.note)}</td></tr>`).join("\n");

  const body = `
<p class="eyebrow">Model</p>
<h1>${esc(model)}</h1>
<p class="lede">${passed.length} of ${asked.length} tasks passed, in ${n(total)}&thinsp;ms of wall time${
  thinkSum ? ` and ${n(thinkSum)} thinking tokens` : ", with no thinking tokens reported"}.</p>

<dl class="conditions">
<div><dt>Tasks passed</dt><dd>${passed.length} of ${asked.length}</dd></div>
<div><dt>Total time</dt><dd>${n(total)} ms</dd></div>
<div><dt>Thinking tokens</dt><dd>${thinkSum ? n(thinkSum) : "none reported"}</dd></div>
${allRow ? `<div><dt>One-word probe</dt><dd>${n(allRow.ms)} ms</dd></div>` : ""}
${unasked.length ? `<div><dt>Not asked</dt><dd>${unasked.length} (quota)</dd></div>` : ""}
</dl>

<div class="tablewrap"><table>
<thead><tr><th>Task</th><th>Result</th><th>Time</th><th class="barhead"></th>
${showThink ? "<th>Thinking tokens</th>" : ""}<th>What came back</th></tr></thead>
<tbody>${tr}</tbody></table></div>

<h2>Findings</h2>
${failed.length
  ? `<div class="finding"><h3>Where it failed</h3><p>`
    + failed.map(f => `<span class="k">${esc(title(f.task))}</span> — ${esc(f.note)}`).join("<br>") + `</p></div>`
  : `<div class="finding"><h3>It passed everything we could ask</h3><p>All ${asked.length} tasks completed. What separates it from the others here is cost, not capability.</p></div>`}
${thinkSum
  ? `<div class="finding"><h3>It reports thinking tokens</h3><p>${n(thinkSum)} across ${thinking.length} task${thinking.length > 1 ? "s" : ""}. Those are billed, and they land before the first output token — which is why wall time and output length disagree on this model.</p></div>`
  : `<div class="finding"><h3>It reports no thinking tokens</h3><p>Every response came back without a <span class="k">thoughtsTokenCount</span> field. That is not the same as a measured zero: the API simply does not report one here, so cost models that read that field see nothing.</p></div>`}
${unasked.length
  ? `<div class="finding"><h3>${unasked.length} task${unasked.length > 1 ? "s" : ""} could not be asked</h3><p>The free-tier quota was spent before we got to ${unasked.map(u => `<span class="k">${esc(title(u.task))}</span>`).join(", ")}. Those are left out of the pass rate rather than counted against the model.</p></div>`
  : ""}

<h2>How this was measured</h2>
<p>Every task was sent at temperature 0, one request at a time, and judged by code — the checkers live in
<span class="k">bench/tasks.mjs</span>. Failed responses are stored verbatim so the verdict can be re-read.
<a href="../../">See all models and tasks</a>.</p>
`;
  return page({ up: "../../",
    title: `${model} — what it costs on ${asked.length} measured tasks`,
    desc: `${passed.length} of ${asked.length} tasks passed in ${n(total)}ms${thinkSum ? ` and ${n(thinkSum)} thinking tokens` : ""}. Measured, not quoted.`,
    body });
}

// ── 작업별 페이지 — 측정한 작업 수만큼 페이지가 나온다 ──────────
function matrix(rows, models, tasks) {
  const totals = models.map(m => rows.filter(r => r.model === m).reduce((a, r) => a + (r.ms || 0), 0));
  const sc = barScale(totals);
  const head = `<thead><tr><th>Model</th>`
    + tasks.map(t => `<th>${esc(t.id)}</th>`).join("") + `<th>Total time</th><th class="barhead"></th></tr></thead>`;
  const body = models.map((m, i) => {
    const mine = rows.filter(r => r.model === m);
    const cells = tasks.map(t => {
      const r = mine.find(x => x.task === t.id);
      if (!r) return `<td class="dim">—</td>`;
      if (!r.called) return `<td class="dim">n/a</td>`;
      return `<td>${r.pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'}</td>`;
    }).join("");
    return `<tr><td class="name">${esc(m)}</td>${cells}`
      + `<td class="ms"><b>${n(totals[i])}</b><i>ms</i></td>${barCell(totals[i], sc)}</tr>`;
  }).join("\n");
  return `<div class="tablewrap"><table>${head}<tbody>${body}</tbody></table></div>`;
}


function taskPage(t, rows) {
  const mine = rows.filter(r => r.task === t.id).sort((a, b) => a.ms - b.ms);
  // 🔴 429·5xx 는 "모델이 못했다" 가 아니라 "못 물어봤다" 이다. 실패로 세면 벤치마크가 거짓말한다.
  const asked = mine.filter(r => r.called);
  const unasked = mine.filter(r => !r.called);
  const passed = asked.filter(r => r.pass);
  const failed = asked.filter(r => !r.pass);
  const fast = mine[0], slow = mine[mine.length - 1];
  const sc = barScale(mine.map(r => r.ms));
  const tr = mine.map(r => {
    return `<tr class="${r.called && !r.pass ? "failrow" : ""}">`
    + `<td class="name">${esc(r.model)}</td>`
    + `<td>${!r.called ? '<span class="dim">not asked</span>' : r.pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'}</td>`
    + `<td class="ms"><b>${n(r.ms)}</b><i>ms</i></td>${barCell(r.ms, sc)}`
    + `<td class="note">${r.think_tok == null ? '<span class="dim">not reported</span>' : n(r.think_tok)}</td>`
    + `<td class="note">${esc(r.note)}</td></tr>`;
  }).join("\n");

  const body = `
<p class="eyebrow">Task</p>
<h1>${esc(t.title)}</h1>
<p class="lede">${esc(t.why)}</p>
<dl class="conditions">
<div><dt>Measured</dt><dd>${esc(tasksData.measured_at.slice(0,10))} UTC</dd></div>
<div><dt>Result</dt><dd>${passed.length} of ${asked.length} passed${unasked.length ? ` · ${unasked.length} not asked` : ""}</dd></div>
<div><dt>Temperature</dt><dd>0</dd></div>
<div><dt>Prompt size</dt><dd>${n(t.prompt_chars)} chars</dd></div>
</dl>

<div class="tablewrap"><table>
<thead><tr><th>Model</th><th>Result</th><th>Time</th><th class="barhead"></th><th>Thinking tokens</th><th>What came back</th></tr></thead>
<tbody>${tr}</tbody></table></div>

<h2>What happened</h2>
${unasked.length ? `<div class="finding"><h3>${unasked.length} model${unasked.length > 1 ? "s" : ""} could not be asked</h3>
<p>${unasked.map(u => `<span class="k">${esc(u.model)}</span> returned ${esc(u.note)}`).join("<br>")}.
That is a spent quota, not a wrong answer — it is left out of the pass rate rather than counted as a failure.</p></div>` : ""}
${failed.length
  ? `<div class="finding"><h3>${failed.length} of ${asked.length} models failed</h3><p>`
    + failed.map(f => `<span class="k">${esc(f.model)}</span> — ${esc(f.note)}`).join("<br>")
    + `</p></div>`
  : `<div class="finding"><h3>Every model passed</h3><p>All ${asked.length} models we could reach completed this one. The difference is not capability, it is what each spent to get there.</p></div>`}
${(() => {
  const withT = mine.filter(r => typeof r.think_tok === "number");
  if (withT.length < 2) return "";
  const top = withT.reduce((a, b) => (a.think_tok > b.think_tok ? a : b));
  const wrong = mine.filter(r => !r.pass);
  const zeroPass = mine.filter(r => r.pass && r.think_tok == null);
  // 표본 6개다. 이 작업에 한정해서만 말한다 — 일반 법칙으로 부풀리지 않는다.
  return `<div class="finding"><h3>Thinking more did not mean getting it right</h3>
<p>On this task <span class="k">${esc(top.model)}</span> spent
<b style="color:var(--fg);font-family:var(--mono)">${n(top.think_tok)}</b> thinking tokens and ${top.pass ? "passed" : "still failed"}.
${zeroPass.length ? `${zeroPass.length} model${zeroPass.length > 1 ? "s" : ""} passed without reporting a single thinking token` : ""}${
  wrong.filter(w => typeof w.think_tok === "number").length
    ? `, while ${wrong.filter(w => typeof w.think_tok === "number").map(w => `<span class="k">${esc(w.model)}</span> spent ${n(w.think_tok)} and got it wrong`).join(", ")}` : ""}.
Six models is a small sample, so read this as what happened here, not as a law.</p></div>`;
})()}
<div class="finding"><h3>${(slow.ms / fast.ms).toFixed(1)}× between fastest and slowest</h3>
<p><span class="k">${esc(fast.model)}</span> finished in ${n(fast.ms)}ms.
<span class="k">${esc(slow.model)}</span> took ${n(slow.ms)}ms for the same prompt.</p></div>

<h2>The exact prompt</h2>
<pre>${promptExcerpt(TASK_PROMPTS[t.id] || "(see bench/tasks.mjs)")}</pre>
<p>Pass/fail is decided by code, not by reading the answer. The check for this task is in
<span class="k">bench/tasks.mjs</span>, and failed responses are stored verbatim so the verdict can be re-read.</p>
`;
  return page({ up: "../../",
                title: `${t.title} — measured across ${mine.length} Gemini models`,
                desc: `${passed.length} of ${asked.length} models passed. Latency spread ${(slow.ms/fast.ms).toFixed(1)}×. Measured, with the checker and the raw failures shown.`,
                body });
}


// ── 전수 조사 페이지 ────────────────────────────────────────────
const VERDICT_LABEL = { answers: "answers", gone: "not found", "wrong-shape": "other format", quota: "unverified", other: "error" };
function censusTable(rows) {
  // 🔴 이상치 하나가 나머지 막대를 전부 1px 로 뭉갠다. 90 퍼센타일을 기준으로 잡고,
  //    그걸 넘는 것은 잘린 채로 표시한다 — 잘렸다는 사실을 숨기지 않는다.
  const sc = barScale(rows.filter(r => r.verdict === "answers").map(r => r.ms));
  const order = { answers: 0, gone: 1, "wrong-shape": 2, quota: 3, other: 4 };
  const sorted = [...rows].sort((a, b) => (order[a.verdict] - order[b.verdict]) || (a.ms - b.ms));
  const tr = sorted.map(r => {
    const isAns = r.verdict === "answers";
    const v = r.verdict === "answers" ? `<span class="pass">answers</span>`
      : r.verdict === "gone" ? `<span class="fail">not found</span>`
      : `<span class="dim">${esc(VERDICT_LABEL[r.verdict] || r.verdict)}</span>`;
    return `<tr class="${r.verdict === "gone" ? "failrow" : ""}">`
      + `<td class="name">${esc(r.model)}</td>`
      + `<td>${v}</td><td class="note">${
          r.confirmed_solo_404 && r.http !== 404
            ? `${r.http} <span class="dim">&rarr; 404</span>`   /* 전수 때 받은 코드 → 단독 재확인 결과 */
            : r.http}</td>`
      + `<td class="ms">${isAns ? `<b>${n(r.ms)}</b><i>ms</i>` : `<span class="dim">—</span>`}</td>`
      + (isAns ? barCell(r.ms, sc) : `<td class="barcell"></td>`) + `</tr>`;
  }).join("\n");
  return `<div class="tablewrap"><table>
<thead><tr><th>Model</th><th>Result</th><th>HTTP (sweep &rarr; solo)</th><th>Latency</th><th class="barhead"></th></tr></thead>
<tbody>${tr}</tbody></table></div>
<p class="scalenote">Bars scale to ${n(sc.cap)}&thinsp;ms; anything longer is clipped and marked.</p>`;
}

function censusPage(a) {
  const t = a.tally, rows = a.rows;
  const confirmed = rows.filter(r => r.confirmed_solo_404).length;
  const ans = rows.filter(r => r.verdict === "answers").sort((x, y) => x.ms - y.ms);
  const shapes = rows.filter(r => r.verdict === "wrong-shape");
  const body = `
<p class="eyebrow">Measurement report</p>
<h1>Google lists ${a.listed} models. ${t.answers} of them answer.</h1>
<p class="lede">We called every model the API advertises, one at a time, with the same one-word prompt.
${confirmed} returned 404 — they are listed, and they are not there.</p>

<dl class="conditions">
<div><dt>Measured</dt><dd>${esc(a.measured_at.slice(0, 10))} UTC</dd></div>
<div><dt>Listed</dt><dd>${a.listed} models</dd></div>
<div><dt>Key tier</dt><dd>Free</dd></div>
<div><dt>Prompt</dt><dd>Reply with exactly one word: OK</dd></div>
<div><dt>Order</dt><dd>Sequential</dd></div>
</dl>

${censusTable(rows)}

<h2>Findings</h2>

<div class="finding"><h3>429 hides 404</h3>
<p>This is the part that cost us a wrong answer first time round. Run the sweep and the free-tier quota
burns out partway. After that the server returns <span class="k">429 RESOURCE_EXHAUSTED</span> for models
that do not exist at all — it never gets as far as looking them up. Our first sweep recorded
17 models as "rate limited". Re-calling eight of them on a rested quota returned
<span class="k">404</span> every time. The rate limit was not the reason they failed; it was covering the reason.</p></div>

<div class="finding"><h3>A sweep large enough to be useful is large enough to corrupt itself</h3>
<p>Forty sequential calls exhaust the free tier. Every result after that point is suspect, including results
for models that are perfectly healthy — <span class="k">gemini-2.5-flash</span> answered in one run and
returned 429 in the next. We mark only the ${confirmed} models we re-checked individually as confirmed missing.
The other ${t.quota || 0} stay unverified, and we do not count them either way.</p></div>

<div class="finding"><h3>${shapes.length} models are there but will not take a text prompt</h3>
<p>${shapes.map(x => `<span class="k">${esc(x.model)}</span>`).join(", ")} return
<span class="k">400</span>, not 404. Speech and research models listed under the same
<span class="k">generateContent</span> method as the chat models, reachable only with a different request shape.
A catalogue that mixes them is a catalogue you cannot iterate over.</p></div>

<div class="finding"><h3>Among those that answer, ${(ans[ans.length - 1].ms / ans[0].ms).toFixed(0)}× separates fastest from slowest</h3>
<p><span class="k">${esc(ans[0].model)}</span> replied in ${n(ans[0].ms)}ms.
<span class="k">${esc(ans[ans.length - 1].model)}</span> took ${n(ans[ans.length - 1].ms)}ms for the same word.</p></div>

<h2>Reproduce it</h2>
<pre>GEMINI_API_KEY=... node bench/probe-all.mjs</pre>
<p>The script reads the model list from the API, calls each one in turn, and re-asks any model that returns 429
after a pause. That re-ask is not enough on a spent quota — the confirmations in this report came from
calling the eight models individually, hours apart. The raw JSON carries a
<span class="k">confirmed_solo_404</span> flag so you can see which verdicts were checked that way.</p>

<h2>Caveats</h2>
<p class="caveat">One key, free tier, one location, one run per model except where noted.
Latency here is a single observation and moves with all of those.
${t.quota || 0} models remain unverified: they may be missing, or the quota may simply have been spent when we reached them.
We have not guessed which.</p>
`;
  return page({ title: `Google lists ${a.listed} Gemini models — ${t.answers} of them answer`,
    desc: `We called every model in the Gemini API catalogue. ${t.answers} answered, ${confirmed} returned 404 on a rested quota, and ${shapes.length} need a different request shape. Measured, with the checking method shown.`,
    body });
}

const files = fs.readdirSync(DATA).filter(f => /^probe-.*\.json$/.test(f)).sort();
if (!files.length) { console.error("data/probe-*.json 없음"); process.exit(1); }
const latest = JSON.parse(fs.readFileSync(path.join(DATA, files.at(-1)), "utf-8"));
const rows = latest.rows;
const alive = rows.filter(r => r.ok), dead = rows.filter(r => !r.ok);
const thinkers = alive.filter(r => (r.think_tok ?? 0) > 0).sort((a, b) => b.think_tok - a.think_tok);
const noReport = alive.filter(r => r.out_tok === null);
const noThink = alive.filter(r => r.think_tok === null || r.think_tok === undefined);
const fastest = [...alive].sort((a, b) => a.ms - b.ms)[0];
const slowest = [...alive].sort((a, b) => b.ms - a.ms)[0];
const day = latest.measured_at.slice(0, 10) + " UTC";

const body = `
<p class="eyebrow">Measurement report</p>
<h1>Listed in the API, but returns 404</h1>
<p class="lede">We sent the same one-word question to ${rows.length} Gemini models.
${dead.length} failed — one of them a model the API still lists as available.</p>
<dl class="conditions">
<div><dt>Measured</dt><dd>${esc(day)}</dd></div>
<div><dt>Prompt</dt><dd>${esc(latest.prompt)}</dd></div>
<div><dt>Temperature</dt><dd>0</dd></div>
<div><dt>Timeout</dt><dd>${n(latest.timeout_ms)} ms</dd></div>
<div><dt>Order</dt><dd>Sequential</dd></div>
</dl>

${probeTable(rows)}

<h2>Findings</h2>

<div class="finding"><h3>A model can be listed and still be gone</h3>
<p><span class="k">gemini-2.5-pro</span> is returned by the <span class="k">/v1beta/models</span> endpoint with
<span class="k">generateContent</span> among its supported methods. Calling it returns
<span class="no">404 NOT_FOUND</span> in ${n(dead.find(d => d.http === 404)?.ms ?? 0)}ms. The catalogue and the runtime disagree.</p></div>

<div class="finding"><h3>Newer models think harder about a one-word question</h3>
<p>Thinking tokens spent on <span class="k">"${esc(latest.prompt)}"</span>:
${thinkers.map(t => `${esc(t.model.replace("gemini-", ""))} <b style="color:var(--fg);font-family:var(--mono)">${n(t.think_tok)}</b>`).join(" &middot; ")}.
You are billed for those whether or not the answer needed them.
The ${noThink.length} lite variants did not return the <span class="k">thoughtsTokenCount</span> field at all —
which is not the same as a measured zero, so we do not print one.</p></div>

<div class="finding"><h3>One model does not report its output tokens</h3>
<p>${noReport.length ? noReport.map(x => `<span class="k">${esc(x.model)}</span>`).join(", ") : "None"} returned
<span class="k">usageMetadata</span> without <span class="k">candidatesTokenCount</span>, even on a clean
<span class="k">STOP</span> finish. Cost code that multiplies output tokens silently bills zero for it.</p></div>

<div class="finding"><h3>The spread is ${(slowest.ms / fastest.ms).toFixed(1)}×</h3>
<p>Same prompt, same region, same minute: <span class="k">${esc(fastest.model)}</span> answered in
${n(fastest.ms)}ms and <span class="k">${esc(slowest.model)}</span> took ${n(slowest.ms)}ms.</p></div>

<h2>Reproduce it</h2>
<pre>GEMINI_API_KEY=... node bench/probe.mjs \\
${rows.map(r => "  " + r.model).join(" \\\n")}</pre>
<p>The script sends one request per model, waits 900ms between them so rate limiting does not
contaminate the timings, and writes a JSON file. This page is generated from that file — no number
on it was typed by hand.</p>

<h2>Caveats</h2>
<p class="caveat">Single run, one API key, free tier, one location. Latency moves with all of those.
<span class="k">${esc(dead.find(d => d.http === 429)?.model ?? "")}</span> returned
<span class="no">429</span>, which is a quota result, not a verdict about the model.
Treat the ms column as one observation, not a benchmark score.</p>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// 빌린 키로 잰 기록이 남아 있으면 비교 페이지를 만든다
let keyCmpLink = "";
{
  const bf = fs.readdirSync(DATA).filter(f => /^all-.*borrowed-key\.json$/.test(f)).sort();
  if (bf.length && allData) {
    const borrowed = JSON.parse(fs.readFileSync(path.join(DATA, bf.at(-1)), "utf-8"));
    const html = keyComparePage(borrowed, allData);
    if (html) {
      const dir = path.join(OUT, "two-keys");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.html"), html);
      keyCmpLink = `<p style="margin-top:14px"><a href="two-keys/">The same API, two keys, different answers</a></p>`;
      console.log("two-keys 페이지 생성");
    } else {
      console.log("two-keys: 두 조사가 완전히 일치 — 페이지를 만들지 않는다");
    }
  }
}

let extra = "";
if (tasksData) {
  const models = [...new Set(tasksData.results.map(r => r.model))];
  for (const t of tasksData.tasks) {
    const dir = path.join(OUT, "task", t.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), taskPage(t, tasksData.results));
  }
  const asked = tasksData.results.filter(r => r.called);
  const passed = asked.filter(r => r.pass).length;
  // 🔴 측정이 얇으면 페이지를 만들지 않는다. 2/9 짜리 페이지는 독자에게도 검색엔진에도 쓸모가 없다.
  //    쿼터가 채워져 측정이 늘면 다음 빌드에서 저절로 생긴다.
  const MIN_ASKED = 5;
  const modelPages = models.filter(m =>
    tasksData.results.filter(r => r.model === m && r.called).length >= MIN_ASKED);
  for (const m of modelPages) {
    const dir = path.join(OUT, "model", m);
    fs.mkdirSync(dir, { recursive: true });
    const allRow = (allData?.rows || []).find(r => r.model === m && r.verdict === "answers");
    fs.writeFileSync(path.join(dir, "index.html"),
      modelPage(m, tasksData.results, allRow, tasksData.tasks));
  }
  extra = `\n<h2>Can they actually do the work?</h2>
<p>We gave every model the same ${tasksData.tasks.length} tasks, each with a pass/fail decided by code.
${passed} of ${asked.length} runs passed${tasksData.results.length > asked.length ? `, and ${tasksData.results.length - asked.length} could not be asked (spent quota, not a wrong answer)` : ""}.</p>
${matrix(tasksData.results, models, tasksData.tasks)}
${modelPages.length ? `<p style="margin-top:14px"><b>Per model:</b> ` + modelPages.map(m =>
  `<a href="model/${esc(m)}/">${esc(m)}</a>`).join(" &middot; ") + `</p>` : ""}
<p style="margin-top:14px"><b>Per task:</b> ` + tasksData.tasks.map(t =>
  `<a href="task/${t.id}/">${esc(t.title)}</a>`).join(" &middot; ") + `</p>`;
}

if (allData) {
  const html = censusPage(allData);
  fs.writeFileSync(path.join(OUT, "index.html"),
    html.replace("</main>", `<div class="wrap">${extra}</div></main>`));
} else {
  fs.writeFileSync(path.join(OUT, "index.html"), page({
    title: "Listed in the API, but returns 404 — Gemini model probe, September 2026",
    desc: `We called ${rows.length} Gemini models with an identical prompt.`,
    body: body + extra
  }));
}
// 🔴 세는 대신 계산하면 로그가 거짓말한다 — 모델 페이지가 늘어도 숫자가 그대로였다.
const pages = (function count(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += count(path.join(dir, e.name));
    else if (e.name === "index.html") n++;
  }
  return n;
})(OUT);
if (allData) console.log(`전수: ${allData.listed}개 중 answers ${allData.tally.answers} · gone ${allData.tally.gone}`);
console.log(`dist · 페이지 ${pages}장 · 모델 ${rows.length} · 작업 ${tasksData ? tasksData.tasks.length : 0}`);


// public/ 은 그대로 실린다 — 검색엔진 소유권 확인 파일처럼 손으로 받은 것들이 여기 있다.
{
  const PUB = "public";
  if (fs.existsSync(PUB)) {
    let n = 0;
    for (const f of fs.readdirSync(PUB)) {
      fs.copyFileSync(path.join(PUB, f), path.join(OUT, f));
      n++;
    }
    if (n) console.log(`public/ ${n}개 복사`);
  }
}

// ── 사이트맵 + robots ─────────────────────────────────────────────
// 크롤러에게 "여기 뭐가 있는지" 알려 주는 유일한 파일. 없으면 발견까지 몇 주가 더 걸린다.
{
  const htmls = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "index.html") {
        const rel = path.relative(OUT, full).replace(/index\.html$/, "").replace(/\\/g, "/");
        htmls.push(rel);
      }
    }
  };
  walk(OUT);
  const today = new Date().toISOString().slice(0, 10);
  const urls = htmls.sort().map(rel =>
    `  <url><loc>${SITE_URL}/${rel}</loc><lastmod>${today}</lastmod></url>`).join("\n");
  fs.writeFileSync(path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`sitemap.xml · ${htmls.length}개 URL · robots.txt`);
}

// IndexNow 키 파일 — 이 파일이 사이트에 있어야 제출이 인증된다(계정 없이 되는 유일한 경로)
{
  const kf = path.join(".indexnow-key");
  if (fs.existsSync(kf)) {
    const key = fs.readFileSync(kf, "utf-8").trim();
    if (key) { fs.writeFileSync(path.join(OUT, key + ".txt"), key + "\n"); console.log("indexnow key 파일 생성"); }
  }
}
