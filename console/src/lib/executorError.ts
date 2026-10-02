import { EXECUTOR_BASE } from '../api/client'

/** Operator-facing hint when the agents list (executor) call fails. */
export function executorUnreachableMessage (err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('unauthorized') || msg.includes('401')) {
    return `Session expired or rejected by the executor at ${EXECUTOR_BASE}. Sign out and sign in again.`
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
    return `Executor unreachable at ${EXECUTOR_BASE}.${localHint}`
  }

  return `Executor error (${EXECUTOR_BASE}): ${msg}`
}
