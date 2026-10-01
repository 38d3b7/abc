import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'default'
  children: ReactNode
}

export function Button ({ variant = 'default', children, ...rest }: Props) {
  const cls = variant === 'default' ? 'btn' : `btn ${variant}`
  return <button className={cls} {...rest}>{children}</button>
}
