#!/usr/bin/env node
// PreToolUse hook for the CI fixer (loaded via .claude/ci-fixer-settings.json).
// Blocks edits to protected paths and edits that silence tooling or weaken tests.
// Claude Code passes the tool call as JSON on stdin. Exit code 2 blocks the call
// and shows stderr to Claude; exit 0 allows it.

import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const PROTECTED = [
  /^\.github\//,
  /^\.claude\//,
  /^\.husky\//,
  /^(CLAUDE|REVIEW|CODE_CONVENTIONS|AI_CODE_REVIEW_PLAN)\.md$/,
  /^package(-lock)?\.json$/,
  /^tsconfig(\..+)?\.json$/,
  /^\.oxlintrc\.json$/,
  /^\.prettier(rc|ignore)(\..+)?$/,
  /^(jest|vite)\.config\.[cm]?[jt]s$/,
  /^\.nvmrc$/,
]

const SILENCERS = [
  /@ts-ignore/,
  /@ts-expect-error/,
  /@ts-nocheck/,
  /(oxlint|eslint)-disable/,
  /\b(it|test|describe)\.(only|skip)\(/,
  /\bx(it|test|describe)\(/,
]

const block = (reason) => {
  process.stderr.write(`Blocked by protect-paths hook: ${reason}\n`)
  process.exit(2)
}

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  block('could not parse the tool call')
}

const tool = input.tool_input ?? {}
const filePath = tool.file_path ?? tool.notebook_path
if (!filePath) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const rel = relative(root, resolve(root, filePath)).replaceAll('\\', '/')

if (rel.startsWith('..')) block(`${filePath} is outside the repository`)
if (PROTECTED.some((pattern) => pattern.test(rel))) {
  block(
    `${rel} is a protected file (CI, agent or tooling config). Skip this finding and explain why.`,
  )
}

// New text the tool would write: Write uses `content`, Edit `new_string`,
// MultiEdit a list of `edits`.
const added = [
  tool.content,
  tool.new_string,
  ...(Array.isArray(tool.edits)
    ? tool.edits.map((edit) => edit.new_string)
    : []),
]
  .filter((text) => typeof text === 'string')
  .join('\n')

const silencer = SILENCERS.find((pattern) => pattern.test(added))
if (silencer) {
  block(
    `the change adds ${silencer} , which silences tooling or skips tests. Fix the cause instead.`,
  )
}

process.exit(0)
