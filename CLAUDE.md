# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a fresh, unmodified Vite + React + TypeScript template (single `init` commit). `src/App.tsx` is still the template's demo page. There is no application code, router, state management, backend or test setup yet. Don't assume any exists.

## Commands

- `npm run dev`: Vite dev server with HMR
- `npm run build`: type-check (`tsc -b`, project references) and then `vite build` into `dist/`
- `npm run lint`: Oxlint (config in `.oxlintrc.json`)
- `npm run preview`: serve the production build

There is no test runner. If tests are needed, add one (e.g. Vitest) before writing tests.

## Toolchain specifics

- **React 19, Vite 8, TypeScript ~7.0** (the native Go-based compiler). `@vitejs/plugin-react` uses Oxc, not Babel. The React Compiler is not enabled.
- **Linting is Oxlint, not ESLint.** Plugins enabled: `react`, `typescript`, `oxc`. `react/rules-of-hooks` is an error, and `react/only-export-components` warns, so component files should only export components (constant exports are allowed). Type-aware linting is off. Turning it on requires `oxlint-tsgolint` and `"options": { "typeAware": true }`.
- **TS project references:** `tsconfig.json` references `tsconfig.app.json` (covers `src/`, DOM libs, `vite/client` types) and `tsconfig.node.json` (covers only `vite.config.ts`, Node types). A new config file at the root needs adding to `tsconfig.node.json`'s `include`.
- **Strict compiler flags affect how code is written:**
  - `verbatimModuleSyntax`: type-only imports must use `import type`.
  - `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
  - `allowImportingTsExtensions`: local imports include the extension (`import App from './App.tsx'`), following the existing style.
  - `noUnusedLocals` and `noUnusedParameters` fail the build, not just the linter.
- Static assets in `public/` are served from the root (e.g. `/icons.svg#id` sprite references). Assets in `src/assets/` are imported as modules.
