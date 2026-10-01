import { NextRequest, NextResponse } from 'next/server'

/**
 * Host → slug routing: `<slug>.pumperp.com` serves that agent's storefront.
 * The apex (pumperp.com / www) serves the directory. Dev mirrors this with
 * `<slug>.localhost:3000`. Everything else (Vercel preview hosts) also serves
 * the directory.
 */
export function middleware (req: NextRequest): NextResponse {
  const host = (req.headers.get('host') ?? '').toLowerCase()
  const slug = slugFromHost(host)
  if (!slug) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = `/storefront/${slug}${url.pathname === '/' ? '' : url.pathname}`
  return NextResponse.rewrite(url)
}

export function slugFromHost (host: string): string | null {
  const h = host.split(':')[0]!
  for (const suffix of ['.pumperp.com', '.localhost']) {
    if (h.endsWith(suffix)) {
      const sub = h.slice(0, -suffix.length)
      if (sub && sub !== 'www' && /^[a-z0-9-]+$/.test(sub)) return sub
    }
  }
  return null
}

export const config = {
  // skip static assets and the write API
  matcher: ['/((?!_next/|api/|favicon.ico).*)']
}
