#!/bin/bash
# 하루 한 번 도는 러너. launchd 가 부른다.
# 🔴 launchd 는 PATH 를 물려주지 않는다 — 도구는 전부 절대경로로 부른다.
set -u
NODE=/opt/homebrew/bin/node
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1
LOG="$HERE/run.log"
say(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# 키는 저장소 밖에서 읽는다. 경로는 환경변수로 받고 기본값은 홈의 점파일이다.
ENVF="${AGENT_BENCH_ENV_FILE:-$HOME/.agent-bench.env}"
if [ ! -f "$ENVF" ]; then say "키 파일 없음: $ENVF"; exit 1; fi
GEMINI_API_KEY=$(grep -E '^GEMINI_API_KEY=' "$ENVF" | head -1 | cut -d= -f2- | tr -d '"'"'"'')
export GEMINI_API_KEY
if [ -z "$GEMINI_API_KEY" ]; then say "키 비어 있음"; exit 1; fi

say "=== 시작 ==="

# 1) 미확인 모델 확인 — 429 가 404 를 가리므로 간격을 크게 둔다
say "미확인 확인 시작"
VERIFY_GAP_MS=90000 VERIFY_MAX=6 "$NODE" bench/verify-unknown.mjs >> "$LOG" 2>&1
say "미확인 확인 끝 (종료 $?)"

sleep 120   # 쿼터를 식힌다

# 2) 작업 측정
say "작업 측정 시작"
# --fill : 이미 답 받은 칸은 건너뛴다. 매번 전체를 물으면 쿼터가 앞에서 말라 뒷칸이 영영 빈다.
"$NODE" bench/run-tasks.mjs --fill \
  gemini-2.5-flash gemini-2.5-flash-lite gemini-3-flash-preview \
  gemini-3.1-flash-lite gemini-3.5-flash gemini-3.5-flash-lite >> "$LOG" 2>&1
say "작업 측정 끝 (종료 $?)"

# 3) 페이지 생성
say "빌드 시작"
"$NODE" build.mjs >> "$LOG" 2>&1
BUILD_RC=$?
PAGES=$(find dist -name '*.html' 2>/dev/null | wc -l | tr -d ' ')
say "빌드 끝 (종료 $BUILD_RC · 페이지 $PAGES장)"

# 4) 발행 — gh-pages 브랜치에 올린다. Pages 가 켜져 있으면 그대로 사이트가 갱신된다.
#    꺼져 있어도 브랜치는 최신으로 유지되므로, 켜는 순간 최신본이 뜬다.
say "발행 시작"
bash "$HERE/deploy-pages.sh" >> "$LOG" 2>&1
say "발행 끝 (종료 $?)"

say "=== 끝 ==="
# 로그가 무한히 자라지 않게 — 마지막 2000줄만 남긴다
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
