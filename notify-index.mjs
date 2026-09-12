// 새 측정이 올라갔다고 검색엔진에 알린다. IndexNow 는 계정 없이 되는 유일한 경로다(빙·야후·네이버 등).
// 🔴 구글은 IndexNow 를 쓰지 않는다 — Search Console 등록이 따로 필요하고 그건 사람 계정이 있어야 한다.
import fs from "node:fs";
const HOST = "billyssam.github.io";
const BASE = process.env.SITE_URL || `https://${HOST}/agent-bench`;
if (!fs.existsSync(".indexnow-key")) { console.log("indexnow 키 없음 — 건너뜀"); process.exit(0); }
const key = fs.readFileSync(".indexnow-key", "utf-8").trim();
const xml = fs.existsSync("dist/sitemap.xml") ? fs.readFileSync("dist/sitemap.xml", "utf-8") : "";
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (!urls.length) { console.log("사이트맵이 비어 있다 — 건너뜀"); process.exit(0); }
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `${BASE}/${key}.txt`, urlList: urls }),
});
// 200·202 가 정상이다. 그 외는 실패로 남긴다 — 조용히 넘어가면 몇 주 뒤에야 안 알려진 걸 안다.
console.log(`IndexNow HTTP ${res.status} · ${urls.length}건${res.ok ? "" : " — 실패: " + (await res.text()).slice(0, 120)}`);
process.exit(res.ok ? 0 : 1);
