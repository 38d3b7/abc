/** Applies src/db/schema.sql to DATABASE_URL. Idempotent (IF NOT EXISTS). */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { config } from '../config.js'

const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const pool = new pg.Pool({ connectionString: config.databaseUrl })
try {
  await pool.query(sql)
  console.log('[migrate] schema applied to', config.databaseUrl.replace(/:[^:@]*@/, '://***@'))
} finally {
  await pool.end()
}
