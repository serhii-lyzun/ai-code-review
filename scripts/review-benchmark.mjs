#!/usr/bin/env node
// Re-runs the planted-bug benchmark (git tags benchmark/v1/<case>) with the
// reviewer as it is in this working tree, and scores the findings against an
// answer key kept outside the repo, so the reviewer can never read it.
//
//   npm run benchmark -- --key ../ai-review-benchmark/answer-key.json
//     [--model claude-opus-5-5] [--tags 'benchmark/v1/*'] [--only pagination,search]
//     [--jobs 3] [--max-turns 30] [--out <dir>]
//   npm run benchmark -- --key <key> --rescore <run dir>   (score saved results again)
//
// Each case is a temporary worktree at its tag. The current REVIEW.md,
// CODE_CONVENTIONS.md, CLAUDE.md and .claude/ are copied over it (like CI,
// which reviews with the base branch's rules), so uncommitted prompt changes
// are what gets measured. Claude runs headless with the same read-only tools as
// the CI review and none of your own settings, and can't read the answer key's
// folder. The review costs what `claude` costs you locally. Results
// go to <key dir>/runs/<timestamp>-<model>/: one JSON per case, report.md and
// summary.json. Turn on local telemetry (/ai-monitoring on) first to also get
// token and cost metrics per case in Grafana (benchmark.run, benchmark.case).

import { spawn, execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { matches, scoreCase, summarize } from './benchmark-score.mjs'

const { values: args } = parseArgs({
  options: {
    key: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    tags: { type: 'string', default: 'benchmark/v1/*' },
    only: { type: 'string' },
    jobs: { type: 'string', default: '3' },
    'max-turns': { type: 'string', default: '30' },
    'base-ref': { type: 'string', default: 'main' },
    out: { type: 'string' },
    rescore: { type: 'string' },
  },
})

if (!args.key) {
  console.error('Usage: npm run benchmark -- --key <answer-key.json> [options]')
  process.exit(2)
}

const git = (...gitArgs) =>
  execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
const root = git('rev-parse', '--show-toplevel')
const keyPath = resolve(args.key)
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
if (keyPath.startsWith(root + '/')) {
  console.error(
    'The answer key must live outside the repo, where the reviewer cannot read it.',
  )
  process.exit(2)
}
// A bad keyword regex would otherwise only throw after the paid reviews.
for (const [name, kase] of Object.entries(key.cases ?? {})) {
  for (const bug of kase.bugs ?? []) {
    try {
      matches(bug, {
        file: bug.file,
        line: bug.lines[0],
        title: '',
        message: '',
      })
    } catch (error) {
      console.error(`Answer key case ${name}, bug ${bug.id}: ${error.message}`)
      process.exit(2)
    }
  }
}

const RULES = ['REVIEW.md', 'CODE_CONVENTIONS.md', 'CLAUDE.md', '.claude']
const TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)'
const DENIED = 'Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch'
// No setting sources are loaded (no user allow rules, hooks, plugins or
// memory), so every operator gets the same reviewer. These settings deny the
// answer key's folder (key and earlier runs) and, as in CI, edits and secrets.
const SETTINGS = JSON.stringify({
  permissions: {
    deny: [
      'Edit',
      'Write',
      'MultiEdit',
      'NotebookEdit',
      `Read(/${dirname(keyPath)}/**)`,
      'Read(./.env*)',
      'Read(~/.ssh/**)',
    ],
  },
})

// Only the telemetry env from ~/.claude/settings.json (what /ai-monitoring on
// writes), since user settings aren't loaded otherwise.
function telemetryEnv() {
  try {
    const settings = JSON.parse(
      readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'),
    )
    return Object.fromEntries(
      Object.entries(settings.env ?? {}).filter(
        ([name]) =>
          name === 'CLAUDE_CODE_ENABLE_TELEMETRY' || name.startsWith('OTEL_'),
      ),
    )
  } catch {
    return {}
  }
}
const TIMEOUT_MS = 15 * 60 * 1000

const caseName = (tag) => tag.slice(tag.lastIndexOf('/') + 1)

function prompt(base) {
  return `Read .claude/agents/reviewer.md and follow its instructions exactly. You are that reviewer.

This is a benchmark run of a local review. The change to review is the committed diff
\`git diff ${base} HEAD\`. REVIEW.md, CODE_CONVENTIONS.md, CLAUDE.md and .claude/ in the working
tree are the current review rules, copied in for this run: apply them, but they are not part
of the change, so don't review them.

As in CI, the only commands available are \`git diff\`, \`git log\` and \`git show\`, plus
Read/Grep/Glob. Don't run npm. Return the structured result (verdict, summary, findings).`
}

function runClaude(cwd, base, runId, name, schema) {
  const env = { ...process.env, ...telemetryEnv() }
  // Launched from inside a Claude Code session, the child would otherwise
  // think it is nested.
  delete env.CLAUDECODE
  env.OTEL_RESOURCE_ATTRIBUTES = [
    env.OTEL_RESOURCE_ATTRIBUTES,
    `benchmark.run=${runId}`,
    `benchmark.case=${name}`,
  ]
    .filter(Boolean)
    .join(',')
  const claudeArgs = [
    '-p',
    prompt(base),
    '--model',
    args.model,
    '--max-turns',
    args['max-turns'],
    '--allowedTools',
    TOOLS,
    '--disallowedTools',
    DENIED,
    '--setting-sources',
    '',
    '--settings',
    SETTINGS,
    '--tools',
    'Read,Grep,Glob,Bash',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'json',
    '--json-schema',
    schema,
  ]
  return new Promise((done) => {
    const child = spawn('claude', claudeArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      done({ error: error.message })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      children.delete(child)
      try {
        done({ output: JSON.parse(stdout) })
      } catch {
        done({
          error: `claude exited with ${signal ?? code}, no JSON on stdout: ${(stderr || stdout).slice(0, 500)}`,
        })
      }
    })
  })
}

async function runCase(tag, runId, outDir, schema) {
  const name = caseName(tag)
  const dir = mkdtempSync(join(tmpdir(), `review-benchmark-${name}-`))
  const worktree = join(dir, 'repo')
  tempDirs.add(dir)
  const started = Date.now()
  let base = null
  try {
    base = git('merge-base', tag, args['base-ref'])
    git('worktree', 'add', '--quiet', '--detach', worktree, tag)
    for (const path of RULES) {
      rmSync(join(worktree, path), { recursive: true, force: true })
      if (existsSync(join(root, path))) {
        cpSync(join(root, path), join(worktree, path), { recursive: true })
      }
    }
    const { output, error } = await runClaude(
      worktree,
      base,
      runId,
      name,
      schema,
    )
    const meta = output
      ? {
          is_error: output.is_error,
          subtype: output.subtype,
          num_turns: output.num_turns,
          total_cost_usd: output.total_cost_usd,
          duration_ms: output.duration_ms,
        }
      : { duration_ms: Date.now() - started }
    const review =
      output && !output.is_error && typeof output.structured_output === 'object'
        ? output.structured_output
        : null
    const record = {
      case: name,
      tag,
      commit: git('rev-parse', `${tag}^{commit}`),
      base,
      model: args.model,
      meta,
      error: review
        ? null
        : (error ??
          String(
            output?.result ?? output?.subtype ?? 'no structured result',
          ).slice(0, 1000)),
      review,
    }
    writeFileSync(
      join(outDir, `${name}.json`),
      JSON.stringify(record, null, 2) + '\n',
    )
    console.log(
      `${name}: ${review ? `${review.findings.length} findings` : `ERROR ${record.error}`}`,
    )
    return record
  } catch (error) {
    // A git failure in one case must not abort the run and lose the report.
    const record = {
      case: name,
      tag,
      base,
      model: args.model,
      meta: { duration_ms: Date.now() - started },
      error: String(error.message ?? error).slice(0, 1000),
      review: null,
    }
    writeFileSync(
      join(outDir, `${name}.json`),
      JSON.stringify(record, null, 2) + '\n',
    )
    console.log(`${name}: ERROR ${record.error}`)
    return record
  } finally {
    cleanUp(dir)
  }
}

// Temporary worktrees and running claude processes, cleaned up on Ctrl-C too.
const children = new Set()
const tempDirs = new Set()

function cleanUp(dir) {
  try {
    git('worktree', 'remove', '--force', join(dir, 'repo'))
  } catch {
    // Never added, or already gone; prune below cleans the bookkeeping.
  }
  rmSync(dir, { recursive: true, force: true })
  tempDirs.delete(dir)
  try {
    git('worktree', 'prune')
  } catch {
    // Best effort.
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM')
    for (const dir of [...tempDirs]) cleanUp(dir)
    console.error(`\nStopped by ${signal}; temporary worktrees removed.`)
    process.exit(130)
  })
}

function score(record) {
  const kase = key.cases?.[record.case]
  if (!kase) return null
  return {
    name: record.case,
    planted: (kase.bugs ?? []).length > 0,
    expected: kase.expected ?? '',
    score: record.review ? scoreCase(kase, record.review.findings) : null,
    meta: record.meta,
    error: record.error,
  }
}

function report(results, runInfo) {
  const totals = summarize(results)
  const cell = (r) => {
    if (!r.score)
      return `**error**: ${String(r.error).replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 120)}`
    const bugs = r.score.bugs.map(
      (b) => `${b.id}: ${b.status}${b.severity ? ` (${b.severity})` : ''}`,
    )
    return [`**${r.score.status}**`, ...bugs].join('<br>')
  }
  const lines = [
    `# Review benchmark ${runInfo.id}`,
    '',
    `Model \`${runInfo.model}\`, rules from ${runInfo.rules}, answer key \`${runInfo.keyVersion}\`.`,
    '',
    '| Case | Expected | Result | Blocking (extra) | Cost | Turns | Time |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.expected} | ${cell(r)} | ${r.score ? `${r.score.blocking} (${r.score.extraBlocking})` : '–'} | $${(r.meta?.total_cost_usd ?? 0).toFixed(3)} | ${r.meta?.num_turns ?? '–'} | ${Math.round((r.meta?.duration_ms ?? 0) / 1000)}s |`,
    ),
    '',
    `**Caught ${totals.caught}/${totals.planted}** (weak ${totals.weak}, missed ${totals.missed}), ` +
      `**false positives ${totals.falsePositives}/${totals.controls}** control, errors ${totals.errors}, ` +
      `extra blocker/major findings ${totals.extraBlocking}. Cost $${totals.costUsd.toFixed(3)}, ` +
      `review time ${totals.durationSeconds}s.`,
    '',
    'Extra blocker/major findings match no planted bug: real issues or noise. Read them in the case files.',
  ]
  return { markdown: lines.join('\n') + '\n', totals }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index])
      }
    },
  )
  await Promise.all(lanes)
  return results
}

let outDir
let records
let runInfo
if (args.rescore) {
  outDir = resolve(args.rescore)
  records = readdirSync(outDir)
    .filter((file) => file.endsWith('.json') && file !== 'summary.json')
    .map((file) => JSON.parse(readFileSync(join(outDir, file), 'utf8')))
  const previous = existsSync(join(outDir, 'summary.json'))
    ? JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8')).run
    : {}
  runInfo = {
    id: basename(outDir),
    model: records[0]?.model ?? 'unknown',
    rules: 'unknown',
    ...previous,
    keyVersion: key.version ?? 'unversioned',
  }
  const missing = records
    .map((record) => record.case)
    .filter((name) => !key.cases?.[name])
  if (missing.length > 0) {
    console.error(`The answer key has no case for: ${missing.join(', ')}`)
    process.exit(2)
  }
} else {
  let tags = git('tag', '--list', args.tags).split('\n').filter(Boolean)
  if (args.only) {
    const only = new Set(args.only.split(','))
    tags = tags.filter((tag) => only.has(caseName(tag)))
  }
  if (tags.length === 0) {
    console.error(
      `No tags match ${args.tags}${args.only ? ` and --only ${args.only}` : ''}`,
    )
    process.exit(2)
  }
  const missing = tags.map(caseName).filter((name) => !key.cases?.[name])
  if (missing.length > 0) {
    console.error(`The answer key has no case for: ${missing.join(', ')}`)
    process.exit(2)
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const id = `${stamp}-${args.model}`
  outDir = resolve(args.out ?? join(dirname(keyPath), 'runs', id))
  mkdirSync(outDir, { recursive: true })
  const dirty = git('status', '--porcelain', '--', ...RULES) !== ''
  runInfo = {
    id,
    model: args.model,
    rules: `\`${git('rev-parse', '--short', 'HEAD')}\`${dirty ? ' + uncommitted changes' : ''}`,
    keyVersion: key.version ?? 'unversioned',
  }
  const schema = JSON.stringify(
    JSON.parse(
      readFileSync(join(root, '.claude/schemas/review-findings.json'), 'utf8'),
    ),
  )
  const jobs = Math.max(1, Math.trunc(Number(args.jobs)) || 1)
  console.log(
    `Reviewing ${tags.length} cases with ${args.model}, ${jobs} at a time → ${outDir}`,
  )
  records = await pool(tags, jobs, (tag) => runCase(tag, id, outDir, schema))
}

const results = records.map(score).filter(Boolean)
results.sort((a, b) => a.name.localeCompare(b.name))
const { markdown, totals } = report(results, runInfo)
writeFileSync(join(outDir, 'report.md'), markdown)
writeFileSync(
  join(outDir, 'summary.json'),
  JSON.stringify({ run: runInfo, totals, cases: results }, null, 2) + '\n',
)
console.log('\n' + markdown)
console.log(`Saved to ${outDir}`)
