import { and, asc, eq, gt, isNotNull, lt, or } from 'drizzle-orm'
import type { Editable } from '../../shared/profile'
import { people, profileDrafts } from '../db/schema'
import { updateAgentConfig } from '../omnara/agents'
import type { Services } from '../tools/run'
import { logError } from '../log'
import { lockPeople, markConfigSynced, updateProfile } from '../world/people'
import { templateVersion, worldAgentConfig } from './agent-config'
import { linkedInIdentity } from './builder'
import { launchPerson } from './launch'

export async function saveProfile(services: Services, env: Env, userId: string, edits: Editable) {
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
  const identity = await linkedInIdentity(db, userId)
  if (!fixed || !identity) return null
  const looking_for = edits.looking_for.map((goal) => goal.replace(/\s+/g, ' ').trim())
  const changed = (field: string) =>
    field in edits &&
    JSON.stringify(edits[field as keyof Editable]) !==
      JSON.stringify(fixed[field as keyof Editable])
  const profile = {
    ...fixed,
    ...edits,
    looking_for,
    name: identity.name,
    sources: fixed.sources.filter((source) => !changed(source.field)),
  }
  const portrait = !person && draft?.profile ? draft.portrait : null
  if (!person?.agentId) return launchPerson(services, env, userId, profile, portrait)
  await db.transaction((tx) =>
    updateProfile({ tx, now: new Date(), deliveries: [] }, person.id, profile, portrait),
  )
  await syncAgentConfig(services, person.id).catch((error: unknown) =>
    logError('agent config sync will be retried', error),
  )
  return person.id
}

export async function syncAgentConfig(services: Services, personId: string) {
  await services.db.transaction(async (tx) => {
    const world = { tx, now: new Date(), deliveries: [] }
    const person = (await lockPeople(world, [personId])).get(personId)
    if (!person?.agentId) return
    const current =
      person.profileVersion <= person.configVersion && person.templateVersion >= templateVersion
    if (current) return
    await updateAgentConfig(
      services.omnara,
      person.agentId,
      worldAgentConfig({ id: person.id, profile: person.profile }),
    )
    await markConfigSynced(world, person.id, {
      configVersion: person.profileVersion,
      templateVersion,
    })
  })
}

export async function syncAllAgentConfigs(services: Services) {
  let after: string | undefined
  for (;;) {
    const page = await services.db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          isNotNull(people.agentId),
          or(
            gt(people.profileVersion, people.configVersion),
            lt(people.templateVersion, templateVersion),
          ),
          after ? gt(people.id, after) : undefined,
        ),
      )
      .orderBy(asc(people.id))
      .limit(200)
    if (page.length === 0) return
    for (const { id } of page) {
      await syncAgentConfig(services, id).catch((error: unknown) =>
        logError('agent config sync will be retried', error),
      )
    }
    after = page.at(-1)!.id
  }
}
