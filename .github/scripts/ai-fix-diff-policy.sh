#!/usr/bin/env bash
# Checks the AI fixer's staged changes before they are committed.
# Run after `git add -A`. Exits 1 with a list of violations, 0 when clean.
#
# Rules:
#   1. Only files under src/ may change, and not src/test/ (Jest setup and stubs)
#      or dotfiles such as .gitattributes (they change how git and GitHub show diffs).
#   1b. No binary files, symlinks or file-type changes (they hide content from 2).
#   2. No added lines that silence tooling or skip tests.
#   3. No test files deleted (renames count as delete + add).
#   4. No test file loses `expect(` assertions.
set -euo pipefail

# Unquoted non-ASCII paths; renames reported as delete + add; always a text
# diff, never textconv or external diff drivers.
diff_cached() {
  git -c core.quotePath=false diff --cached --no-renames --text --no-textconv --no-ext-diff "$@"
}

violations=()

changed=$(diff_cached --name-only)
if [ -z "$changed" ]; then
  echo "No changes."
  exit 0
fi

while IFS= read -r file; do
  case "$file" in
    src/test/*) violations+=("changed Jest setup or stubs: $file") ;;
    src/.* | src/*/.*) violations+=("changed a dotfile: $file") ;;
    src/*) ;;
    *) violations+=("changed a file outside src/: $file") ;;
  esac
done <<< "$changed"

# Binary files show as "-<TAB>-" in numstat; symlinks and type changes as
# mode 120000 or status T.
while IFS=$'\t' read -r adds dels file; do
  if [ "$adds" = "-" ] && [ "$dels" = "-" ]; then violations+=("binary file: $file"); fi
done < <(git -c core.quotePath=false diff --cached --no-renames --numstat)
# Captured first: `git ... | grep -q` under pipefail can fail with SIGPIPE.
summary=$(git diff --cached --no-renames --summary)
if grep -q 'mode 120000' <<< "$summary"; then
  violations+=("added or changed a symlink")
fi
type_changed=$(diff_cached --name-only --diff-filter=T || true)
if [ -n "$type_changed" ]; then
  while IFS= read -r file; do violations+=("changed the file type of $file"); done <<< "$type_changed"
fi

# Added lines, without the "+++ b/file" headers.
added=$(diff_cached --unified=0 --no-color | grep -E '^\+' | grep -vE '^\+\+\+ (b/|/dev/null)' || true)
for pattern in '@ts-ignore' '@ts-expect-error' '@ts-nocheck' '(oxlint|eslint)-disable' \
  '\b(it|test|describe)(\.concurrent)?\.(only|skip|todo)\(' '\bx(it|test|describe)\('; do
  if grep -Eq "$pattern" <<< "$added"; then
    violations+=("added a line matching /$pattern/")
  fi
done

deleted_tests=$(diff_cached --name-only --diff-filter=D | grep -E '\.test\.[jt]sx?$' || true)
if [ -n "$deleted_tests" ]; then
  while IFS= read -r file; do violations+=("deleted a test file: $file"); done <<< "$deleted_tests"
fi

modified_tests=$(diff_cached --name-only --diff-filter=M | grep -E '\.test\.[jt]sx?$' || true)
if [ -n "$modified_tests" ]; then
  while IFS= read -r file; do
    before=$(git show "HEAD:$file" | grep -o 'expect(' | wc -l | tr -d ' ')
    after=$(git show ":$file" | grep -o 'expect(' | wc -l | tr -d ' ')
    if [ "$after" -lt "$before" ]; then
      violations+=("reduced expect( assertions in $file from $before to $after")
    fi
  done <<< "$modified_tests"
fi

if [ "${#violations[@]}" -gt 0 ]; then
  echo "AI fix diff policy violations:"
  printf '  - %s\n' "${violations[@]}"
  exit 1
fi

echo "Diff policy passed for $(wc -l <<< "$changed" | tr -d ' ') file(s)."
