/**
 * Skills runtime. A skill is a folder under executor/skills/ with:
 *   SKILL.md       — Anthropic format: YAML frontmatter (name, description) + body
 *   manifest.json  — slug, version, provider, sourceUrl, licenseSpdx, kind, tools
 *   PROVENANCE.json — write-once import record (not part of the freshness gate)
 *   tool.ts        — capability skills only, first-party only (provider 'ABC')
 * registry.json is GENERATED from the per-skill manifests (sorted, no
 * timestamps) by generateRegistry; a test proves it is fresh.
 *
 * Trust boundary: tool modules load only for first-party skills. Third-party
 * skills install as knowledge (vendored, license-permitting) or reference-only
 * catalog entries whose content is fetched live from sourceUrl at load time
 * (never committed to the repo — that is what "reference-only" means).
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolSet } from 'ai'
import type { AgentSkillRow } from '../db/store.js'

export type SkillKind = 'knowledge' | 'capability'

export interface SkillManifest {
  slug: string
  name: string
  version: string
  /** 'ABC' = first-party; anything else is third-party content. */
  provider: string
  sourceUrl: string
  licenseSpdx: string
  kind: SkillKind
  description: string
  /** capability skills: the tool names their module registers. */
  tools: string[]
  /** true: content stays upstream, fetched live at load time; no SKILL.md on disk. */
  referenceOnly: boolean
}

export interface Registry {
  skills: SkillManifest[]
}

/** executor/skills — resolved from this module so tests can substitute. */
export const SKILLS_DIR = new URL('../../skills/', import.meta.url).pathname

export function loadRegistry (skillsDir: string = SKILLS_DIR): SkillManifest[] {
  const regPath = join(skillsDir, 'registry.json')
  if (!existsSync(regPath)) return []
  return (JSON.parse(readFileSync(regPath, 'utf8')) as Registry).skills
}

/** Deterministic registry content: manifests sorted by slug, no timestamps,
 *  so the freshness gate is a plain deep-equal. */
export function generateRegistry (skillsDir: string = SKILLS_DIR): Registry {
  const skills = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join(skillsDir, d.name, 'manifest.json'))
    .filter(p => existsSync(p))
    .map(p => JSON.parse(readFileSync(p, 'utf8')) as SkillManifest)
    .sort((a, b) => a.slug.localeCompare(b.slug))
  return { skills }
}

export function writeRegistry (skillsDir: string = SKILLS_DIR): Registry {
  const reg = generateRegistry(skillsDir)
  writeFileSync(join(skillsDir, 'registry.json'), JSON.stringify(reg, null, 2) + '\n')
  return reg
}

export interface ResolvedSkill extends SkillManifest {
  enabled: boolean
  config: Record<string, unknown>
  addedAt: string
}

/** Join the global registry with the agent's install rows. Unknown slugs in
 *  agent_skills (registry entry removed) resolve to nothing — the install row
 *  stays, but a skill that is not in the registry never reaches the loop. */
export function resolveAgentSkills (registry: SkillManifest[], installs: AgentSkillRow[]): ResolvedSkill[] {
  const bySlug = new Map(registry.map(s => [s.slug, s]))
  const out: ResolvedSkill[] = []
  for (const row of installs) {
    const manifest = bySlug.get(row.slug)
    if (!manifest) continue
    out.push({ ...manifest, enabled: row.enabled, config: row.config, addedAt: row.addedAt })
  }
  return out
}

/** Parse the two frontmatter fields we rely on. YAML-lite on purpose: the
 *  Anthropic format's name/description are single-line scalars. */
export function parseFrontmatter (content: string): { name?: string; description?: string } {
  const m = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!m) return {}
  const out: { name?: string; description?: string } = {}
  for (const line of m[1]!.split('\n')) {
    const kv = /^([a-zA-Z_-]+):\s*(.+)$/.exec(line.trim())
    if (!kv) continue
    if (kv[1] === 'name') out.name = kv[2]!.trim()
    if (kv[1] === 'description') out.description = kv[2]!.trim()
  }
  return out
}

// live-fetch cache for reference-only content (per process)
const fetchedContent = new Map<string, string>()

export async function skillContent (skill: SkillManifest, skillsDir: string = SKILLS_DIR): Promise<string> {
  if (skill.referenceOnly) {
    const cached = fetchedContent.get(skill.slug)
    if (cached) return cached
    const res = await fetch(skill.sourceUrl)
    if (!res.ok) throw new Error(`reference-only skill ${skill.slug}: fetch ${res.status} from ${skill.sourceUrl}`)
    const text = await res.text()
    fetchedContent.set(skill.slug, text)
    return text
  }
  return readFileSync(join(skillsDir, skill.slug, 'SKILL.md'), 'utf8')
}

/** Enabled knowledge skills as extra system context. */
export async function knowledgeContext (skills: ResolvedSkill[], skillsDir: string = SKILLS_DIR): Promise<string> {
  const blocks: string[] = []
  for (const s of skills) {
    if (s.kind !== 'knowledge' || !s.enabled) continue
    const content = await skillContent(s, skillsDir)
    blocks.push(`## Skill: ${s.name} (${s.slug} v${s.version}, ${s.licenseSpdx})\n\n${content}`)
  }
  return blocks.join('\n\n')
}

/** Context a capability tool module receives — the same handles the loop's
 *  intent tools get. Type-only imports: erased at runtime, so skill tool
 *  modules loading this file pull no extra code. */
export interface SkillToolContext {
  store: import('../db/store.js').Store
  runner: import('../pipeline/runner.js').PipelineRunner
  agent: import('../db/store.js').AgentRow
  quoteSigner: import('../quotes/sign.js').QuoteSigner
  config: Record<string, unknown>
}

/** Capability tools from enabled, first-party capability skills. Third-party
 *  code never loads through this path. */
export async function capabilityTools (
  skills: ResolvedSkill[],
  ctx: SkillToolContext,
  skillsDir: string = SKILLS_DIR
): Promise<ToolSet> {
  const out: ToolSet = {}
  for (const s of skills) {
    if (s.kind !== 'capability' || !s.enabled) continue
    if (s.provider !== 'ABC' || s.referenceOnly) continue
    // import the file that exists: tool.ts under tsx/vitest, tool.js if compiled
    const tsPath = join(skillsDir, s.slug, 'tool.ts')
    const jsPath = join(skillsDir, s.slug, 'tool.js')
    const loadPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null
    if (!loadPath) continue
    const mod = await import(pathToFileURL(loadPath).href) as { createTools?: (c: SkillToolContext) => ToolSet }
    if (typeof mod.createTools !== 'function') continue
    Object.assign(out, mod.createTools(ctx))
  }
  return out
}
