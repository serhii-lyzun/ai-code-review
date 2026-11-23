# Review Guidelines

The rules every reviewer of this repo follows, human or AI. The AI reviewer (`.claude/agents/reviewer.md`) loads this
file on every run, so changing it changes how PRs are reviewed. Treat edits to it like code changes.

## What a review is for

Find problems that would hurt users or future maintainers **and that the automated checks miss**. CI already runs
Oxlint, Prettier, `tsc -b` (strict flags) and Jest. Don't repeat what they report.

## Severity scale

| Severity    | Meaning                                                                                                     | Blocks merge? |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| **blocker** | Will break users or data: crash, wrong result, security hole, data loss, broken build path CI doesn't cover | Yes           |
| **major**   | Real bug in an edge case, a broken Rule of React, a missing test for new behavior, an unhandled error path  | Yes           |
| **minor**   | Works, but is fragile, unclear or inconsistent with the codebase; worth fixing in this PR                   | No            |
| **nit**     | Taste: naming, small readability tweaks. Group these into one summary bullet                                | No            |

Every finding also gets a **confidence** from 0 to 1. Report only findings with confidence of 0.7 or higher. If you aren't
sure something is a bug, say what would confirm it instead of asserting it.

## What to check, in priority order

1. **Correctness.** Logic errors, off-by-one, wrong conditions, unhandled `null`/`undefined`, async races, stale closures,
   missing cleanup in effects, wrong dependency arrays.
2. **Rules of React** (`CODE_CONVENTIONS.md`). Impure render (non-deterministic reads, side effects, DOM writes),
   mutating props/state/hook values, calling components as functions, hooks passed as values. Lint doesn't catch these.
3. **Security.** `dangerouslySetInnerHTML` or other unsanitized HTML, `target="_blank"` without `rel="noopener"`,
   secrets or tokens in code, user input in URLs, `eval`/`new Function`, unsafe new dependencies.
4. **Tests.** New or changed behavior has a test next to the code (`*.test.tsx`). Tests assert behavior with Testing
   Library queries, not implementation details. No test was deleted or weakened without a reason in the PR description.
5. **Types.** No `any` without a reason, no `as` casts that hide a real mismatch, no `@ts-ignore` / `@ts-expect-error`
   or `oxlint-disable` without an explanatory comment.
6. **Accessibility.** Interactive elements are buttons or links, images have `alt`, form inputs have labels.
7. **Maintainability.** Duplicated logic, dead code, misleading names, components doing too many things.

## What not to comment on

- Formatting, import order, semicolons, quotes: Prettier owns these.
- Anything Oxlint or `tsc` already reports.
- Personal style preferences that `CODE_CONVENTIONS.md` doesn't state.
- Code the PR doesn't touch, unless the change makes it newly broken.

## How to write a comment

- Anchor it to the exact line. One problem per comment.
- State the problem, why it matters (the failure scenario), and a concrete fix. Include a code suggestion when it's short.
- Be direct and neutral. No praise padding, no "consider maybe".
- At most 10 inline comments per review. If there are more, keep the most severe and mention the rest in the summary.

## Verdict

- **pass**: no blocker or major findings.
- **changes_requested**: at least one blocker or major finding.

Reviewers never approve or merge. Approval is a human decision (see `AI_CODE_REVIEW_PLAN.md` §7).
