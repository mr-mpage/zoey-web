#!/usr/bin/env bash
# Regenerate the GitHub wiki from the in-app HelpModal copy and push.
#
#   scripts/publish-wiki.sh
#
# Clones the wiki repo into a tmp dir, runs the build-wiki script, commits
# any diff, pushes, cleans up. Safe to run repeatedly — a no-op when nothing
# has changed.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WIKI_URL="${WIKI_URL:-https://github.com/mr-mpage/zoey-tracker.wiki.git}"
WORK_DIR="$(mktemp -d -t zoey-wiki.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "[wiki] cloning $WIKI_URL"
git -C "$WORK_DIR" clone --quiet "$WIKI_URL" wiki
WIKI_CLONE="$WORK_DIR/wiki"

echo "[wiki] building markdown from HelpModal.tsx"
(cd "$REPO_DIR/frontend" && npm run --silent wiki:build -- --out "$WIKI_CLONE")

cd "$WIKI_CLONE"
if [ -z "$(git status --porcelain)" ]; then
    echo "[wiki] no changes; nothing to publish"
    exit 0
fi

echo "[wiki] changed pages:"
git status --porcelain | sed 's/^/    /'

git add -A
git commit -m "wiki: regenerate from HelpModal $(date +%Y-%m-%d)"
git push --quiet
echo "[wiki] published"
