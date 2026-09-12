#!/bin/bash
# GitHub Pages 로 올린다. gh-pages 브랜치에 dist 내용만 넣는다.
# 🔴 build.mjs 는 dist 를 통째로 지운다 — dist 안에 .git 을 두면 매 빌드마다 날아간다.
#    그래서 worktree(.gh-pages)를 따로 두고 거기로 복사한다.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE" || exit 1
NODE=/opt/homebrew/bin/node
WT="$HERE/.gh-pages"

"$NODE" build.mjs || { echo "빌드 실패"; exit 1; }

if [ ! -d "$WT/.git" ]; then
  git worktree remove --force "$WT" 2>/dev/null
  rm -rf "$WT"
  if git show-ref --verify --quiet refs/heads/gh-pages; then
    git worktree add "$WT" gh-pages >/dev/null
  else
    git worktree add --detach "$WT" >/dev/null
    git -C "$WT" checkout --orphan gh-pages >/dev/null 2>&1
    git -C "$WT" rm -rf . >/dev/null 2>&1 || true
  fi
fi

find "$WT" -mindepth 1 -not -path "$WT/.git*" -delete 2>/dev/null
cp -R dist/. "$WT"/
touch "$WT/.nojekyll"          # Pages 가 _ 로 시작하는 경로를 버리지 않게
PAGES=$(find "$WT" -name '*.html' | wc -l | tr -d ' ')

cd "$WT" || exit 1
git add -A
if git diff --cached --quiet; then echo "바뀐 게 없다"; exit 0; fi
git -c user.email=billy5285@gmail.com -c user.name=billyssam \
    commit -q -m "publish: $(date '+%Y-%m-%d %H:%M') · ${PAGES}장"
git push -q -u origin gh-pages 2>&1 | tail -2
echo "올림 · ${PAGES}장 → gh-pages"

# 올렸으면 알린다. 안 알리면 발견까지 몇 주가 더 걸린다.
cd "$HERE" && "$NODE" notify-index.mjs
