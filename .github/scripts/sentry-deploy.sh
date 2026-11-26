#!/usr/bin/env bash
# Tells Sentry that <release> is now live in <environment>, so its issues show
# which deploy they started in and "resolved in next release" works per
# environment. Called by deploy-env.yml after the smoke test, for deploys and
# rollbacks alike.
#
# Advisory: it never fails the deploy. A missing token or config, or an error
# from Sentry (e.g. a release from before Sentry was set up), is a warning.
#
# Usage: sentry-deploy.sh <environment> <release-sha> [url]
# Env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_URL (default https://sentry.io/)
set -uo pipefail
environment=${1:?usage: sentry-deploy.sh <environment> <release> [url]}
release=${2:?release missing}
url=${3:-}
base=${SENTRY_URL:-https://sentry.io/}
base=${base%/}

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ]; then
  echo "::warning::Not recording the deploy in Sentry: SENTRY_AUTH_TOKEN or SENTRY_ORG is missing"
  exit 0
fi
if ! [[ "$release" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::warning::Not recording the deploy in Sentry: '$release' isn't a commit SHA"
  exit 0
fi

body=$(jq -n --arg env "$environment" --arg url "$url" \
  '{environment: $env} + (if $url == "" then {} else {url: $url} end)')
# The token goes in through a config on stdin, so it isn't in the process list.
status=$(curl -sS -o "${RUNNER_TEMP:-/tmp}/sentry-deploy.json" -w '%{http_code}' --max-time 20 \
  -K - -X POST "$base/api/0/organizations/$SENTRY_ORG/releases/$release/deploys/" \
  -H 'Content-Type: application/json' --data "$body" \
  <<< "header = \"Authorization: Bearer $SENTRY_AUTH_TOKEN\"") || status=000

if [ "$status" = 201 ] || [ "$status" = 200 ]; then
  echo "Recorded ${release:0:7} as deployed to $environment in Sentry"
else
  echo "::warning::Sentry didn't record the $environment deploy of ${release:0:7} (HTTP $status). Releases from before Sentry was set up don't exist there."
fi
exit 0
