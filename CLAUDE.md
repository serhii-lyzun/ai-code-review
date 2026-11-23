# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a Vite + React + TypeScript template with tooling added: Prettier, Husky + lint-staged pre-commit hook, Jest unit tests, and team conventions in `CODE_CONVENTIONS.md` (based on the Rules of React). `src/App.tsx` is still the template's demo page. There is no application code, router, state management or backend yet. Don't assume any exists.

## Commands

- `npm run dev`: Vite dev server with HMR
- `npm run build`: type-check (`tsc -b`, project references) and then `vite build` into `dist/`
- `npm run lint`: Oxlint (config in `.oxlintrc.json`)
- `npm run preview`: serve the production build

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

## Toolchain specifics

- **React 19, Vite 8, TypeScript ~7.0** (the native Go-based compiler). `@vitejs/plugin-react` uses Oxc, not Babel. The React Compiler is not enabled.
- **Linting is Oxlint, not ESLint.** Plugins enabled: `react`, `typescript`, `oxc`. `react/rules-of-hooks` is an error, and `react/only-export-components` warns, so component files should only export components (constant exports are allowed). Type-aware linting is off. Turning it on requires `oxlint-tsgolint` and `"options": { "typeAware": true }`.
- **TS project references:** `tsconfig.json` references `tsconfig.app.json` (covers `src/`, DOM libs, `vite/client` types, test files excluded), `tsconfig.node.json` (covers only `vite.config.ts`, Node types) and `tsconfig.test.json` (extends the app config, covers test files and `src/test/`, Jest types). A new TypeScript config file at the root (`*.config.ts`) needs adding to `tsconfig.node.json`'s `include`. Plain-JS configs such as `jest.config.js` are not type-checked.
- **Strict compiler flags affect how code is written:**
  - `verbatimModuleSyntax`: type-only imports must use `import type`.
  - `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
  - `allowImportingTsExtensions`: local imports include the extension (`import App from './App.tsx'`), following the existing style.
  - `noUnusedLocals` and `noUnusedParameters` fail the build, not just the linter.
- Static assets in `public/` are served from the root (e.g. `/icons.svg#id` sprite references). Assets in `src/assets/` are imported as modules.
