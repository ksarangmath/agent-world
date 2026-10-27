import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './worker/db/schema.ts',
  out: './supabase/migrations',
  casing: 'snake_case',
  migrations: { prefix: 'supabase' },
  entities: { roles: { provider: 'supabase' } },
})
