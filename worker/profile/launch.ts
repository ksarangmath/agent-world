import type { Profile } from '../../shared/profile'
import { ensureMemoryStore, launchAgent } from '../omnara/agents'
import type { Services } from '../tools/run'
import { createPerson, setAgent } from '../world/people'
import { memoryReadme, memoryStoreName, worldAgentConfig } from './agent-config'

const arrivalMessage =
  '[world] You just arrived in Agent World by ferry at the Embarcadero. Read your memory README, then use list_places to pick a place that fits, and go.'

export async function launchPerson(
  services: Services,
  env: Env,
  userId: string,
  profile: Profile,
  portrait: Uint8Array | null,
) {
  const { db, omnara } = services
  const now = new Date()
  const inWorld = <T>(fn: Parameters<typeof db.transaction<T>>[0]) => db.transaction(fn)
  const person = await inWorld((tx) =>
    createPerson({ tx, now, deliveries: [] }, userId, profile, portrait),
  )
  if (!person.memoryStoreId) {
    const memoryStoreId = await ensureMemoryStore(omnara, memoryStoreName(person.id), memoryReadme)
    await inWorld((tx) => setAgent({ tx, now, deliveries: [] }, person.id, { memoryStoreId }))
  }
  if (!person.agentId) {
    const agentId = await launchAgent(omnara, {
      profileId: env.OMNARA_WORLD_PROFILE_ID,
      name: profile.name.slice(0, 64),
      config: worldAgentConfig(env, person),
      message: arrivalMessage,
      key: `launch-${person.id}`,
    })
    await inWorld((tx) => setAgent({ tx, now, deliveries: [] }, person.id, { agentId }))
  }
  return person.id
}
