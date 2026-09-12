// 콘솔에서 누른 명령을 가져와 실행한다. 5분마다 launchd 가 부른다.
// 🔴 상태를 먼저 claimed 로 바꾸고 나서 일한다 — 안 그러면 다음 호출이 같은 일을 또 시작한다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const REPO = "billyssam/gonghak-ops";
const FILE = "blog-queue.json";
const HERE = new URL(".", import.meta.url).pathname;
const gh = (...a) => execFileSync("/opt/homebrew/bin/gh", a, { encoding: "utf-8", maxBuffer: 8 << 20 });

function read() {
  try {
    const j = JSON.parse(gh("api", `repos/${REPO}/contents/${FILE}`));
    return { sha: j.sha, data: JSON.parse(Buffer.from(j.content, "base64").toString("utf-8")) };
  } catch { return { sha: null, data: { jobs: [] } }; }
}
function write(data, sha, msg) {
  const args = ["api", "-X", "PUT", `repos/${REPO}/contents/${FILE}`, "-f", `message=${msg}`,
    "-f", "branch=main", "-f", `content=${Buffer.from(JSON.stringify(data, null, 1) + "\n").toString("base64")}`];
  if (sha) args.push("-f", `sha=${sha}`);
  gh(...args);
}

const { sha, data } = read();
const job = (data.jobs || []).find(j => j.status === "queued");
if (!job) { console.log("대기 중인 명령 없음"); process.exit(0); }

console.log(`가져감: ${job.action} (${job.id})`);
job.status = "claimed"; job.updated = new Date().toISOString();
write(data, sha, `worker: claim ${job.action}`);

// 실제 실행. 실패는 숨기지 않고 note 에 남긴다.
const CMD = {
  measure: ["/bin/bash", ["-lc", `cd ${HERE} && bash run.sh`]],
  publish: ["/bin/bash", ["-lc", `cd ${HERE} && bash deploy-pages.sh`]],
  verify:  ["/bin/bash", ["-lc", `cd ${HERE} && VERIFY_GAP_MS=90000 VERIFY_MAX=6 /opt/homebrew/bin/node bench/verify-unknown.mjs`]],
};
let ok = true, note = "";
try {
  const [bin, args] = CMD[job.action];
  const out = execFileSync(bin, args, { encoding: "utf-8", maxBuffer: 16 << 20, timeout: 50 * 60 * 1000 });
  note = out.trim().split("\n").slice(-1)[0].slice(0, 160);
} catch (e) {
  ok = false;
  note = String(e.stdout || e.message || e).trim().split("\n").slice(-1)[0].slice(0, 160);
}

const cur = read();
const j2 = (cur.data.jobs || []).find(x => x.id === job.id);
if (j2) { j2.status = ok ? "done" : "failed"; j2.note = note; j2.updated = new Date().toISOString(); }
write(cur.data, cur.sha, `worker: ${ok ? "done" : "failed"} ${job.action}`);
console.log(`${ok ? "끝" : "실패"}: ${note}`);
process.exit(ok ? 0 : 1);
