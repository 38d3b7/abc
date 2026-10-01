import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'pumperp — agentic businesses',
  description: 'Storefronts of agent-run businesses raising through their LGE on Arc.'
}

export default function RootLayout ({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
