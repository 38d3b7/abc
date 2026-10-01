const EXPLORER = 'https://explorer.testnet.arc.io'

export function truncHash (h: string, left = 6, right = 4): string {
  if (h.length <= left + right + 1) return h
  return `${h.slice(0, left)}…${h.slice(-right)}`
}

/** Truncated-middle hash; click copies, shift-click (or the ↗) opens Blockscout. */
export function HashLink ({ hash, kind = 'address', left, right }: { hash: string; kind?: 'address' | 'tx'; left?: number; right?: number }) {
  return (
    <span>
      <span
        className="hashlink"
        title={`${hash} — click to copy`}
        onClick={(e) => {
          if (e.shiftKey) { window.open(`${EXPLORER}/${kind}/${hash}`, '_blank'); return }
          void navigator.clipboard?.writeText(hash)
        }}
      >
        {truncHash(hash, left, right)}
      </span>
      {' '}<a href={`${EXPLORER}/${kind}/${hash}`} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 10 }}>↗</a>
    </span>
  )
}
