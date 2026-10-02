import type { SelectHTMLAttributes } from 'react'

/** Styled native select — matches text inputs; wrap adds chevron. */
export function Select ({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-wrap${className ? ` ${className}` : ''}`}>
      <select className="select" {...props} />
    </span>
  )
}
