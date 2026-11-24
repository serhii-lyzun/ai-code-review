#!/usr/bin/env node
// Classifies a pull request as risk tier low, medium or high from its changed
// files, using policy/risk.json. Deterministic on purpose: the tier decides
// whether a PR can be auto-merged, so it must not depend on an LLM.
//
// Usage: node scripts/risk-tier.mjs <policy.json> <pr.json>
//   pr.json: {
//     "files": [{ "filename": "...", "previous_filename"?: "...", "additions": 1, "deletions": 0 }],
//     "branch": "feature/x",
//     "dependabot"?: { "ecosystem": "npm_and_yarn", "updateType": "version-update:semver-patch" },
//     "truncated"?: true   // the file list is incomplete (API limit): always high
//   }
// Prints JSON { "tier": "...", "reasons": [...] } to stdout.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Converts a glob (`*` within a segment, `**` across segments) to a RegExp. */
export function globToRegExp(glob) {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more directories; a trailing `**` matches anything.
      if (glob[i + 2] === '/') {
        pattern += '(?:.*/)?'
        i += 2
      } else {
        pattern += '.*'
        i += 1
      }
    } else if (char === '*') {
      pattern += '[^/]*'
    } else if (char === '?') {
      pattern += '[^/]'
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${pattern}$`)
}

const matchesAny = (path, globs) =>
  globs.some((glob) => globToRegExp(glob).test(path))

/** Returns { tier, reasons } for a PR described by `pr`, under `policy`. */
export function classify(policy, pr) {
  // An incomplete file list could hide a risky change: fail closed.
  if (pr.truncated) {
    return {
      tier: 'high',
      reasons: [
        'the changed-file list is incomplete (API limit of 3000 files)',
      ],
    }
  }
  const files = pr.files ?? []
  // A rename touches both paths: classify both, so a file can't be moved out
  // of a high-risk location into a low-risk one unnoticed.
  const paths = [
    ...new Set(
      files.flatMap((file) =>
        [file.filename, file.previous_filename].filter(Boolean),
      ),
    ),
  ]
  const changedLines = files.reduce(
    (sum, file) => sum + (file.additions ?? 0) + (file.deletions ?? 0),
    0,
  )
  const branch = pr.branch ?? ''
  const { high, low } = policy

  const highReasons = []
  const highPaths = paths.filter((path) => matchesAny(path, high.paths))
  if (highPaths.length > 0)
    highReasons.push(`high-risk paths: ${highPaths.join(', ')}`)
  if (changedLines > high.maxChangedLines) {
    highReasons.push(
      `${changedLines} changed lines (more than ${high.maxChangedLines})`,
    )
  }
  const prefix = high.branchPrefixes.find((p) => branch.startsWith(p))
  if (prefix) highReasons.push(`branch starts with ${prefix}`)

  // A Dependabot patch/minor npm update touching only the manifest and lock
  // file is low risk even though package.json is a high-risk path otherwise.
  const bot = pr.dependabot
  const dependabotLow =
    bot !== undefined &&
    low.dependabot.ecosystems.includes(bot.ecosystem) &&
    low.dependabot.updateTypes.includes(bot.updateType) &&
    paths.length > 0 &&
    paths.every((path) => low.dependabot.paths.includes(path))

  if (dependabotLow) {
    return {
      tier: 'low',
      reasons: [
        `Dependabot ${bot.updateType} update of ${bot.ecosystem} manifest and lock file`,
      ],
    }
  }
  if (highReasons.length > 0) return { tier: 'high', reasons: highReasons }

  if (paths.length === 0)
    return { tier: 'medium', reasons: ['no changed files reported'] }

  const notLow = paths.filter((path) => !matchesAny(path, low.paths))
  if (notLow.length === 0 && changedLines <= low.maxChangedLines) {
    return {
      tier: 'low',
      reasons: [`only docs, tests or assets; ${changedLines} changed lines`],
    }
  }
  const reasons = []
  if (notLow.length > 0) reasons.push(`application code: ${notLow.join(', ')}`)
  if (changedLines > low.maxChangedLines) {
    reasons.push(
      `${changedLines} changed lines (more than ${low.maxChangedLines} for low)`,
    )
  }
  return { tier: 'medium', reasons }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [policyPath, prPath] = process.argv.slice(2)
  if (!policyPath || !prPath) {
    process.stderr.write(
      'Usage: node scripts/risk-tier.mjs <policy.json> <pr.json>\n',
    )
    process.exit(2)
  }
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  const pr = JSON.parse(readFileSync(prPath, 'utf8'))
  process.stdout.write(`${JSON.stringify(classify(policy, pr))}\n`)
}
