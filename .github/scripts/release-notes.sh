#!/usr/bin/env bash
# Writes the release notes for a prd promotion as Markdown on stdout: what is
# live, what is coming, the PRs with their risk tier and AI-fix rounds, and the
# rollback command. Deterministic: the AI summary in deploy.yml is added on
# top of this and never replaces it.
#
# Usage: release-notes.sh <live-sha or empty> <candidate-sha>
# Env: GH_TOKEN (pull-requests: read), GITHUB_REPOSITORY. Full git history.
set -euo pipefail
live=${1:-}
sha=${2:?usage: release-notes.sh <live-sha> <candidate-sha>}
repo=${GITHUB_REPOSITORY:?}
esc() { sed 's/|/\\|/g'; }

if [ -n "$live" ] && git cat-file -e "$live^{commit}" 2> /dev/null; then
  range="$live..$sha"
  from="\`${live:0:7}\`"
else
  range="$sha~20..$sha"
  git cat-file -e "$sha~20" 2> /dev/null || range=$sha
  from="unknown; showing up to 20 recent commits"
  [ -z "$live" ] || from="${live:0:7} (not in this history); showing up to 20 recent commits"
fi
count=$(git rev-list --count "$range")

echo "## Release \`${sha:0:7}\` → prd"
echo
echo "**Live in prd:** $from · **Candidate:** \`${sha:0:7}\` · **Commits:** $count · **Diff:** $(git diff --shortstat "${range%..*}" "$sha" 2> /dev/null | sed 's/^ //' || echo n/a)"
echo
if [ "$count" = 0 ]; then
  echo "No new commits: this redeploys what prd already serves."
else
  echo "| PR | Title | Risk | Author | AI-fix rounds |"
  echo "| --- | --- | --- | --- | --- |"
  git log --format='%H%x09%s' "$range" | while IFS=$'\t' read -r commit subject; do
    pr=$(sed -nE 's/.*\(#([0-9]+)\)$/\1/p' <<< "$subject")
    if [ -z "$pr" ]; then
      echo "| \`${commit:0:7}\` | $(esc <<< "$subject") | (no PR) | | |"
      continue
    fi
    info=$(gh pr view "$pr" --repo "$repo" --json title,author,labels \
      --jq '[.title, .author.login, ([.labels[].name | select(startswith("risk:"))] | join(" ") | if . == "" then "?" else . end)] | @tsv' 2> /dev/null || true)
    if [ -z "$info" ]; then
      echo "| #$pr | $(esc <<< "$subject") | ? | ? | ? |"
      continue
    fi
    IFS=$'\t' read -r title author risk <<< "$info"
    if commits=$(gh api --paginate "repos/$repo/pulls/$pr/commits" \
      --jq '.[] | select(.commit.message | startswith("ai-fix:")) | .sha' 2> /dev/null); then
      rounds=$(grep -c . <<< "$commits" || true)
    else
      rounds='?'
    fi
    echo "| #$pr | $(esc <<< "$title") | $risk | @$author | $rounds |"
  done
fi
echo
if [ -n "$live" ]; then
  echo "**Rollback** (if prd breaks after approval): \`gh workflow run rollback.yml -f environment=prd -f target=previous\`, which restores \`${live:0:7}\`."
else
  echo "**Rollback:** none possible, this is the first prd deployment."
fi
