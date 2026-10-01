import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // App records come from Postgres at request time; never cache a storefront.
  experimental: { dynamicIO: false }
}

export default nextConfig
