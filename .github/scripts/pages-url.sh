#!/usr/bin/env bash
# Prints the GitHub Pages URL of one environment folder, with a trailing slash.
# Usage: pages-url.sh <dev|stg|prd>
# PAGES_BASE_URL overrides the default https://<owner>.github.io/<repo>/
# (for a custom domain, or for local tests).
set -euo pipefail
env_name=${1:?usage: pages-url.sh <dev|stg|prd>}
if [ -n "${PAGES_BASE_URL:-}" ]; then
  base=${PAGES_BASE_URL%/}/
else
  repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}
  owner=$(printf '%s' "${repo%%/*}" | tr '[:upper:]' '[:lower:]')
  base="https://$owner.github.io/${repo#*/}/"
fi
printf '%s%s/\n' "$base" "$env_name"
