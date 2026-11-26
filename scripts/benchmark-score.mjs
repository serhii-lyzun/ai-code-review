// Scores reviewer findings against a benchmark answer key. Pure functions, no
// I/O, so scripts/benchmark-score.test.mjs can check them directly; the runner
// is scripts/review-benchmark.mjs.
//
// Answer key case: { "bugs": [{ "id", "file", "lines": [from, to], "slack"?,
// "keywords"? }] }. A case with no bugs is a control: every blocker or major
// on it is a false positive.

export const BLOCKING = new Set(['blocker', 'major'])
const RANK = { blocker: 0, major: 1, minor: 2, nit: 3 }

// A finding matches a planted bug when it points at the bug's file, within
// `slack` lines (default 3) of its line range, and, if the bug lists keywords,
// its title or message matches one of them (case-insensitive regexes). The
// keywords tell apart two bugs planted on the same lines.
export function matches(bug, finding) {
  if (finding.file !== bug.file) return false
  const [from, to] = bug.lines
  const slack = bug.slack ?? 3
  if (finding.line < from - slack || finding.line > to + slack) return false
  const keywords = bug.keywords ?? []
  if (keywords.length === 0) return true
  const text = `${finding.title}\n${finding.message}`
  return keywords.some((keyword) => new RegExp(keyword, 'i').test(text))
}

// The most severe finding that matches the bug and isn't claimed yet (index
// into findings, or -1). Findings are listed most severe first, so ties keep
// the reviewer's order.
function pick(bug, findings, claimed) {
  let best = -1
  findings.forEach((f, index) => {
    if (claimed.has(index) || !matches(bug, f)) return
    if (best === -1 || RANK[f.severity] < RANK[findings[best].severity]) {
      best = index
    }
  })
  return best
}

// caught: reported as blocker or major, so the gate fails.
// weak: reported, but only as minor or nit, so the gate passes.
// missed: not reported.
export function scoreBug(bug, findings, claimed = new Set()) {
  const index = pick(bug, findings, claimed)
  const severity = index === -1 ? null : findings[index].severity
  const status =
    severity === null ? 'missed' : BLOCKING.has(severity) ? 'caught' : 'weak'
  return { id: bug.id, status, severity, index }
}

// Case status: control cases are `clean` or `false_positive`. Others take the
// worst status of their bugs. Each planted bug claims one finding, its most
// severe match; `extraBlocking` counts the other blocker/major findings, even
// ones on the same lines (a second problem there is still a second finding).
// They are real issues or noise: read them in the raw result.
export function scoreCase(kase, findings) {
  const bugs = kase.bugs ?? []
  const claimed = new Set()
  const scored = bugs.map((bug) => {
    const { index, ...result } = scoreBug(bug, findings, claimed)
    if (index !== -1) claimed.add(index)
    return result
  })
  const blocking = findings.filter((f) => BLOCKING.has(f.severity)).length
  const extraBlocking = findings.filter(
    (f, index) => BLOCKING.has(f.severity) && !claimed.has(index),
  ).length
  if (bugs.length === 0) {
    return {
      status: blocking === 0 ? 'clean' : 'false_positive',
      bugs: [],
      blocking,
      extraBlocking,
    }
  }
  const order = ['missed', 'weak', 'caught']
  const status = order.find((s) => scored.some((b) => b.status === s))
  return { status, bugs: scored, blocking, extraBlocking }
}

// Totals over scored cases ({ name, score, meta }). A case without a result
// (the run failed) counts as `error`, never as caught or clean.
export function summarize(results) {
  const planted = results.filter((r) => r.planted)
  const controls = results.filter((r) => !r.planted)
  const count = (list, status) =>
    list.filter((r) => r.score?.status === status).length
  const sum = (key) =>
    results.reduce((total, r) => total + (Number(r.meta?.[key]) || 0), 0)
  return {
    planted: planted.length,
    caught: count(planted, 'caught'),
    weak: count(planted, 'weak'),
    missed: count(planted, 'missed'),
    controls: controls.length,
    falsePositives: count(controls, 'false_positive'),
    errors: results.filter((r) => !r.score).length,
    extraBlocking: results.reduce(
      (total, r) => total + (r.score?.extraBlocking ?? 0),
      0,
    ),
    costUsd: Math.round(sum('total_cost_usd') * 10000) / 10000,
    durationSeconds: Math.round(sum('duration_ms') / 1000),
  }
}
