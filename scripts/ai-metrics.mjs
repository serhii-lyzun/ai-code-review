#!/usr/bin/env node
// Collects the ai-usage artifacts that the agent workflows upload (one small
// JSON of numbers per Claude run) into one runs.json for the AI metrics page
// on gh-pages (/ai-metrics/). Run by .github/workflows/ai-metrics.yml.
//
// Usage: node scripts/ai-metrics.mjs --existing <runs.json> --out <runs.json>
// Env:   GITHUB_TOKEN (actions: read), GITHUB_REPOSITORY (owner/name),
//        GITHUB_API_URL (optional)
//
// Trust: the artifact comes from a job that ran an agent, and in ai-fix and
// ai-bugfix also PR code, so its content is untrusted. Only finite,
// non-negative numbers and names matching a strict pattern are kept; anything
// else becomes 0 or is dropped. Which agent, PR and run a record belongs to
// comes from the Actions API, never from the artifact.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ARTIFACT_NAME = 'ai-usage'
export const MAX_RUNS = 5000
const MAX_ARTIFACT_BYTES = 64 * 1024

// Workflow file -> agent name on the dashboard. Runs of other workflows
// are ignored, even if they upload an artifact with the same name.
export const AGENTS = {
  '.github/workflows/ai-review.yml': 'review',
  '.github/workflows/ai-fix.yml': 'fix',
  '.github/workflows/ai-bugfix.yml': 'bugfix',
  '.github/workflows/ai-triage.yml': 'triage',
  '.github/workflows/deploy.yml': 'release-summary',
  '.github/workflows/claude.yml': 'mention',
}

const NAME = /^[A-Za-z0-9._:[\]-]{1,64}$/
const SUBTYPE = /^[a-z_]{1,40}$/

function num(value, max = 1e12) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, max)
    : 0
}

// Keeps only the fields the dashboard shows, with safe values.
export function sanitizeUsage(raw) {
  const u = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const tokens = u.tokens && typeof u.tokens === 'object' ? u.tokens : {}
  const models = Array.isArray(u.models) ? u.models : []
  const tools =
    u.tools && typeof u.tools === 'object' && !Array.isArray(u.tools)
      ? u.tools
      : {}
  return {
    cost_usd: num(u.cost_usd, 1000),
    turns: Math.round(num(u.turns, 10000)),
    duration_ms: Math.round(num(u.duration_ms, 1e9)),
    is_error: u.is_error === true,
    subtype:
      typeof u.subtype === 'string' && SUBTYPE.test(u.subtype)
        ? u.subtype
        : 'unknown',
    tokens: {
      input: Math.round(num(tokens.input)),
      output: Math.round(num(tokens.output)),
      cache_read: Math.round(num(tokens.cache_read)),
      cache_write: Math.round(num(tokens.cache_write)),
    },
    models: models
      .filter((m) => m && typeof m.model === 'string' && NAME.test(m.model))
      .slice(0, 10)
      .map((m) => ({ model: m.model, cost_usd: num(m.cost_usd, 1000) })),
    tools: Object.fromEntries(
      Object.entries(tools)
        .filter(([name]) => NAME.test(name))
        .slice(0, 50)
        .map(([name, count]) => [name, Math.round(num(count, 1e6))]),
    ),
  }
}

// One dashboard row from the trusted run metadata and the artifact content.
// Returns null for runs that don't belong on the dashboard. A fork PR runs
// its own copy of the workflow under the same path, so the head repository
// must be this one (run.repository is always the base repository).
export function toRecord(artifact, run, usage, repo) {
  const agent = AGENTS[run?.path]
  if (!agent) return null
  if (run.status !== 'completed') return null
  if (run.head_repository?.full_name !== repo) return null
  const pr = run.pull_requests?.[0]?.number
  return {
    id: artifact.id,
    run_id: run.id,
    agent,
    event: typeof run.event === 'string' ? run.event : 'unknown',
    pr: Number.isInteger(pr) ? pr : null,
    conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
    started_at: run.run_started_at ?? run.created_at,
    ...sanitizeUsage(usage),
  }
}

// Adds new records, keeps one per artifact id, sorted oldest first.
export function mergeRuns(existing, added) {
  const byId = new Map()
  for (const r of [...existing, ...added]) {
    if (r && Number.isInteger(r.id)) byId.set(r.id, r)
  }
  return [...byId.values()]
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
    .slice(-MAX_RUNS)
}

export function readExisting(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(data?.runs)) throw new Error(`${path} has no runs array`)
  return data.runs
}

// Reads every ai-usage artifact not in `existing` into records.
//   get(path)       GitHub API GET, resolves to a fetch Response, throws on HTTP errors
//   unzip(buffer)   the artifact's ai-usage.json as text, throws if missing or too big
// Download errors leave the artifact for the next collection. Content that
// can't be read or parsed is recorded as an errored run, so it isn't fetched
// again every time and still counts on the dashboard.
export async function collect({ get, unzip, existing, repo, log = console }) {
  const known = new Set(existing.map((r) => r.id))
  const runs = new Map()
  const added = []
  let skipped = 0
  for (let page = 1; ; page++) {
    const { artifacts = [] } = await (
      await get(
        `/repos/${repo}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=100&page=${page}`,
      )
    ).json()
    for (const a of artifacts) {
      if (known.has(a.id) || a.expired) continue
      const runId = a.workflow_run?.id
      if (!Number.isInteger(runId)) continue
      if (!runs.has(runId)) {
        runs.set(
          runId,
          await (await get(`/repos/${repo}/actions/runs/${runId}`)).json(),
        )
      }
      const run = runs.get(runId)
      // Other workflows, forks and unfinished runs: no download. Unfinished
      // ones aren't in runs.json yet, so the next collection picks them up.
      if (!toRecord(a, run, {}, repo)) {
        skipped++
        continue
      }
      let usage
      if (a.size_in_bytes > MAX_ARTIFACT_BYTES) {
        log.warn(
          `artifact ${a.id}: ${a.size_in_bytes} bytes, recorded as unreadable`,
        )
        usage = { is_error: true, subtype: 'unreadable' }
      } else {
        let buffer
        try {
          const res = await get(`/repos/${repo}/actions/artifacts/${a.id}/zip`)
          buffer = Buffer.from(await res.arrayBuffer())
        } catch (err) {
          log.warn(
            `artifact ${a.id}: download failed (${err.message}), retried next time`,
          )
          skipped++
          continue
        }
        try {
          usage = JSON.parse(unzip(buffer))
        } catch (err) {
          log.warn(
            `artifact ${a.id}: unreadable (${err.message}), recorded as an error`,
          )
          usage = { is_error: true, subtype: 'unreadable' }
        }
      }
      added.push(toRecord(a, run, usage, repo))
    }
    if (artifacts.length < 100) break
  }
  return { added, skipped }
}

function unzipWith(work) {
  return (buffer) => {
    const zip = join(work, 'artifact.zip')
    writeFileSync(zip, buffer)
    return execFileSync('unzip', ['-p', zip, 'ai-usage.json'], {
      maxBuffer: MAX_ARTIFACT_BYTES,
    }).toString('utf8')
  }
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const existingPath = arg('--existing')
  const outPath = arg('--out')
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
  if (!outPath || !repo || !token) {
    console.error(
      'usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/ai-metrics.mjs [--existing runs.json] --out runs.json',
    )
    process.exit(2)
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const get = async (path) => {
    const res = await fetch(`${api}${path}`, { headers })
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
    return res
  }

  // A file that exists but can't be read must stop the run: starting from
  // nothing would replace the history with the last 30 days of artifacts.
  const existing = existingPath ? readExisting(existingPath) : []
  const work = mkdtempSync(join(tmpdir(), 'ai-metrics-'))
  let result
  try {
    result = await collect({ get, unzip: unzipWith(work), existing, repo })
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  const merged = mergeRuns(existing, result.added)
  writeFileSync(
    outPath,
    JSON.stringify({ v: 1, repo, runs: merged }, null, 1) + '\n',
  )
  console.log(
    `${result.added.length} new run(s), ${result.skipped} skipped (other workflow, fork, still running or download failed), ${merged.length} in total`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
