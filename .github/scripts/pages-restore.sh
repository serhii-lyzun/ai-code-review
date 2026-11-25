#!/usr/bin/env bash
# Restores an environment folder from the gh-pages history, for rollback.yml.
# Every deploy is a gh-pages commit, so this is the exact site that was live
# then (no rebuild, no expired artifacts). flags.json is dropped: the deploy
# writes the environment's current FEATURE_FLAGS.
#
# Usage: pages-restore.sh <dev|stg|prd> <target> <out-dir>
#   target  previous  the newest earlier deployment that wasn't rolled back
#                     from (so two rollbacks in a row go further back instead
#                     of returning to the broken release)
#           current   what is live now (redeploy, e.g. after a FEATURE_FLAGS change)
#           <sha>     any app commit (7+ hex chars) deployed to this environment before
# Prints the app SHA it restored, and writes sha=<it> to $GITHUB_OUTPUT when set.
# Run inside a clone of the repository; it fetches the full gh-pages history.
set -euo pipefail
env_name=${1:?usage: pages-restore.sh <env> <target> <out-dir>}
target=${2:?target missing}
out=${3:?out-dir missing}
case "$env_name" in dev | stg | prd) ;; *)
  echo "::error::Unknown environment '$env_name'"
  exit 1
  ;;
esac

git fetch -q origin "+refs/heads/gh-pages:refs/remotes/origin/gh-pages"

# "<gh-pages commit> <app sha> <rolled back from or ->", newest first.
history=$(git log --format='%H %s' origin/gh-pages | sed -nE \
  "s/^([0-9a-f]{40}) (deploy|redeploy|rollback)\\($env_name\\): ([0-9a-f]{40})( \\(from ([0-9a-f]{40})\\))?\$/\\1 \\3 \\5/p" |
  awk '{ print $1, $2, ($3 == "" ? "-" : $3) }')
[ -n "$history" ] || {
  echo "::error::Nothing was ever deployed to $env_name"
  exit 1
}
current=$(head -n 1 <<< "$history" | cut -d' ' -f2)

case "$target" in
  current)
    pick=$(head -n 1 <<< "$history")
    ;;
  previous)
    bad=$(awk '$3 != "-" { print $3 }' <<< "$history" | sort -u)
    # Multi-line values go through ENVIRON: BWK awk (macOS) rejects them in -v.
    pick=$(BAD="$bad" awk -v cur="$current" '
      BEGIN { n = split(ENVIRON["BAD"], b, "\n"); for (i = 1; i <= n; i++) skip[b[i]] = 1 }
      $2 != cur && !($2 in skip) { print; exit }' <<< "$history")
    [ -n "$pick" ] || {
      echo "::error::$env_name has no earlier deployment to go back to (live: ${current:0:7})"
      exit 1
    }
    ;;
  *)
    [[ "$target" =~ ^[0-9a-f]{7,40}$ ]] || {
      echo "::error::target must be previous, current or a commit SHA (got '$target')"
      exit 1
    }
    matches=$(awk -v t="$target" 'index($2, t) == 1 { print $2 }' <<< "$history" | sort -u)
    case $(grep -c . <<< "$matches" || true) in
      0)
        echo "::error::${target} was never deployed to $env_name"
        exit 1
        ;;
      1) ;;
      *)
        echo "::error::$target matches more than one deployed commit; use more characters"
        exit 1
        ;;
    esac
    pick=$(awk -v s="$matches" '$2 == s { print; exit }' <<< "$history")
    ;;
esac

commit=$(cut -d' ' -f1 <<< "$pick")
sha=$(cut -d' ' -f2 <<< "$pick")
mkdir -p "$out"
git archive "$commit" "$env_name" | tar -x -C "$out" --strip-components 1
rm -f "$out/flags.json"
echo "Restoring $env_name to ${sha:0:7} (gh-pages ${commit:0:7}; live now: ${current:0:7})"
echo "$sha"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "sha=$sha"
    echo "current=$current"
  } >> "$GITHUB_OUTPUT"
fi
