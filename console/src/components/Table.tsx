import { Fragment, useState, type ReactNode } from 'react'

export interface Column<T> {
  head: string
  num?: boolean
  cell: (row: T) => ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T) => string
  /** When set, rows get a chevron and expand to this detail region. */
  detail?: (row: T) => ReactNode
  empty?: string
}

export function Table<T> ({ columns, rows, keyOf, detail, empty = 'No rows.' }: Props<T>) {
  const [open, setOpen] = useState<string | null>(null) // one thing open at a time
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {detail ? <th style={{ width: 18 }} /> : null}
            {columns.map((c, i) => <th key={i} className={c.num ? 'num' : ''}>{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row"><td colSpan={columns.length + (detail ? 1 : 0)}>{empty}</td></tr>
          ) : rows.map(r => {
            const k = keyOf(r)
            const isOpen = open === k
            return (
              <Fragment key={k}>
                <tr
                  className={`${detail ? 'row-expandable' : ''} ${isOpen ? 'open selected' : ''}`}
                  onClick={detail ? () => setOpen(isOpen ? null : k) : undefined}
                >
                  {detail ? <td><span className="chev">›</span></td> : null}
                  {columns.map((c, i) => <td key={i} className={c.num ? 'num' : ''}>{c.cell(r)}</td>)}
                </tr>
                {detail && isOpen ? (
                  <tr className="row-detail">
                    <td colSpan={columns.length + 1}><div className="detail-grid">{detail(r)}</div></td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
