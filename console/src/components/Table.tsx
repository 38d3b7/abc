import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'

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
  /** When set and rows exceed this count, paginate client-side. */
  pageSize?: number
}

export function Table<T> ({ columns, rows, keyOf, detail, empty = 'No rows.', pageSize }: Props<T>) {
  const [open, setOpen] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [rows, pageSize])

  const paginated = useMemo(() => {
    if (!pageSize || rows.length <= pageSize) return { slice: rows, pages: 1, page: 0 }
    const pages = Math.ceil(rows.length / pageSize)
    const safePage = Math.min(page, pages - 1)
    const start = safePage * pageSize
    return { slice: rows.slice(start, start + pageSize), pages, page: safePage }
  }, [rows, pageSize, page])

  const displayRows = paginated.slice
  const showPagination = Boolean(pageSize && rows.length > pageSize)

  function toggle (k: string) {
    setOpen(prev => (prev === k ? null : k))
  }

  function onRowKey (e: KeyboardEvent, k: string) {
    if (!detail) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(k)
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {detail ? <th className="expand-cell" aria-label="Expand" /> : null}
              {columns.map((c, i) => <th key={i} className={c.num ? 'num' : ''}>{c.head}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr className="empty-row"><td colSpan={columns.length + (detail ? 1 : 0)}>{empty}</td></tr>
            ) : displayRows.map(r => {
              const k = keyOf(r)
              const isOpen = open === k
              return (
                <Fragment key={k}>
                  <tr
                    className={`${detail ? 'row-expandable' : ''} ${isOpen ? 'open selected' : ''}`}
                    tabIndex={detail ? 0 : undefined}
                    aria-expanded={detail ? isOpen : undefined}
                    onClick={detail ? () => toggle(k) : undefined}
                    onKeyDown={detail ? e => onRowKey(e, k) : undefined}
                  >
                    {detail ? (
                      <td className="expand-cell" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="expand-btn"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                          onClick={() => toggle(k)}
                        >
                          <span className="chev">›</span>
                        </button>
                      </td>
                    ) : null}
                    {columns.map((c, i) => <td key={i} className={c.num ? 'num' : ''}>{c.cell(r)}</td>)}
                  </tr>
                  {detail && isOpen ? (
                    <tr className="row-detail">
                      <td colSpan={columns.length + 1}>
                        <div className="detail-panel">{detail(r)}</div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {showPagination ? (
        <div className="pagination">
          <span>
            {paginated.page * pageSize! + 1}–{Math.min((paginated.page + 1) * pageSize!, rows.length)} of {rows.length}
          </span>
          <button type="button" className="btn" disabled={paginated.page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <button type="button" className="btn" disabled={paginated.page >= paginated.pages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      ) : null}
    </>
  )
}
