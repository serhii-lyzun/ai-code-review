#!/usr/bin/env bash
# Decides whether deploy.yml should build and promote <sha>.
# Writes deploy=true|false to $GITHUB_OUTPUT (when set) and prints why.
#
# Usage: deploy-plan.sh <sha> <event>
#   workflow_dispatch  always deploys (also the way to retry a failed promotion)
#   push, schedule     deploy unless <sha> was already deployed to dev, or every
#                      file changed since the last deploy to dev is one that
#                      can't change the site (docs, tests, agent and policy config,
#                      the AI metrics page).
# "Deployed" means the newest deploy(dev)/redeploy(dev) commit on gh-pages, not
# what dev serves: after a dev rollback dev serves an older SHA, and comparing
# with that would let the hourly schedule undo the rollback.
# Run inside a clone with full history and fetch access to gh-pages.
set -euo pipefail
sha=${1:?usage: deploy-plan.sh <sha> <event>}
event=${2:?event missing}

decide() {
  echo "deploy=$1: $2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "deploy=$1" >> "$GITHUB_OUTPUT"; fi
  exit 0
}

[ "$event" = workflow_dispatch ] && decide true "started by hand"

git fetch -q origin "+refs/heads/gh-pages:refs/remotes/origin/gh-pages" 2> /dev/null ||
  decide true "no gh-pages branch yet"
live=$(git log --format=%s origin/gh-pages |
  sed -nE 's/^(deploy|redeploy)\(dev\): ([0-9a-f]{40})$/\2/p' | head -n 1)
[ -n "$live" ] || decide true "nothing deployed to dev yet"
[ "$live" = "$sha" ] && decide false "${sha:0:7} was already deployed to dev"
git cat-file -e "$live^{commit}" 2> /dev/null ||
  decide true "the last dev deploy, ${live:0:7}, isn't in this clone's history"

relevant=$(git diff --name-only "$live" "$sha" | grep -vE \
  '(\.md$|^src/.*\.test\.tsx?$|^\.claude/|^\.mcp\.json$|^policy/|^scripts/|^dashboards/)' || true)
[ -n "$relevant" ] ||
  decide false "only docs, tests or config changed since ${live:0:7}"
decide true "$(grep -c . <<< "$relevant") site file(s) changed since ${live:0:7}"
