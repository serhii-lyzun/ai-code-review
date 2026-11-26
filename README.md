# AI Code Review

An educational React + TypeScript + Vite app used to build and test an AI code-review workflow on GitHub with Claude.
The full design, rollout status and lessons learned are in [`AI_CODE_REVIEW_PLAN.md`](AI_CODE_REVIEW_PLAN.md).

## How a pull request moves

1. **Review locally first.** Ask Claude Code to "use the reviewer agent on this branch". It applies `REVIEW.md`, so
   its verdict predicts the CI gate, and it costs no API spend.
2. **Open the PR.** `ci` (lint, format, build, tests) and CodeQL always run. `merge-gate` labels the PR `risk:low`,
   `risk:medium` or `risk:high` and decides how much human review it needs.
3. **Opt in to AI checks with labels:**

   | Label             | What it does                                                                            |
   | ----------------- | --------------------------------------------------------------------------------------- |
   | `ai-review`       | Claude reviews the PR. `ai-review-gate` fails on blocker or major findings.             |
   | `ai-fix`          | One fix round: Claude fixes blocker/major findings, and the `ai-fixer` App pushes them. |
   | `security-review` | A dedicated Claude security pass, posted as PR comments.                                |

   On **issues**, `sentry` (set by Sentry's GitHub integration) starts an AI triage comment, and `ai-fixable` lets
   Claude write a failing test and a fix and open a `hotfix/issue-<n>` PR, which then goes through the steps above.

   Mention `@claude` in a comment for a read-only answer or explanation.

4. **Merge.** Low-risk PRs can auto-merge once every required check passes. Medium and high PRs need a human
   decision, and agents never merge on their own.

5. **Deploy.** Every change to `main` that can change the site is built once and promoted through GitHub Pages:
   [dev](https://serhii-lyzun.github.io/ai-code-review/dev/), then
   [stg](https://serhii-lyzun.github.io/ai-code-review/stg/), then
   [prd](https://serhii-lyzun.github.io/ai-code-review/prd/), with a smoke test after each. prd waits for a human
   approval on the `Deploy` run, whose summary lists what ships and how to roll it back. If prd breaks, roll back first:
   `gh workflow run rollback.yml -f environment=prd -f target=previous`.

All AI workflows stop when the repository variable `AI_AGENTS_ENABLED` is `false`.

## Development

```bash
npm install
npm run dev            # Vite dev server
npm test               # Jest unit tests
npm run test:scripts   # tests for the CI scripts in scripts/
npm run lint && npm run build
```

## Template notes

The rest of this file is from the original Vite template.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
