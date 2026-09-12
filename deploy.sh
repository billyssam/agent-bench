#!/bin/bash
# Cloudflare Pages 배포. 계정이 연결되면 이 스크립트 하나로 올라간다.
# 🔴 Vercel 에는 올리지 않는다 — Hobby 약관이 광고·제휴를 금지하고, 같은 계정의 콘솔까지 위험해진다.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE" || exit 1
NODE=/opt/homebrew/bin/node
PROJECT="${CF_PROJECT:-agent-bench}"

"$NODE" build.mjs || { echo "빌드 실패"; exit 1; }
PAGES=$(find dist -name '*.html' | wc -l | tr -d ' ')
echo "빌드 완료 · ${PAGES}장"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  cat <<'MSG'

아직 못 올린다. Cloudflare 계정이 필요하다.

  1) https://dash.cloudflare.com/sign-up 에서 가입 (무료)
  2) Workers & Pages → Create → Pages → Connect to Git → billyssam/agent-bench
     빌드 명령: node build.mjs
     출력 디렉터리: dist
  또는 토큰을 발급해 CLOUDFLARE_API_TOKEN 으로 넘기면 이 스크립트가 직접 올린다.

MSG
  exit 2
fi

npx --yes wrangler@latest pages deploy dist --project-name "$PROJECT" --commit-dirty=true
