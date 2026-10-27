import postgres from 'postgres'
import { afterAll, expect, test } from 'vitest'
import type { Profile } from '../../shared/profile'

const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 1 })
afterAll(() => sql.end())

const profile = (name: string): Profile => ({
  name,
  headline: 'Test person',
  age: null,
  city: null,
  bio: 'A test person.',
  current_work: '',
  expertise: [],
  interests: [],
  looking_for: '',
  avoid: '',
  conversation_style: '',
  fun_facts: [],
  links: [],
  avatar: {
    skin_tone: '#c68642',
    hair_color: '#2c1b10',
    hair_style: 'short',
    facial_hair: 'none',
    glasses: 'none',
    top_style: 't-shirt',
    top_color: '#3366cc',
    bottom_style: 'pants',
    bottom_color: '#222222',
    shoe_color: '#111111',
  },
  sources: [],
})

class Rollback extends Error {}

test('a signed-in person reads only their own rows', async () => {
  await sql
    .begin(async (tx) => {
      const [userA, userB] = [crypto.randomUUID(), crypto.randomUUID()]
      await tx`insert into auth.users (id) values (${userA}), (${userB})`
      const [a, b] = await tx<{ id: string }[]>`
        insert into people (user_id, profile)
        values (${userA}, ${tx.json(profile('A'))}), (${userB}, ${tx.json(profile('B'))})
        returning id`
      const [conversation] = await tx<{ id: string }[]>`
        insert into conversations (person_a, person_b, place_id)
        values (least(${a!.id}::uuid, ${b!.id}::uuid), greatest(${a!.id}::uuid, ${b!.id}::uuid), 'test')
        returning id`
      await tx`
        insert into impressions (owner_id, about_id, conversation_id, verdict, reason)
        values (${a!.id}, ${b!.id}, ${conversation!.id}, 'match', 'Great talk')`
      await tx`insert into owner_messages (person_id, direction, text) values (${a!.id}, 'to_owner', 'Hi')`
      await tx`insert into messages (conversation_id, sender_id, text) values (${conversation!.id}, ${a!.id}, 'Hello')`

      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claim.sub', ${userB}, true)`
      const visible = await tx`
        select
          (select count(*) from people)::int as people,
          (select count(*) from impressions)::int as impressions,
          (select count(*) from owner_messages)::int as owner_messages,
          (select count(*) from messages)::int as messages`
      expect(visible[0]).toEqual({ people: 1, impressions: 0, owner_messages: 0, messages: 0 })

      await tx`select set_config('request.jwt.claim.sub', ${userA}, true)`
      const own = await tx`
        select
          (select count(*) from impressions)::int as impressions,
          (select count(*) from owner_messages)::int as owner_messages,
          (select count(*) from messages)::int as messages`
      expect(own[0]).toEqual({ impressions: 1, owner_messages: 1, messages: 0 })
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
})
