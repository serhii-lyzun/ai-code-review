import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_RUNS,
  collect,
  mergeRuns,
  readExisting,
  sanitizeUsage,
  toRecord,
} from './ai-metrics.mjs'

const repo = 'owner/repo'
const run = (extra = {}) => ({
  id: 42,
  path: '.github/workflows/ai-review.yml',
  status: 'completed',
  conclusion: 'success',
  event: 'pull_request',
  run_attempt: 1,
  run_started_at: '2026-11-20T10:00:00Z',
  repository: { full_name: repo },
  head_repository: { full_name: repo },
  pull_requests: [{ number: 7 }],
  ...extra,
})

describe('sanitizeUsage', () => {
  it('keeps valid numbers, names and tool counts', () => {
    const u = sanitizeUsage({
      cost_usd: 0.23,
      turns: 7,
      duration_ms: 81234,
      is_error: false,
      subtype: 'success',
      tokens: {
        input: 130,
        output: 3420,
        cache_read: 90000,
        cache_write: 12000,
      },
      models: [{ model: 'claude-opus-5-5', cost_usd: 0.22 }],
      tools: { Read: 2, mcp__github_inline_comment__create_inline_comment: 1 },
    })
    assert.equal(u.cost_usd, 0.23)
    assert.equal(u.turns, 7)
    assert.equal(u.subtype, 'success')
    assert.deepEqual(u.tokens, {
      input: 130,
      output: 3420,
      cache_read: 90000,
      cache_write: 12000,
    })
    assert.deepEqual(u.models, [{ model: 'claude-opus-5-5', cost_usd: 0.22 }])
    assert.equal(u.tools.Read, 2)
  })

  it('turns untrusted junk into zeros and drops bad names', () => {
    const u = sanitizeUsage({
      cost_usd: '1e9',
      turns: -3,
      duration_ms: Infinity,
      is_error: 'yes',
      subtype: '<img src=x onerror=alert(1)>',
      tokens: { input: NaN, output: {} },
      models: [{ model: '<script>', cost_usd: 1 }, 'x', null],
      tools: { '<b>': 5, Grep: 'many' },
    })
    assert.equal(u.cost_usd, 0)
    assert.equal(u.turns, 0)
    assert.equal(u.duration_ms, 0)
    assert.equal(u.is_error, false)
    assert.equal(u.subtype, 'unknown')
    assert.deepEqual(u.tokens, {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    })
    assert.deepEqual(u.models, [])
    assert.deepEqual(u.tools, { Grep: 0 })
  })

  it('caps absurd values', () => {
    assert.equal(sanitizeUsage({ cost_usd: 1e9 }).cost_usd, 1000)
  })

  it('accepts a non-object as empty', () => {
    assert.equal(sanitizeUsage(null).cost_usd, 0)
    assert.equal(sanitizeUsage([1, 2]).turns, 0)
  })
})

describe('toRecord', () => {
  it('takes agent, PR and run from the run, not the artifact', () => {
    const r = toRecord(
      { id: 1 },
      run(),
      { cost_usd: 0.5, agent: 'evil', pr: 999 },
      repo,
    )
    assert.equal(r.agent, 'review')
    assert.equal(r.pr, 7)
    assert.equal(r.run_id, 42)
    assert.equal(r.cost_usd, 0.5)
  })

  it('maps each agent workflow', () => {
    const agent = (path) => toRecord({ id: 1 }, run({ path }), {}, repo).agent
    assert.equal(agent('.github/workflows/ai-fix.yml'), 'fix')
    assert.equal(agent('.github/workflows/deploy.yml'), 'release-summary')
    assert.equal(agent('.github/workflows/claude.yml'), 'mention')
  })

  it('skips other workflows, unfinished runs and other repos', () => {
    assert.equal(
      toRecord({ id: 1 }, run({ path: '.github/workflows/ci.yml' }), {}, repo),
      null,
    )
    assert.equal(
      toRecord({ id: 1 }, run({ status: 'in_progress' }), {}, repo),
      null,
    )
    assert.equal(
      toRecord(
        { id: 1 },
        run({ head_repository: { full_name: 'fork/repo' } }),
        {},
        repo,
      ),
      null,
    )
  })

  it('has no PR for issue and push runs', () => {
    assert.equal(
      toRecord({ id: 1 }, run({ pull_requests: [] }), {}, repo).pr,
      null,
    )
  })
})

describe('mergeRuns', () => {
  it('dedupes by artifact id, newest copy wins, sorted by start', () => {
    const merged = mergeRuns(
      [
        { id: 2, started_at: '2026-11-02', cost_usd: 1 },
        { id: 1, started_at: '2026-11-01', cost_usd: 1 },
      ],
      [{ id: 2, started_at: '2026-11-02', cost_usd: 2 }, { id: 'x' }],
    )
    assert.deepEqual(
      merged.map((r) => [r.id, r.cost_usd]),
      [
        [1, 1],
        [2, 2],
      ],
    )
  })

  it(`keeps the newest ${MAX_RUNS}`, () => {
    const many = Array.from({ length: MAX_RUNS + 5 }, (_, i) => ({
      id: i,
      started_at: `2026-01-01T00:00:${String(i).padStart(6, '0')}`,
    }))
    const merged = mergeRuns(many, [])
    assert.equal(merged.length, MAX_RUNS)
    assert.equal(merged[0].id, 5)
  })
})

describe('collect', () => {
  const quiet = { warn: () => {} }
  const artifact = (id, runId, extra = {}) => ({
    id,
    size_in_bytes: 300,
    expired: false,
    workflow_run: { id: runId },
    ...extra,
  })
  // A fake GitHub API: artifact pages, runs by id, zips by artifact id.
  function fakeApi({ pages, runs, zips = {}, failZip = [] }) {
    const calls = []
    const json = (body) => ({ json: async () => body })
    const get = async (path) => {
      calls.push(path)
      let m
      if ((m = path.match(/artifacts\?.*page=(\d+)$/)))
        return json({ artifacts: pages[m[1] - 1] ?? [] })
      if ((m = path.match(/actions\/runs\/(\d+)$/))) return json(runs[m[1]])
      if ((m = path.match(/artifacts\/(\d+)\/zip$/))) {
        if (failZip.includes(+m[1])) throw new Error('GET zip: 500')
        return { arrayBuffer: async () => Buffer.from(String(m[1])) }
      }
      throw new Error(`unexpected ${path}`)
    }
    const unzip = (buffer) => {
      const text = zips[buffer.toString()]
      if (text === undefined) throw new Error('caution: filename not matched')
      return text
    }
    return { get, unzip, calls }
  }

  it('records new artifacts and leaves known ones alone', async () => {
    const api = fakeApi({
      pages: [[artifact(1, 10), artifact(2, 10)]],
      runs: { 10: run({ id: 10 }) },
      zips: { 1: '{"cost_usd":0.5}', 2: '{"cost_usd":0.7}' },
    })
    const { added } = await collect({
      ...api,
      existing: [{ id: 2 }],
      repo,
      log: quiet,
    })
    assert.deepEqual(
      added.map((r) => [r.id, r.cost_usd]),
      [[1, 0.5]],
    )
    assert.ok(!api.calls.some((c) => c.endsWith('/2/zip')))
    assert.equal(api.calls.filter((c) => c.endsWith('/runs/10')).length, 1)
  })

  it('pages until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) => artifact(i + 1, 10))
    const api = fakeApi({
      pages: [full, [artifact(101, 10)]],
      runs: { 10: run({ id: 10 }) },
      zips: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i + 1, '{}']),
      ),
    })
    const { added } = await collect({ ...api, existing: [], repo, log: quiet })
    assert.equal(added.length, 101)
    assert.equal(api.calls.filter((c) => c.includes('per_page')).length, 2)
  })

  it('skips forks, other workflows and unfinished runs without downloading', async () => {
    const api = fakeApi({
      pages: [[artifact(1, 10), artifact(2, 11), artifact(3, 12)]],
      runs: {
        10: run({ id: 10, head_repository: { full_name: 'fork/repo' } }),
        11: run({ id: 11, path: '.github/workflows/ci.yml' }),
        12: run({ id: 12, status: 'in_progress' }),
      },
    })
    const result = await collect({ ...api, existing: [], repo, log: quiet })
    assert.deepEqual(result, { added: [], skipped: 3 })
    assert.ok(!api.calls.some((c) => c.endsWith('/zip')))
  })

  it('retries a failed download next time', async () => {
    const api = fakeApi({
      pages: [[artifact(1, 10)]],
      runs: { 10: run({ id: 10 }) },
      failZip: [1],
    })
    assert.deepEqual(
      await collect({ ...api, existing: [], repo, log: quiet }),
      {
        added: [],
        skipped: 1,
      },
    )
  })

  it('records unreadable, empty and oversized artifacts as errored runs', async () => {
    const api = fakeApi({
      pages: [
        [
          artifact(1, 10),
          artifact(2, 10),
          artifact(3, 10, { size_in_bytes: 10_000_000 }),
        ],
      ],
      runs: { 10: run({ id: 10 }) },
      zips: { 2: '' },
    })
    const { added } = await collect({ ...api, existing: [], repo, log: quiet })
    assert.deepEqual(
      added.map((r) => [r.id, r.is_error, r.subtype]),
      [
        [1, true, 'unreadable'],
        [2, true, 'unreadable'],
        [3, true, 'unreadable'],
      ],
    )
    assert.ok(!api.calls.some((c) => c.endsWith('/3/zip')))
  })
})

describe('readExisting', () => {
  it('refuses a file without a runs array instead of starting over', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-metrics-test-'))
    writeFileSync(join(dir, 'bad.json'), '{"oops":1}')
    writeFileSync(join(dir, 'ok.json'), '{"runs":[{"id":1}]}')
    assert.throws(() => readExisting(join(dir, 'bad.json')))
    assert.deepEqual(readExisting(join(dir, 'ok.json')), [{ id: 1 }])
  })
})
