#!/usr/bin/env bash
# Publishes the AI metrics page into the ai-metrics/ folder of the gh-pages
# branch (served at <pages-url>/ai-metrics/). Only that folder changes, so it
# never touches /dev/, /stg/ or /prd/, and its "metrics:" commits don't match
# the deploy/rollback subjects that deploy-plan.sh and pages-restore.sh read.
# A rejected push is retried on top of the new branch head, as in
# pages-publish.sh.
#
# Usage: pages-metrics.sh <site-dir>     (index.html and runs.json)
# Env:   GH_TOKEN (contents: write) unless PAGES_REMOTE is set
set -euo pipefail

site=$(cd "${1:?usage: pages-metrics.sh <site-dir>}" && pwd)
branch=gh-pages
folder=ai-metrics
for f in index.html runs.json; do
  [ -f "$site/$f" ] || {
    echo "::error::$site has no $f"
    exit 1
  }
done
runs=$(jq '.runs | length' "$site/runs.json")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git init -q "$work"
cd "$work"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
if [ -n "${PAGES_REMOTE:-}" ]; then
  git remote add origin "$PAGES_REMOTE"
else
  git remote add origin "https://github.com/${GITHUB_REPOSITORY:?}.git"
  auth=$(printf 'x-access-token:%s' "${GH_TOKEN:?GH_TOKEN is not set}" | base64 | tr -d '\n')
  echo "::add-mask::$auth"
  git config http.https://github.com/.extraheader "AUTHORIZATION: basic $auth"
fi

for attempt in 1 2 3 4 5; do
  # The site deploys create gh-pages; metrics never do, so the root redirect
  # and .nojekyll always come from pages-publish.sh.
  git fetch -q --depth 1 origin "$branch" || {
    echo "::error::No $branch branch yet: deploy the site once first"
    exit 1
  }
  git checkout -q -B "$branch" FETCH_HEAD
  rm -rf "$folder"
  mkdir "$folder"
  cp "$site/index.html" "$site/runs.json" "$folder/"
  git add -A "$folder"
  if git diff --cached --quiet; then
    echo "$folder/ is already up to date"
    exit 0
  fi
  run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-0}"
  git commit -q -m "metrics: $runs runs" -m "Run: $run_url"
  if git push -q origin "HEAD:refs/heads/$branch"; then
    echo "Published $folder/ ($runs runs)"
    exit 0
  fi
  echo "Push rejected (attempt $attempt); retrying on the new $branch head"
  sleep $((attempt * 3))
done
echo "::error::Couldn't push to $branch after 5 attempts"
exit 1
