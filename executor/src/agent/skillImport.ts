/**
 * Skill import pipeline: fetch -> scan -> license -> vendor or reference-only.
 * Used by script/skill-import.ts (CLI) and the console's install-from-URL
 * route. Refuses (throws ImportRefused) on any scanner finding — hostile
 * content never reaches the skills dir, even as a reference entry.
 *
 * License discipline (from the repo mining): an SPDX on the vendoring
 * allowlist means the folder gets the SKILL.md plus PROVENANCE.json; anything
 * else (including "no license" = all rights reserved) produces a
 * reference-only entry — manifest + provenance, content stays upstream.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanSkillContent, type ScanFinding } from './skillScan.js'
import { parseFrontmatter, writeRegistry, SKILLS_DIR, type SkillManifest } from './skills.js'

/** SPDX ids that permit vendoring with attribution. */
export const VENDOR_ALLOWLIST = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0'] as const

export class ImportRefused extends Error {
  constructor (public findings: ScanFinding[]) {
    super(`skill import refused: ${findings.length} scanner finding(s): ` +
      findings.map(f => `${f.pattern} at line ${f.line} ("${f.match}")`).join('; '))
  }
}

export interface ImportOptions {
  /** Raw URL of the upstream SKILL.md. */
  url: string
  /** Operator-asserted SPDX id from the upstream repo's LICENSE file. */
  licenseSpdx: string
  /** Upstream provider name (e.g. 'Bankr', 'Clawpump'). */
  provider: string
  slug?: string
  skillsDir?: string
  /** Test seam. */
  fetchImpl?: typeof fetch
}

export interface ImportResult {
  slug: string
  vendored: boolean
  manifest: SkillManifest
  provenancePath: string
}

export function slugify (name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function importSkill (opts: ImportOptions): Promise<ImportResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const skillsDir = opts.skillsDir ?? SKILLS_DIR

  const res = await fetchImpl(opts.url)
  if (!res.ok) throw new Error(`fetch ${opts.url}: ${res.status}`)
  const content = await res.text()

  const scan = scanSkillContent(content)
  if (!scan.ok) throw new ImportRefused(scan.findings)

  const fm = parseFrontmatter(content)
  const name = fm.name ?? opts.slug ?? ''
  if (!name) throw new Error('skill has no name (frontmatter name: required, or pass slug)')
  const slug = opts.slug ?? slugify(name)
  const description = fm.description ?? ''

  const vendored = (VENDOR_ALLOWLIST as readonly string[]).includes(opts.licenseSpdx)
  const manifest: SkillManifest = {
    slug,
    name,
    version: '1.0.0',
    provider: opts.provider,
    sourceUrl: opts.url,
    licenseSpdx: opts.licenseSpdx,
    kind: 'knowledge',
    description,
    tools: [],
    referenceOnly: !vendored
  }

  const dir = join(skillsDir, slug)
  mkdirSync(dir, { recursive: true })
  if (vendored) {
    writeFileSync(join(dir, 'SKILL.md'), content)
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const provenance = {
    slug,
    sourceUrl: opts.url,
    fetchedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(content).digest('hex'),
    licenseSpdx: opts.licenseSpdx,
    licenseSource: 'operator-asserted',
    vendored,
    scanFindings: []
  }
  const provenancePath = join(dir, 'PROVENANCE.json')
  writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n')

  writeRegistry(skillsDir)
  return { slug, vendored, manifest, provenancePath }
}
