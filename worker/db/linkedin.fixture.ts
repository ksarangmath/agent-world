import postgres from 'postgres'

const admin = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'

export async function signInWithLinkedIn(
  userId: string,
  identity: { name: string; picture: string | null },
) {
  const sql = postgres(admin, { max: 1 })
  await sql`
    create table if not exists auth.identities (
      provider_id text not null,
      user_id uuid not null references auth.users (id) on delete cascade,
      identity_data jsonb not null,
      provider text not null,
      id uuid primary key default gen_random_uuid()
    )`
  await sql`grant select on auth.identities to postgres`
  await sql`
    insert into auth.identities (provider_id, user_id, identity_data, provider)
    values (${`li-${userId}`}, ${userId}, ${sql.json(identity)}, 'linkedin_oidc')`
  await sql.end()
}
