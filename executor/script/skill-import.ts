/**
 * Import a third-party skill from a raw SKILL.md URL.
 *
 *   npm run skill-import -- --url <raw SKILL.md URL> --license-spdx <SPDX> --provider <name> [--slug <slug>]
 *
 * The license is operator-asserted from the upstream repo's LICENSE file —
 * read it before running this. Allowlisted SPDX ids vendor the content with
 * PROVENANCE.json; anything else records a reference-only catalog entry.
 * Any scanner finding refuses the import outright.
 */

import { importSkill, ImportRefused } from '../src/agent/skillImport.js'

function arg (name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const url = arg('url')
const licenseSpdx = arg('license-spdx')
const provider = arg('provider')
const slug = arg('slug')

if (!url || !licenseSpdx || !provider) {
  console.error('usage: skill-import --url <raw SKILL.md URL> --license-spdx <SPDX> --provider <name> [--slug <slug>]')
  process.exit(2)
}

try {
  const result = await importSkill({ url, licenseSpdx, provider, ...(slug ? { slug } : {}) })
  console.log(`[skills] imported ${result.slug}: ${result.vendored ? 'vendored' : 'reference-only'} (${result.manifest.licenseSpdx})`)
  console.log(`[skills] provenance: ${result.provenancePath}`)
} catch (e) {
  if (e instanceof ImportRefused) {
    console.error(`[skills] REFUSED: ${e.message}`)
    process.exit(1)
  }
  throw e
}
