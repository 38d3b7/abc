import { EXECUTOR_BASE } from '../api/client'

/** Operator-facing hint when the agents list (executor) call fails. */
export function executorUnreachableMessage (err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('unauthorized') || msg.includes('401')) {
    return `Executor rejected the API key at ${EXECUTOR_BASE}. Set VITE_ABC_API_KEY in console/.env.local to match the executor's ABC_API_KEY, then restart the dev server.`
  }

  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('load failed')
    || (err instanceof TypeError && lower.includes('fetch'))
  ) {
    const localHint = EXECUTOR_BASE.includes('localhost')
      ? ' Start Postgres (port 55432) and the executor: `cd executor && npm run migrate && npm run dev`.'
      : ' Set VITE_EXECUTOR_URL on the console deployment to your public executor URL and redeploy.'
    return `Executor unreachable at ${EXECUTOR_BASE}.${localHint} Local dev also needs VITE_ABC_API_KEY in console/.env.local.`
  }

  return `Executor error (${EXECUTOR_BASE}): ${msg}`
}
