#!/usr/bin/env bash
# Publishes a built site into one environment folder of the gh-pages branch,
# which GitHub Pages serves: /dev/, /stg/ and /prd/. The root only redirects
# to prd/. Only that environment's folder changes, so concurrent deploys to
# different environments can't overwrite each other (a rejected push is
# retried on top of the new branch head).
#
# Usage: pages-publish.sh <dev|stg|prd> <site-dir> <app-sha> [deploy|rollback]
#   site-dir  the built site; its version.json must name <app-sha>
#   kind      deploy (default) or rollback. A rollback records the SHA it
#             replaced ("from"), so rollback.yml never goes back to it.
# Env:
#   GH_TOKEN       token with contents: write (unless PAGES_REMOTE is set)
#   FEATURE_FLAGS  the environment's flags as a JSON object of booleans,
#                  written to flags.json. Empty means no flags.
#   PAGES_REMOTE   git remote to push to (default: this repo on GitHub)
# Writes url=<environment URL> and flags=<flags.json content> to $GITHUB_OUTPUT
# when it is set.
set -euo pipefail

env_name=${1:?usage: pages-publish.sh <env> <site-dir> <app-sha> [kind]}
site=$(cd "${2:?site-dir missing}" && pwd)
sha=${3:?app-sha missing}
kind=${4:-deploy}
branch=gh-pages
here=$(cd "$(dirname "$0")" && pwd)

case "$env_name" in dev | stg | prd) ;; *)
  echo "::error::Unknown environment '$env_name'"
  exit 1
  ;;
esac
case "$kind" in deploy | rollback) ;; *)
  echo "::error::Unknown kind '$kind'"
  exit 1
  ;;
esac
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Expected a full commit SHA, got '$sha'"
  exit 1
}
[ -f "$site/index.html" ] || {
  echo "::error::$site has no index.html"
  exit 1
}
built=$(jq -r '.sha // empty' "$site/version.json" 2>/dev/null || true)
if [ "$built" != "$sha" ]; then
  echo "::error::$site/version.json names '${built:-nothing}', expected $sha"
  exit 1
fi

# Invalid flags fail the deploy before anything is published.
if ! flags=$(printf '%s' "${FEATURE_FLAGS:-}" | jq -cs '
    if length == 0 then {}
    elif length == 1 and (.[0] | type) == "object"
      and all(.[0][]; type == "boolean") then .[0]
    else error("FEATURE_FLAGS must be one JSON object of booleans") end'); then
  echo "::error::FEATURE_FLAGS must be a JSON object of booleans, e.g. {\"releaseBanner\":true}"
  exit 1
fi

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
  # Same mechanism as actions/checkout: the token never appears in a URL.
  auth=$(printf 'x-access-token:%s' "${GH_TOKEN:?GH_TOKEN is not set}" | base64 | tr -d '\n')
  echo "::add-mask::$auth"
  git config http.https://github.com/.extraheader "AUTHORIZATION: basic $auth"
fi

pushed=false
for attempt in 1 2 3 4 5; do
  # ls-remote exits 2 when the branch doesn't exist yet (first deploy).
  status=0
  git ls-remote --exit-code --heads origin "$branch" > /dev/null || status=$?
  if [ "$status" = 0 ]; then
    git fetch -q --depth 1 origin "$branch"
    git checkout -q -B "$branch" FETCH_HEAD
  elif [ "$status" = 2 ]; then
    git checkout -q --orphan "$branch"
    git rm -rqf --ignore-unmatch .
  else
    echo "::error::Can't reach the $branch branch (git ls-remote exit $status)"
    exit 1
  fi

  previous=$(jq -r '.sha // empty' "$env_name/version.json" 2>/dev/null || true)
  # Rollback-kind entries (with or without "from") never count as a deploy in
  # deploy-plan.sh, so a flags redeploy (target=current) after a rollback
  # doesn't let the hourly schedule undo that rollback.
  if [ "$kind" = rollback ] && [ -n "$previous" ] && [ "$previous" != "$sha" ]; then
    subject="rollback($env_name): $sha (from $previous)"
  elif [ "$kind" = rollback ]; then
    subject="rollback($env_name): $sha"
  elif [ "$previous" = "$sha" ]; then
    subject="redeploy($env_name): $sha"
  else
    subject="deploy($env_name): $sha"
  fi

  touch .nojekyll
  cat > index.html <<'HTML'
<!doctype html>
<meta charset="utf-8" />
<title>ai-code-review</title>
<meta http-equiv="refresh" content="0; url=prd/" />
<p><a href="prd/">prd</a> · <a href="stg/">stg</a> · <a href="dev/">dev</a></p>
HTML
  rm -rf "$env_name"
  mkdir "$env_name"
  cp -R "$site/." "$env_name/"
  printf '%s\n' "$flags" > "$env_name/flags.json"

  git add -A
  if git diff --cached --quiet; then
    echo "$env_name already serves exactly this site; nothing to publish"
    pushed=true
    break
  fi
  run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-0}"
  git commit -q -m "$subject" -m "Flags: $flags" -m "Run: $run_url"
  if git push -q origin "HEAD:refs/heads/$branch"; then
    echo "Published: $subject"
    pushed=true
    break
  fi
  echo "Push rejected (attempt $attempt); retrying on the new $branch head"
  sleep $((attempt * 3))
done
$pushed || {
  echo "::error::Couldn't push to $branch after 5 attempts"
  exit 1
}

url=$("$here/pages-url.sh" "$env_name")
echo "URL: $url"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "url=$url"
    echo "flags=$flags"
  } >> "$GITHUB_OUTPUT"
fi
