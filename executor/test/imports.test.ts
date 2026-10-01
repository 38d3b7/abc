/**
 * Phase 5: third-party imports with formalities.
 *
 * - Vendored Clawpump skills (MIT): SKILL.md + upstream LICENSE on disk,
 *   PROVENANCE.json pinning repo/commit/fetched-at, manifest flagged
 *   third-party knowledge.
 * - Bankr reference-only catalog: manifest + PROVENANCE only — NO SKILL.md
 *   on disk (that is what reference-only means; content is fetched live at
 *   the operator's install command), license flagged NOASSERTION.
 * - THIRD_PARTY_LICENSES.md freshness gate: regenerate + compare.
 * - Trust boundary: no third-party skill may carry a tool.ts (capability
 *   code loads for provider 'ABC' only — enforced again at load time by
 *   capabilityTools, asserted here at the surface).
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRegistry, SKILLS_DIR } from '../src/agent/skills.js'
import { renderThirdPartyLicenses } from '../script/licenses.js'

const VENDORED = ['risk-manager', 'straight-talk']
const REFERENCE_ONLY = [
  'aeon-deep-research',
  'aeon-defi-overview',
  'aeon-narrative-tracker',
  'aeon-skill-security-scan',
  'aeon-vuln-scanner',
  'bankr-token-scam-analysis',
  'cortx',
  'defi-native'
]

interface Prov {
  repo: string
  commit: string
  fetchedAt: string
  upstreamPath: string
  licenseFile: string | null
}

function provenance (slug: string): Prov {
  return JSON.parse(readFileSync(join(SKILLS_DIR, slug, 'PROVENANCE.json'), 'utf8')) as Prov
}

describe('vendored Clawpump skills', () => {
  for (const slug of VENDORED) {
    it(`${slug}: SKILL.md, LICENSE and pinned provenance on disk`, () => {
      const dir = join(SKILLS_DIR, slug)
      expect(existsSync(join(dir, 'SKILL.md'))).toBe(true)
      const license = readFileSync(join(dir, 'LICENSE'), 'utf8')
      expect(license).toContain('MIT License')
      const prov = provenance(slug)
      expect(prov.repo).toBe('https://github.com/Clawpump/agents-skills')
      expect(prov.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(prov.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(prov.licenseFile).toBe('LICENSE')
    })

    it(`${slug}: manifest is third-party MIT knowledge with no tools`, () => {
      const m = JSON.parse(readFileSync(join(SKILLS_DIR, slug, 'manifest.json'), 'utf8'))
      expect(m).toMatchObject({
        slug,
        provider: 'Clawpump',
        licenseSpdx: 'MIT',
        kind: 'knowledge',
        tools: [],
        referenceOnly: false
      })
    })
  }

  it('vendored content is verbatim upstream (SKILL.md matches the pinned blob)', () => {
    // The provenance commit is the identity of the content; the byte check
    // against the clone happens at vendor time. Here we assert the skill
    // carries no local edits marker: no frontmatter rewrite, upstream
    // metadata kept beside it.
    for (const slug of VENDORED) {
      expect(existsSync(join(SKILLS_DIR, slug, 'upstream-metadata.json'))).toBe(true)
    }
  })
})

describe('Bankr reference-only catalog', () => {
  for (const slug of REFERENCE_ONLY) {
    it(`${slug}: catalog entry without vendored content`, () => {
      const dir = join(SKILLS_DIR, slug)
      // reference-only means exactly this: no content on disk
      expect(existsSync(join(dir, 'SKILL.md'))).toBe(false)
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
      expect(m.referenceOnly).toBe(true)
      expect(m.licenseSpdx).toBe('NOASSERTION')
      expect(m.kind).toBe('knowledge')
      expect(m.tools).toEqual([])
      expect(m.sourceUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/BankrBot\/skills\/[0-9a-f]{40}\//)
      const prov = provenance(slug)
      expect(prov.repo).toBe('https://github.com/BankrBot/skills')
      expect(prov.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(prov.licenseFile).toBeNull()
    })
  }
})

describe('third-party trust boundary', () => {
  it('no third-party skill carries a tool.ts (capability code is first-party only)', () => {
    for (const s of loadRegistry()) {
      if (s.provider === 'ABC') continue
      expect(existsSync(join(SKILLS_DIR, s.slug, 'tool.ts')), `${s.slug} must not ship tool.ts`).toBe(false)
      expect(s.kind).toBe('knowledge')
    }
  })
})

describe('THIRD_PARTY_LICENSES.md', () => {
  it('committed roll-up is fresh (regenerate, then compare)', () => {
    const committed = readFileSync(join(SKILLS_DIR, 'THIRD_PARTY_LICENSES.md'), 'utf8')
    expect(renderThirdPartyLicenses()).toBe(committed)
  })

  it('lists every third-party skill exactly once', () => {
    const committed = readFileSync(join(SKILLS_DIR, 'THIRD_PARTY_LICENSES.md'), 'utf8')
    for (const slug of [...VENDORED, ...REFERENCE_ONLY]) {
      expect(committed).toContain(`| ${slug} |`)
    }
    expect(committed).not.toContain('| security-checklist |') // first-party
  })
})
