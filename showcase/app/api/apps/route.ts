import { NextRequest, NextResponse } from 'next/server'
import { upsertApp, type ShowcaseApp } from '@/lib/db'

/**
 * The executor's push target. Bearer-authed with APPS_API_KEY; the body is
 * the executor's AppRow (snake_case fields mapped here). The executor is the
 * source of truth — this store only ever mirrors it.
 */
export async function POST (req: NextRequest): Promise<NextResponse> {
  const key = process.env.APPS_API_KEY
  if (!key) return NextResponse.json({ error: 'write API not configured' }, { status: 503 })
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // The executor sends its AppRow shape (camelCase). Validate the minimum.
  const required = ['id', 'agentId', 'slug', 'name'] as const
  for (const k of required) {
    if (typeof body[k] !== 'string' || !body[k]) {
      return NextResponse.json({ error: `missing field: ${k}` }, { status: 400 })
    }
  }
  if (!/^[a-z0-9-]+$/.test(body.slug as string)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }

  const app: ShowcaseApp = {
    id: body.id as string,
    agentId: body.agentId as string,
    slug: body.slug as string,
    name: body.name as string,
    tagline: typeof body.tagline === 'string' ? body.tagline : '',
    idea: typeof body.idea === 'string' ? body.idea : '',
    roadmap: Array.isArray(body.roadmap) ? body.roadmap as ShowcaseApp['roadmap'] : [],
    links: Array.isArray(body.links) ? body.links as ShowcaseApp['links'] : [],
    tokenAddress: typeof body.tokenAddress === 'string' ? body.tokenAddress : null,
    hookAddress: typeof body.hookAddress === 'string' ? body.hookAddress : null,
    published: body.published === true,
    updatedAt: new Date().toISOString()
  }

  try {
    await upsertApp(app)
  } catch (e) {
    return NextResponse.json({ error: `store failed: ${(e as Error).message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true, slug: app.slug })
}
