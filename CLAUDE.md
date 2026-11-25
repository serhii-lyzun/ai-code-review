# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a Vite + React + TypeScript template with tooling added: Prettier, Husky + lint-staged pre-commit hook, Jest unit tests, and team conventions in `CODE_CONVENTIONS.md` (based on the Rules of React). `src/App.tsx` is still the template's demo page. There is no application code, router, state management or backend yet. Don't assume any exists.

## Commands

- `npm run dev`: Vite dev server with HMR
- `npm run build`: type-check (`tsc -b`, project references) and then `vite build` into `dist/`
- `npm run lint`: Oxlint (config in `.oxlintrc.json`)
- `npm run preview`: serve the production build
- `npm run test:scripts`: `node:test` tests for the Node scripts in `scripts/` (Jest only covers `src/`)

### Formatting & git hooks

- `npm run format`: Prettier, rewrites all files (config in `.prettierrc.json`: single quotes, no semicolons, trailing commas, 2-space indent; exclusions in `.prettierignore`)
- `npm run format:check`: Prettier check only, fails on unformatted files
- `npm run prepare`: installs the Husky hooks (runs automatically on `npm install`)
- The Husky pre-commit hook (`.husky/pre-commit`) runs `npx lint-staged`: staged `*.{ts,tsx,js,jsx}` get `oxlint --fix` then `prettier --write`, staged `*.{json,md,css,html,yml,yaml}` get `prettier --write`. Config lives in `package.json` under `lint-staged`.

### Unit tests (Jest)

- `npm test`: run all unit tests once; `npm run test:watch`: watch mode. Run a single file with `npx jest src/App.test.tsx`, or a single test with `-t '<name>'`.
- Config in `jest.config.js` (ESM, since `"type": "module"`): jsdom environment, TS/TSX transformed by `@swc/jest` (automatic React runtime; no ts-jest/Babel, and no type-checking during tests). Tests live next to the code as `src/**/*.test.{ts,tsx}`. CSS imports map to `identity-obj-proxy`, image/font imports to `src/test/fileStub.ts`. `src/test/setup.ts` loads `@testing-library/jest-dom` matchers.
- Use `@testing-library/react` (`render`, `screen`, `fireEvent`). Unit tests only: no e2e or coverage thresholds.
- Test files and `src/test/` are excluded from `tsconfig.app.json` and type-checked by `tsconfig.test.json` (adds `jest` and `@testing-library/jest-dom` types), which `npm run build` covers via `tsc -b`. They are never imported by `main.tsx`, so they are not in the Vite bundle.

## CI and AI code review

- `.github/workflows/ci.yml` runs `npm ci`, `lint`, `format:check`, `build` and `test` on every PR and on pushes to `main`. Node version comes from `.nvmrc`.
- `.github/workflows/ai-review.yml` runs Claude as a comment-only PR reviewer. It posts inline comments and a summary, and the `ai-review-gate` job fails on blocker/major findings. It is opt-in: it runs only on PRs labelled `ai-review`, and only when the repository variable `AI_AGENTS_ENABLED` is `true`. Without the label (or after removing it) the review is skipped and the gate passes. Adding or removing any other label never reviews: the gate repeats the commit's previous result, and fails while there is no passing result yet.
- Workflow: review locally with the reviewer agent before pushing, fix its findings (at most 3 review rounds; log the leftover minors as an issue), then add the `ai-review` label if you want the CI confirmation.
- `.github/workflows/ai-fix.yml` is the on-demand fixer. A human adds the `ai-fix` label to a PR that has an AI review of its current commit. Claude (Sonnet, `.claude/agents/fixer.md`) fixes the blocker/major findings. The workflow then runs `.github/scripts/ai-fix-diff-policy.sh` (only `src/` outside `src/test/` may change, no silencing comments, no deleted or weakened tests) and lint/build/tests, and pushes one `ai-fix: round N` commit as the `ai-fixer` GitHub App. The round that reaches `AI_MAX_FIX_ROUNDS` (3) adds `needs-human`; adding `ai-fix` after that only comments.
- `ai-fix.yml` has two jobs so the App token never shares a runner with code Claude ran: `fix` (no App secrets; Claude, checks, uploads a patch) and `push` (fresh runner, no npm; applies the patch, re-runs a policy copy taken before applying it, then commits and pushes). The App secrets `AI_FIXER_APP_ID` and `AI_FIXER_PRIVATE_KEY` live in the `ai-fixer` environment; add required reviewers there to approve each round by hand.
- Other opt-in AI workflows: `.github/workflows/security-review.yml` (`anthropics/claude-code-security-review`, only on PRs labelled `security-review`, not a required check) and `.github/workflows/claude.yml` (`@claude` mentions, **read-only**: it answers questions and explains or reviews code, but can't edit, commit or push; code changes go through `ai-fix`). `@claude` runs only when both the mention and the issue or PR come from the owner, a member or a collaborator. Both also need `AI_AGENTS_ENABLED=true`.
- The CI fixer loads `.claude/ci-fixer-settings.json` (deny rules plus the `.claude/hooks/protect-paths.mjs` PreToolUse hook). It is deliberately not `.claude/settings.json`, so local Claude Code sessions can still edit workflows and agent config.
- `.github/workflows/merge-gate.yml` classifies every PR with the base-branch copy of `scripts/risk-tier.mjs` and `policy/risk.json` and sets a `risk:low|medium|high` label. Low passes. Medium and high need one approval from a collaborator other than the author (approvals from other accounts don't count); the solo maintainer merges those with `--admin`. Paths in `.github/CODEOWNERS` also need code-owner review. The approval rule is enforced only once `merge-gate` is a required check in the `main` ruleset. An incomplete file list, or a classifier missing on the base branch, rates the PR high. A `needs-human` label fails it. With `AUTO_MERGE_ENABLED=true` it turns on auto-merge for low-risk PRs. Changing the tier rules means editing `policy/risk.json` and its tests in `scripts/risk-tier.test.mjs`.
- `main` is protected by a ruleset: PRs only, squash merges only, required checks `ci`, `ai-review-gate` and `merge-gate`, a CodeQL rule, resolved review threads, stale approvals dismissed on push, and code-owner review for the paths in `.github/CODEOWNERS`. Approvals by risk tier are `merge-gate`'s job: the ruleset itself requires none. Low-risk PRs merge normally, or auto-merge with `AUTO_MERGE_ENABLED=true`. The sole maintainer merges medium/high and code-owned PRs with `gh pr merge <n> --squash --admin`.
- `.github/workflows/deploy.yml` builds `main` once and promotes the same artifact dev → stg → prd through `deploy-env.yml`. Each environment is a folder (`/dev/`, `/stg/`, `/prd/`) on the `gh-pages` branch, served by GitHub Pages and smoke-tested over HTTP. prd waits for a required reviewer on the `prd` Environment; a `release-summary` job (deterministic notes plus an advisory Claude summary) writes what ships and the rollback command to the run summary first. Pushes that only touch docs, tests or agent/policy config skip the deploy, and an hourly schedule catches up on auto-merged PRs (their merge, made through `GITHUB_TOKEN`, starts no push run). `rollback.yml` restores an earlier site from the `gh-pages` history (`target=previous|current|<sha>`). The scripts live in `.github/scripts/` (`pages-*.sh`, `smoke-test.sh`, `deploy-plan.sh`, `release-notes.sh`).
- Feature flags: the app reads `flags.json` next to `index.html` once, before the first render (`src/flags/flags.ts`, passed to `App` as the `flags` prop). Missing, invalid or non-boolean values mean off. The repo ships `public/flags.json` as `{}`; each deploy writes the environment's `FEATURE_FLAGS` variable instead. To turn a feature off in prd without a code change, change that variable and run `rollback.yml` with `target=current`.
- Review rules live in `REVIEW.md` (severity scale, what to check and ignore). The reviewer prompt is `.claude/agents/reviewer.md` and its output schema is `.claude/schemas/review-findings.json`. The same subagent reviews local changes (ask Claude Code to "use the reviewer agent").
- The full roadmap (fixer agent, auto-merge, environments, production bug pipeline) is in `AI_CODE_REVIEW_PLAN.md`.

## Toolchain specifics

- **React 19, Vite 8, TypeScript ~7.0** (the native Go-based compiler). `@vitejs/plugin-react` uses Oxc, not Babel. The React Compiler is not enabled.
- **Linting is Oxlint, not ESLint.** Plugins enabled: `react`, `typescript`, `oxc`. `react/rules-of-hooks` is an error, and `react/only-export-components` warns, so component files should only export components (constant exports are allowed). Type-aware linting is off. Turning it on requires `oxlint-tsgolint` and `"options": { "typeAware": true }`.
- **TS project references:** `tsconfig.json` references `tsconfig.app.json` (covers `src/`, DOM libs, `vite/client` types, test files excluded), `tsconfig.node.json` (covers only `vite.config.ts`, Node types) and `tsconfig.test.json` (extends the app config, covers test files and `src/test/`, Jest types). A new TypeScript config file at the root (`*.config.ts`) needs adding to `tsconfig.node.json`'s `include`. Plain-JS configs such as `jest.config.js` are not type-checked.
- **Strict compiler flags affect how code is written:**
  - `verbatimModuleSyntax`: type-only imports must use `import type`.
  - `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
  - `allowImportingTsExtensions`: local imports include the extension (`import App from './App.tsx'`), following the existing style.
  - `noUnusedLocals` and `noUnusedParameters` fail the build, not just the linter.
- Vite builds with `base: './'`, so the same `dist/` works from any folder (`/dev/`, `/stg/`, `/prd/`). Reference files in `public/` with relative URLs (e.g. `icons.svg#id`, not `/icons.svg#id`), and fetch runtime files such as `flags.json` relatively too. Assets in `src/assets/` are imported as modules.
