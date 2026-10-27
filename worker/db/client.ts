import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function database(env: Env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false })
  return drizzle(client, { schema, casing: 'snake_case' })
}

export type Database = ReturnType<typeof database>
