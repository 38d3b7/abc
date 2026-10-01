/**
 * Regenerate executor/skills/registry.json from the per-skill manifests.
 * The freshness gate (test/skills.test.ts) regenerates and deep-equals, so
 * any manifest edit must be followed by a run of this script.
 *
 *   npm run skill-registry
 */

import { writeRegistry } from '../src/agent/skills.js'

const reg = writeRegistry()
console.log(`[skills] registry.json regenerated: ${reg.skills.length} skill(s): ${reg.skills.map(s => s.slug).join(', ')}`)
