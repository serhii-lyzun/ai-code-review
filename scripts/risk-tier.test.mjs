import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { classify, globToRegExp } from './risk-tier.mjs'

const policy = JSON.parse(
  readFileSync(new URL('../policy/risk.json', import.meta.url), 'utf8'),
)
const file = (filename, additions = 1, deletions = 0, extra = {}) => ({
  filename,
  additions,
  deletions,
  ...extra,
})
const tier = (pr) => classify(policy, { branch: 'feature/x', ...pr }).tier

describe('globToRegExp', () => {
  it('matches * within one segment only', () => {
    assert.ok(globToRegExp('*.md').test('README.md'))
    assert.ok(!globToRegExp('*.md').test('docs/README.md'))
  })

  it('matches **/ across zero or more directories', () => {
    assert.ok(globToRegExp('**/*.md').test('README.md'))
    assert.ok(globToRegExp('**/*.md').test('docs/guide/intro.md'))
    assert.ok(globToRegExp('src/**/*.test.tsx').test('src/App.test.tsx'))
    assert.ok(
      globToRegExp('src/**/*.test.tsx').test('src/components/Search.test.tsx'),
    )
  })

  it('treats a trailing ** as anything below the directory', () => {
    assert.ok(globToRegExp('.github/**').test('.github/workflows/ci.yml'))
    assert.ok(!globToRegExp('.github/**').test('.githubx/a'))
  })

  it('matches ? as exactly one character within a segment', () => {
    assert.ok(globToRegExp('file?.md').test('file1.md'))
    assert.ok(!globToRegExp('file?.md').test('file12.md'))
    assert.ok(!globToRegExp('a?b').test('a/b'))
  })

  it('treats ** without a following slash as anything, across segments', () => {
    assert.ok(globToRegExp('src/**.ts').test('src/a/b.ts'))
  })

  it('escapes regex characters', () => {
    assert.ok(globToRegExp('tsconfig*.json').test('tsconfig.app.json'))
    assert.ok(!globToRegExp('tsconfig*.json').test('tsconfigXjson'))
  })
})

describe('classify', () => {
  it('rates docs, tests and assets under 100 lines as low', () => {
    assert.equal(tier({ files: [file('README.md', 10)] }), 'low')
    assert.equal(
      tier({ files: [file('src/components/Search.test.tsx', 30, 5)] }),
      'low',
    )
    assert.equal(tier({ files: [file('src/assets/logo.png', 0, 0)] }), 'low')
    assert.equal(
      tier({ files: [file('public/fonts/inter.woff2', 0, 0)] }),
      'low',
    )
  })

  it('does not rate script-capable assets as low', () => {
    assert.equal(tier({ files: [file('public/evil.html', 5)] }), 'medium')
    assert.equal(tier({ files: [file('public/sw.js', 5)] }), 'medium')
    assert.equal(tier({ files: [file('public/icons.svg', 5)] }), 'medium')
    assert.equal(tier({ files: [file('src/assets/logo.svg', 5)] }), 'medium')
  })

  it('rates an incomplete file list as high', () => {
    assert.equal(tier({ files: [file('README.md')], truncated: true }), 'high')
  })

  it('rates low-risk files over 100 changed lines as medium', () => {
    assert.equal(
      tier({ files: [file('README.md', 80), file('docs/a.md', 30)] }),
      'medium',
    )
  })

  it('rates application code as medium', () => {
    assert.equal(
      tier({ files: [file('src/components/Search.tsx', 5)] }),
      'medium',
    )
    assert.equal(
      tier({ files: [file('README.md'), file('src/utils/paginate.ts')] }),
      'medium',
    )
  })

  it('rates protected paths as high, even protected markdown', () => {
    assert.equal(tier({ files: [file('.github/workflows/ci.yml')] }), 'high')
    assert.equal(tier({ files: [file('REVIEW.md')] }), 'high')
    assert.equal(tier({ files: [file('CLAUDE.md')] }), 'high')
    assert.equal(tier({ files: [file('src/test/setup.ts')] }), 'high')
    assert.equal(tier({ files: [file('vite.config.ts')] }), 'high')
    assert.equal(tier({ files: [file('package.json')] }), 'high')
    assert.equal(tier({ files: [file('scripts/risk-tier.mjs')] }), 'high')
  })

  it('rates a rename out of a protected path as high', () => {
    const renamed = file('docs/old-workflow.md', 0, 0, {
      previous_filename: '.github/workflows/ci.yml',
    })
    assert.equal(tier({ files: [renamed] }), 'high')
  })

  it('rates more than 400 changed lines as high', () => {
    assert.equal(tier({ files: [file('src/a.ts', 300, 101)] }), 'high')
  })

  it('rates hotfix branches as high', () => {
    assert.equal(
      tier({ branch: 'hotfix/crash', files: [file('README.md')] }),
      'high',
    )
  })

  it('rates a Dependabot npm patch or minor update as low', () => {
    const files = [
      file('package.json', 1, 1),
      file('package-lock.json', 40, 40),
    ]
    for (const updateType of [
      'version-update:semver-patch',
      'version-update:semver-minor',
    ]) {
      assert.equal(
        tier({ files, dependabot: { ecosystem: 'npm_and_yarn', updateType } }),
        'low',
      )
    }
  })

  it('keeps a Dependabot patch update low despite a large lock-file diff', () => {
    const files = [
      file('package.json', 1, 1),
      file('package-lock.json', 900, 900),
    ]
    const patch = {
      ecosystem: 'npm',
      updateType: 'version-update:semver-patch',
    }
    assert.equal(
      tier({ branch: 'dependabot/npm_and_yarn/x', files, dependabot: patch }),
      'low',
    )
  })

  it('rates a Dependabot major update, or one touching other files, as high', () => {
    const files = [
      file('package.json', 1, 1),
      file('package-lock.json', 40, 40),
    ]
    const major = {
      ecosystem: 'npm_and_yarn',
      updateType: 'version-update:semver-major',
    }
    assert.equal(tier({ files, dependabot: major }), 'high')
    const patch = {
      ecosystem: 'npm_and_yarn',
      updateType: 'version-update:semver-patch',
    }
    assert.equal(
      tier({ files: [...files, file('src/a.ts')], dependabot: patch }),
      'high',
    )
  })

  it('rates a Dependabot GitHub Actions update as high (it edits workflows)', () => {
    const actions = {
      ecosystem: 'github_actions',
      updateType: 'version-update:semver-patch',
    }
    assert.equal(
      tier({ files: [file('.github/workflows/ci.yml')], dependabot: actions }),
      'high',
    )
  })

  it('does not treat a claimed Dependabot update as low without the metadata', () => {
    const files = [
      file('package.json', 1, 1),
      file('package-lock.json', 40, 40),
    ]
    assert.equal(tier({ files }), 'high')
  })

  it('rates a PR with no reported files as medium', () => {
    assert.equal(tier({ files: [] }), 'medium')
  })

  it('explains its decision', () => {
    const result = classify(policy, {
      branch: 'feature/x',
      files: [file('.github/x.yml')],
    })
    assert.deepEqual(result, {
      tier: 'high',
      reasons: ['high-risk paths: .github/x.yml'],
    })
  })
})
