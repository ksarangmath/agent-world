import { and, asc, eq, gt, isNotNull } from 'drizzle-orm'
import type { Profile } from '../../shared/profile'
import { people, profileDrafts } from '../db/schema'
import { updateAgentConfig } from '../omnara/agents'
import type { Services } from '../tools/run'
import { logError } from '../log'
import { lockPeople, markConfigSynced, updateProfile } from '../world/people'
import { worldAgentConfig } from './agent-config'
import { launchPerson } from './launch'

export async function saveProfile(services: Services, env: Env, userId: string, edited: Profile) {
  const { db } = services
  const [person] = await db
    .select({ id: people.id, agentId: people.agentId, profile: people.profile })
    .from(people)
    .where(eq(people.userId, userId))
  const [draft] = await db
    .select({ profile: profileDrafts.profile, portrait: profileDrafts.portrait })
    .from(profileDrafts)
    .where(eq(profileDrafts.userId, userId))
  const fixed = person?.profile ?? draft?.profile
  if (!fixed) return null
  const profile = { ...edited, avatar: fixed.avatar, sources: fixed.sources, links: fixed.links }
  const portrait = !person && draft?.profile ? draft.portrait : null
  if (!person?.agentId) return launchPerson(services, env, userId, profile, portrait)
  await db.transaction((tx) =>
    updateProfile({ tx, now: new Date(), deliveries: [] }, person.id, profile, portrait),
  )
  await syncAgentConfig(services, env, person.id).catch((error: unknown) =>
    logError('agent config sync will be retried', error),
  )
  return person.id
}

export async function syncAgentConfig(services: Services, env: Env, personId: string) {
  await services.db.transaction(async (tx) => {
    const world = { tx, now: new Date(), deliveries: [] }
    const person = (await lockPeople(world, [personId])).get(personId)
    if (!person?.agentId || person.profileVersion <= person.configVersion) return
    await updateAgentConfig(
      services.omnara,
      person.agentId,
      worldAgentConfig(env, { id: person.id, profile: person.profile }),
    )
    await markConfigSynced(world, person.id, person.profileVersion)
  })
}

export async function syncAllAgentConfigs(services: Services, env: Env) {
  let after: string | undefined
  for (;;) {
    const page = await services.db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          isNotNull(people.agentId),
          gt(people.profileVersion, people.configVersion),
          after ? gt(people.id, after) : undefined,
        ),
      )
      .orderBy(asc(people.id))
      .limit(200)
    if (page.length === 0) return
    for (const { id } of page) {
      await syncAgentConfig(services, env, id).catch((error: unknown) =>
        logError('agent config sync will be retried', error),
      )
    }
    after = page.at(-1)!.id
  }
}
