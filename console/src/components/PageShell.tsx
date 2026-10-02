import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  lead?: ReactNode
  titleAside?: ReactNode
  toolbar?: ReactNode
  className?: string
  children: ReactNode
}

/** Standard page layout: intro block, optional toolbar, content. */
export function PageShell ({ title, lead, titleAside, toolbar, className = '', children }: PageShellProps) {
  return (
    <div className={`page-frame${className ? ` ${className}` : ''}`}>
      <header className="page-intro">
        <div className="page-title-row">
          <h1>{title}</h1>
          {titleAside ? <div className="page-title-aside">{titleAside}</div> : null}
        </div>
        {lead ? <div className="sub">{lead}</div> : null}
      </header>
      {toolbar}
      {children}
    </div>
  )
}

interface PageSectionProps {
  title: string
  lead?: ReactNode
  children: ReactNode
}

/** Secondary block on the same page (e.g. inference ledger below intents). */
export function PageSection ({ title, lead, children }: PageSectionProps) {
  return (
    <section className="page-section">
      <header className="page-section-head">
        <h2>{title}</h2>
        {lead ? <div className="sub">{lead}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function PageStatus ({ title, message }: { title: string; message: string }) {
  return (
    <div className="page-frame">
      <header className="page-intro"><h1>{title}</h1></header>
      <p className="muted">{message}</p>
    </div>
  )
}
