import type { ReactNode } from 'react'

export function Drawer ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h1>{title}</h1>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  )
}
