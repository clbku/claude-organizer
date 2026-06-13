#!/usr/bin/env bash
#
# sync-and-deploy.sh — keep this fork's `main` rebased on top of upstream, then redeploy.
#
# Strategy (decided for this fork):
#   - upstream (fmilioni) is the base; origin (clbku) carries mostly deploy config on top.
#   - We rebase local `main` onto `upstream/main` so origin's commits replay on top,
#     then force-push to origin and rebuild the Docker stack.
#
# Run unattended by launchd (com.lyhc.claude-organizer-sync, every 6h).
# stdout/stderr are captured to /tmp/claude-organizer-sync-*.log by the plist.

set -euo pipefail

REPO_DIR="/Users/lyhoang/Documents/claude-organizer"
BRANCH="main"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "ERROR: $*"; exit 1; }

cd "$REPO_DIR" || fail "cannot cd into $REPO_DIR"

log "=== sync-and-deploy start ==="

# Refuse to run on a dirty tree — never destroy uncommitted work.
if [[ -n "$(git status --porcelain)" ]]; then
  fail "working tree is dirty; aborting to avoid data loss. Commit/stash and rerun."
fi

# Make sure both remotes exist.
git remote get-url upstream >/dev/null 2>&1 || fail "no 'upstream' remote configured"
git remote get-url origin   >/dev/null 2>&1 || fail "no 'origin' remote configured"

log "fetching upstream and origin..."
git fetch --prune upstream
git fetch --prune origin

git checkout "$BRANCH"

# Align local branch with origin so the rebase operates on the published tip.
git reset --hard "origin/$BRANCH"

BEFORE="$(git rev-parse HEAD)"
UPSTREAM_TIP="$(git rev-parse "upstream/$BRANCH")"
log "local=$BEFORE  upstream/$BRANCH=$UPSTREAM_TIP"

# Already contains upstream tip → nothing new to integrate.
if git merge-base --is-ancestor "$UPSTREAM_TIP" "$BEFORE"; then
  log "already up to date with upstream/$BRANCH; nothing to rebase."
else
  log "rebasing $BRANCH onto upstream/$BRANCH..."
  if ! git rebase "upstream/$BRANCH"; then
    log "rebase hit conflicts; aborting rebase (needs manual resolution)."
    git rebase --abort || true
    fail "rebase conflict — manual intervention required."
  fi

  AFTER="$(git rev-parse HEAD)"
  if [[ "$AFTER" != "$BEFORE" ]]; then
    log "pushing rebased $BRANCH to origin (force-with-lease)..."
    git push --force-with-lease origin "$BRANCH"
  else
    log "rebase produced no change; skipping push."
  fi
fi

log "rebuilding Docker stack (api/web/mcp/embedding)..."
docker compose up -d --build

log "=== sync-and-deploy done ==="
