/**
 * CORS + Chrome Private Network Access preflight behaviour.
 *
 * Observed behaviour being encoded: the deployed console
 * (https://app.agenticbusinessconsole.com) calling a loopback executor
 * triggers Chrome's "access other apps and services on this device"
 * prompt; after Allow, Chrome still blocks the fetch unless the preflight
 * response carries Access-Control-Allow-Private-Network: true (Chrome
 * 124+ PNA preflight, observed against the live executor 2026-10-02).
 * localhost origins stay allowed for local dev; anything else needs
 * ABC_ALLOWED_ORIGINS.
 *
 * config.ts reads env at module load, so set it before the dynamic import
 * (vitest gives each test file a fresh module registry).
 */

import { describe, it, expect } from 'vitest'

process.env.ABC_ALLOWED_ORIGINS = 'https://app.agenticbusinessconsole.com'

const { createApp } = await import('../src/api/server.js')
const { MemoryStore } = await import('../src/db/memory.js')

// Preflights and /health never touch runner/signer.
const app = createApp({
  store: new MemoryStore(),
  runner: {} as never,
  signer: {} as never
})

function preflight (origin: string, pna = false) {
  const headers: Record<string, string> = {
    origin,
    'access-control-request-method': 'GET',
    'access-control-request-headers': 'x-abc-key'
  }
  if (pna) headers['access-control-request-private-network'] = 'true'
  return app.request('/health', { method: 'OPTIONS', headers })
}

describe('CORS', () => {
  it('allows localhost on any port (local dev)', async () => {
    const res = await preflight('http://localhost:5174')
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174')
  })

  it('allows origins listed in ABC_ALLOWED_ORIGINS', async () => {
    const res = await preflight('https://app.agenticbusinessconsole.com')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.agenticbusinessconsole.com')
  })

  it('rejects unlisted origins', async () => {
    const res = await preflight('https://evil.example')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('echoes Access-Control-Allow-Private-Network on PNA preflights', async () => {
    const res = await preflight('https://app.agenticbusinessconsole.com', true)
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })

  it('does not send the PNA header when not requested', async () => {
    const res = await preflight('http://localhost:5174')
    expect(res.headers.get('access-control-allow-private-network')).toBeNull()
  })

  it('allows the Authorization header used by SIWE Bearer sessions', async () => {
    const headers: Record<string, string> = {
      origin: 'https://app.agenticbusinessconsole.com',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization'
    }
    const res = await app.request('/agents', { method: 'OPTIONS', headers })
    const allowed = res.headers.get('access-control-allow-headers')
    expect(allowed).toContain('authorization')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.agenticbusinessconsole.com')
  })
})
