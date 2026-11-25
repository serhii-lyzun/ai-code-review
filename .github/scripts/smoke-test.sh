#!/usr/bin/env bash
# Smoke-tests one deployed environment over HTTP:
#   1. waits until version.json serves <app-sha> and, when given, flags.json
#      serves <flags> (GitHub Pages takes a minute or two to build after a push
#      to gh-pages; a flags-only redeploy keeps the same SHA),
#   2. index.html loads and has the React root,
#   3. every ./assets/... file index.html references loads,
#   4. flags.json is a JSON object.
# It checks that the files are served, not that the app renders in a browser.
#
# Usage: smoke-test.sh <environment-url> <app-sha> [flags-json]
# Env: SMOKE_TIMEOUT seconds to wait for step 1 (default 600)
set -euo pipefail
url=${1:?usage: smoke-test.sh <url> <app-sha>}
url=${url%/}/
sha=${2:?app-sha missing}
want_flags=$(jq -cS . <<< "${3:-null}")
timeout=${SMOKE_TIMEOUT:-600}

# A new query string per request skips the Pages CDN cache.
get() { curl -fsSL --retry 2 --max-time 20 "$url$1?smoke=$(date +%s)$RANDOM"; }

deadline=$((SECONDS + timeout))
while :; do
  live=$(get version.json 2> /dev/null | jq -r '.sha // empty' 2> /dev/null || true)
  live_flags=null
  if [ "$want_flags" != null ]; then
    live_flags=$(get flags.json 2> /dev/null | jq -cS . 2> /dev/null || echo none)
  fi
  [ "$live" = "$sha" ] && [ "$live_flags" = "$want_flags" ] && break
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::error::$url still serves ${live:-nothing} (flags $live_flags) after ${timeout}s, expected $sha (flags $want_flags)"
    exit 1
  fi
  echo "Waiting for $url to serve ${sha:0:7} (now: ${live:-nothing}, flags $live_flags)"
  sleep 10
done
echo "ok version.json: $sha${3:+, flags.json: $want_flags}"

html=$(get '')
grep -q '<div id="root"></div>' <<< "$html" || {
  echo "::error::$url index.html has no React root"
  exit 1
}
echo "ok index.html"

assets=$(grep -oE '(src|href)="\./assets/[^"]+"' <<< "$html" | sed -E 's/^(src|href)="\.\///; s/"$//' | sort -u)
[ -n "$assets" ] || {
  echo "::error::$url index.html references no ./assets/ files"
  exit 1
}
for asset in $assets; do
  get "$asset" > /dev/null || {
    echo "::error::$url$asset doesn't load"
    exit 1
  }
  echo "ok $asset"
done

get flags.json | jq -e 'type == "object"' > /dev/null || {
  echo "::error::$url flags.json isn't a JSON object"
  exit 1
}
echo "ok flags.json"
echo "Smoke test passed: $url"
