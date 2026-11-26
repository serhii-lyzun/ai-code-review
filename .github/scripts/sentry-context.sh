#!/usr/bin/env bash
# Writes the context the triage and bugfix agents read, so they need no
# GitHub or Sentry access of their own:
#   issue.json           the GitHub issue (number, title, body, labels, author)
#   related-issues.json  other issues labelled `sentry`, to spot duplicates
#   recent-commits.txt   the last 40 commits on the checked-out branch, with files
#   sentry.json          the linked Sentry issue and its latest event, trimmed
#                        to what a fix needs: exception, in-app frames with
#                        source context, breadcrumbs, release, environment.
#                        No request, user or cookie data. `status` says why
#                        anything is missing: ok | no-link | no-token | error.
# Every file is untrusted data (issue text, error messages, breadcrumbs).
#
# The Sentry issue comes from a link in the issue body, as written by the
# Sentry GitHub integration ("Sentry Issue: [SHORT-ID](https://<org>.sentry.io/issues/<id>/...)").
# It is fetched through the org-scoped API, so a link to another org fails.
# Writes sentry_short_id=<SHORT-ID or empty> to $GITHUB_OUTPUT when set.
#
# Usage: sentry-context.sh <issue-number> <out-dir>
# Env: GH_TOKEN, REPO (owner/name); optional SENTRY_TOKEN (read-only scopes:
#      org:read, project:read, event:read), SENTRY_ORG, SENTRY_URL.
set -euo pipefail
issue=${1:?usage: sentry-context.sh <issue-number> <out-dir>}
out=${2:?out-dir missing}
repo=${REPO:?REPO missing}
base=${SENTRY_URL:-https://sentry.io/}
base=${base%/}
mkdir -p "$out"

gh issue view "$issue" --repo "$repo" \
  --json number,title,body,labels,author,createdAt,url \
  --jq '{number, title, body, url, createdAt, author: .author.login, labels: [.labels[].name]}' \
  > "$out/issue.json"

gh issue list --repo "$repo" --label sentry --state all --limit 50 \
  --json number,title,state,createdAt \
  --jq "[.[] | select(.number != $issue)]" > "$out/related-issues.json"

git log -n 40 --date=short --format='commit %h %ad %s' --name-only > "$out/recent-commits.txt"

write_status() {
  jq -n --arg status "$1" --arg detail "$2" '{status: $status, detail: $detail}' > "$out/sentry.json"
  echo "Sentry context: $1 ($2)"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "sentry_short_id=" >> "$GITHUB_OUTPUT"
  exit 0
}

host_re='https://([A-Za-z0-9-]+\.)*sentry\.io'
if [ -n "${SENTRY_URL:-}" ]; then
  host_re="($host_re|$(sed 's/[].[^$*+?(){}|\\]/\\&/g' <<< "$base"))"
fi
sentry_id=$(jq -r '.body // ""' "$out/issue.json" |
  grep -oE "$host_re/(organizations/[A-Za-z0-9_-]+/)?issues/[0-9]+" | head -n 1 |
  grep -oE '[0-9]+$' || true)
[ -n "$sentry_id" ] || write_status no-link "the issue body has no Sentry issue link"
if [ -z "${SENTRY_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ]; then
  write_status no-token "SENTRY_TRIAGE_TOKEN or SENTRY_ORG isn't set, so Sentry issue $sentry_id wasn't fetched"
fi

# The token goes in through a config on stdin, so it isn't in the process list.
sentry_get() {
  curl -fsS --max-time 30 -K - "$base/api/0/organizations/$SENTRY_ORG/$1" \
    <<< "header = \"Authorization: Bearer $SENTRY_TOKEN\""
}
tmp=$(mktemp -d)
sentry_get "issues/$sentry_id/" > "$tmp/issue.json" ||
  write_status error "couldn't fetch Sentry issue $sentry_id from org $SENTRY_ORG"
sentry_get "issues/$sentry_id/events/latest/" > "$tmp/event.json" ||
  write_status error "couldn't fetch the latest event of Sentry issue $sentry_id"

jq -n --slurpfile issue "$tmp/issue.json" --slurpfile event "$tmp/event.json" '
  ($issue[0]) as $i | ($event[0]) as $e |
  def release_of: if type == "object" then .version else . end;
  def short: if type == "string" and length > 2000 then .[:2000] + "…" else . end;
  {
    status: "ok",
    detail: "",
    issue: {
      id: $i.id, shortId: $i.shortId, title: ($i.title | short), culprit: $i.culprit,
      level: $i.level, status: $i.status, count: $i.count, userCount: $i.userCount,
      firstSeen: $i.firstSeen, lastSeen: $i.lastSeen, permalink: $i.permalink,
      firstRelease: ($i.firstRelease | release_of), lastRelease: ($i.lastRelease | release_of)
    },
    event: {
      id: $e.eventID, dateCreated: $e.dateCreated,
      release: ($e.release | release_of),
      tags: [($e.tags // [])[] | select(.key | IN("environment", "release", "browser", "browser.name",
              "os", "os.name", "level", "handled", "mechanism", "transaction")) | {(.key): .value}] | add,
      exceptions: [($e.entries // [])[] | select(.type == "exception") | .data.values[]? | {
        type, value: (.value | short), mechanism: .mechanism.type, handled: .mechanism.handled,
        frames: [(.stacktrace.frames // [])[-30:][] | {
          file: (.filename // .absPath), function, line: .lineNo, column: .colNo, inApp,
          context: [(.context // [])[] | "\(.[0]): \(.[1] | short)"]
        }]
      }],
      breadcrumbs: [($e.entries // [])[] | select(.type == "breadcrumbs") | .data.values[-20:][]? |
        {timestamp, category, level, message: (.message | short)}]
    }
  }' > "$out/sentry.json"
rm -rf "$tmp"

short_id=$(jq -r '.issue.shortId // ""' "$out/sentry.json")
[[ "$short_id" =~ ^[A-Z0-9_-]+$ ]] || short_id=""
echo "Sentry context: ok ($short_id, $(jq '[.event.exceptions[].frames[]] | length' "$out/sentry.json") frames)"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "sentry_short_id=$short_id" >> "$GITHUB_OUTPUT"
exit 0
