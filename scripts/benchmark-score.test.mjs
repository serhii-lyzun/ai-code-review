import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matches, scoreBug, scoreCase, summarize } from './benchmark-score.mjs'

const finding = (extra = {}) => ({
  file: 'src/utils/paginate.ts',
  line: 16,
  severity: 'major',
  title: 'Partial last page unreachable',
  message: 'Math.floor drops the remainder',
  ...extra,
})
const floorBug = {
  id: 'floor',
  file: 'src/utils/paginate.ts',
  lines: [16, 16],
}

describe('matches', () => {
  it('needs the same file', () => {
    assert.ok(matches(floorBug, finding()))
    assert.ok(!matches(floorBug, finding({ file: 'src/utils/other.ts' })))
  })

  it('allows 3 lines of slack by default, or the given slack', () => {
    assert.ok(matches(floorBug, finding({ line: 19 })))
    assert.ok(matches(floorBug, finding({ line: 13 })))
    assert.ok(!matches(floorBug, finding({ line: 20 })))
    assert.ok(!matches({ ...floorBug, slack: 0 }, finding({ line: 17 })))
  })

  it('uses keywords, when given, to tell bugs on the same lines apart', () => {
    const race = { ...floorBug, keywords: ['race', 'out of order'] }
    assert.ok(matches(race, finding({ title: 'Race condition' })))
    assert.ok(
      matches(race, finding({ message: 'responses arrive Out Of Order' })),
    )
    assert.ok(!matches(race, finding({ title: 'Unhandled rejection' })))
  })
})

describe('scoreBug', () => {
  it('is caught by a blocker or major', () => {
    assert.deepEqual(scoreBug(floorBug, [finding({ severity: 'blocker' })]), {
      id: 'floor',
      status: 'caught',
      severity: 'blocker',
      index: 0,
    })
  })

  it('is weak when only reported as minor or nit', () => {
    const result = scoreBug(floorBug, [
      finding({ severity: 'nit' }),
      finding({ severity: 'minor' }),
    ])
    assert.equal(result.status, 'weak')
    assert.equal(result.severity, 'minor')
  })

  it('keeps the most severe matching finding', () => {
    const result = scoreBug(floorBug, [
      finding({ severity: 'minor' }),
      finding({ severity: 'major' }),
    ])
    assert.equal(result.status, 'caught')
    assert.equal(result.severity, 'major')
    assert.equal(result.index, 1)
  })

  it('skips findings another bug already claimed', () => {
    const result = scoreBug(floorBug, [finding()], new Set([0]))
    assert.equal(result.status, 'missed')
  })

  it('is missed when nothing matches', () => {
    assert.deepEqual(scoreBug(floorBug, [finding({ line: 40 })]), {
      id: 'floor',
      status: 'missed',
      severity: null,
      index: -1,
    })
  })
})

describe('scoreCase', () => {
  it('flags any blocker or major on a control case as a false positive', () => {
    assert.equal(scoreCase({ bugs: [] }, []).status, 'clean')
    assert.equal(
      scoreCase({ bugs: [] }, [finding({ severity: 'minor' })]).status,
      'clean',
    )
    const result = scoreCase({ bugs: [] }, [finding()])
    assert.equal(result.status, 'false_positive')
    assert.equal(result.blocking, 1)
  })

  it('takes the worst status over all planted bugs', () => {
    const catchBug = { ...floorBug, id: 'catch', keywords: ['rejection'] }
    const kase = { bugs: [floorBug, catchBug] }
    assert.equal(scoreCase(kase, [finding()]).status, 'missed')
    assert.equal(
      scoreCase(kase, [
        finding(),
        finding({ title: 'Unhandled rejection', severity: 'nit' }),
      ]).status,
      'weak',
    )
    assert.equal(
      scoreCase(kase, [finding(), finding({ title: 'Unhandled rejection' })])
        .status,
      'caught',
    )
  })

  it('counts blocking findings that match no planted bug', () => {
    const result = scoreCase({ bugs: [floorBug] }, [
      finding(),
      finding({ file: 'src/utils/paginate.test.ts', line: 3 }),
      finding({ file: 'src/utils/paginate.test.ts', severity: 'minor' }),
    ])
    assert.equal(result.blocking, 2)
    assert.equal(result.extraBlocking, 1)
  })

  it('counts a second blocking finding on the same lines as extra', () => {
    // The countdown case: "interval never stops" sits next to the planted
    // stale closure, but it is a separate finding.
    const result = scoreCase({ bugs: [floorBug] }, [
      finding({ severity: 'blocker' }),
      finding({ line: 17, title: 'NaN page values' }),
    ])
    assert.equal(result.status, 'caught')
    assert.deepEqual(result.bugs, [
      { id: 'floor', status: 'caught', severity: 'blocker' },
    ])
    assert.equal(result.extraBlocking, 1)
  })

  it('lets each finding count for one planted bug only', () => {
    const raceBug = { ...floorBug, id: 'race', keywords: ['race', 'catch'] }
    const catchBug = { ...floorBug, id: 'catch', keywords: ['catch'] }
    const result = scoreCase({ bugs: [raceBug, catchBug] }, [
      finding({ title: 'Race, and no catch' }),
    ])
    assert.equal(result.status, 'missed')
    assert.equal(result.bugs[1].status, 'missed')
  })
})

describe('summarize', () => {
  it('adds up statuses, cost and duration, and counts failed runs as errors', () => {
    const summary = summarize([
      {
        planted: true,
        score: { status: 'caught', extraBlocking: 2 },
        meta: { total_cost_usd: 0.5, duration_ms: 60000 },
      },
      {
        planted: true,
        score: { status: 'weak', extraBlocking: 0 },
        meta: { total_cost_usd: 0.25, duration_ms: 30500 },
      },
      { planted: true, score: null, meta: { total_cost_usd: 0 } },
      {
        planted: false,
        score: { status: 'false_positive', extraBlocking: 1 },
        meta: { total_cost_usd: 0.1, duration_ms: 1000 },
      },
    ])
    assert.deepEqual(summary, {
      planted: 3,
      caught: 1,
      weak: 1,
      missed: 0,
      controls: 1,
      falsePositives: 1,
      errors: 1,
      extraBlocking: 3,
      costUsd: 0.85,
      durationSeconds: 92,
    })
  })
})
