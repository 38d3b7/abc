import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The suite must see the same env regardless of the operator's shell:
    // config.apiKey falls back to 'dev-key' only when ABC_API_KEY is unset,
    // and a leaked shell env once turned every authed route test into a 401.
    env: {
      ABC_API_KEY: 'dev-key'
    }
  }
})
