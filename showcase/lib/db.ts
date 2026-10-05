import postgres from 'postgres'

/**
 * The showcase store. The executor is the source of truth and pushes app
 * records here on publish/edit; these reads render the storefronts.
 * DATABASE_URL points at the Supabase pooler (transaction mode — no
 * prepared statements) with the least-privilege showcase_writer role.
 */

export interface ShowcaseApp {
  id: string
  agentId: string
  slug: string
  name: string
  tagline: string
  idea: string
  roadmap: Array<{ text: string; done: boolean }>
  links: Array<{ label: string; url: string }>
  xHandle: string | null
  tokenAddress: string | null
  hookAddress: string | null
  published: boolean
  createdAt: string
  updatedAt: string
}

let sql: postgres.Sql | null = null

function client (): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    sql = postgres(url, { prepare: false, max: 2 })
  }
  return sql
}

interface Row {
  id: string
  agent_id: string
  slug: string
  name: string
  tagline: string
  idea: string
  roadmap: Array<{ text: string; done: boolean }>
  links: Array<{ label: string; url: string }>
  x_handle: string | null
  token_address: string | null
  hook_address: string | null
  published: boolean
  created_at: Date
  updated_at: Date
}

/** jsonb columns read back as parsed values; tolerate a double-encoded
 *  string from an older write path. */
function jsonColumn<T> (v: T | string | null): T {
  if (v == null) return [] as unknown as T
  if (typeof v === 'string') return JSON.parse(v) as T
  return v
}

function toApp (r: Row): ShowcaseApp {
  return {
    id: r.id,
    agentId: r.agent_id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    idea: r.idea,
    roadmap: jsonColumn<ShowcaseApp['roadmap']>(r.roadmap),
    links: jsonColumn<ShowcaseApp['links']>(r.links),
    xHandle: r.x_handle ?? null,
    tokenAddress: r.token_address,
    hookAddress: r.hook_address,
    published: r.published,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  }
}

export async function getAppBySlug (slug: string): Promise<ShowcaseApp | null> {
  const rows = await client()`SELECT * FROM apps WHERE slug = ${slug} AND published LIMIT 1` as Row[]
  return rows[0] ? toApp(rows[0]) : null
}

export async function listPublished (): Promise<ShowcaseApp[]> {
  const rows = await client()`SELECT * FROM apps WHERE published ORDER BY updated_at DESC` as Row[]
  return rows.map(toApp)
}

/** Map hook addresses to published agent slugs via the executor's campaigns
 *  table. This catches launches whose app record was published before the
 *  hook address was written, or where the hook address lives on the agent
 *  rather than the app row. */
export async function getPublishedCampaignSlugsByHook (hooks: string[]): Promise<Map<string, { slug: string; name: string }>> {
  if (hooks.length === 0) return new Map()
  const normalized = hooks.map(h => h.toLowerCase())
  try {
    const rows = await client()`
      SELECT DISTINCT ON (c.hook_address) c.hook_address, a.slug, a.name
      FROM campaigns c
      JOIN apps a ON a.agent_id = c.agent_id
      WHERE c.hook_address = ANY(${normalized}::text[])
        AND a.published
      ORDER BY c.hook_address, a.updated_at DESC
    ` as { hook_address: string; slug: string; name: string }[]
    return new Map(rows.map(r => [r.hook_address.toLowerCase(), { slug: r.slug, name: r.name }]))
  } catch {
    // The showcase_writer role may not have SELECT on campaigns; fall back
    // to the app.hook_address mapping already loaded above.
    return new Map()
  }
}

/** The write API's upsert. Caller has already authenticated. */
export async function upsertApp (app: ShowcaseApp): Promise<void> {
  const db = client()
  await db`
    INSERT INTO apps (id, agent_id, slug, name, tagline, idea, roadmap, links, x_handle, token_address, hook_address, published, updated_at)
    VALUES (${app.id}, ${app.agentId}, ${app.slug}, ${app.name}, ${app.tagline}, ${app.idea},
            ${db.json(app.roadmap)}, ${db.json(app.links)}, ${app.xHandle},
            ${app.tokenAddress}, ${app.hookAddress}, ${app.published}, now())
    ON CONFLICT (agent_id) DO UPDATE SET
      slug = EXCLUDED.slug,
      name = EXCLUDED.name,
      tagline = EXCLUDED.tagline,
      idea = EXCLUDED.idea,
      roadmap = EXCLUDED.roadmap,
      links = EXCLUDED.links,
      x_handle = EXCLUDED.x_handle,
      token_address = EXCLUDED.token_address,
      hook_address = EXCLUDED.hook_address,
      published = EXCLUDED.published,
      updated_at = now()`
}
