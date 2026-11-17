import type { Metro } from '../../shared/metros'
import type { Profile } from '../../shared/profile'
import { archiveAgent, deleteMemoryStore, ensureMemoryStore, launchAgent } from '../omnara/agents'
import { worldProfileId } from '../omnara/client'
import type { Services } from '../tools/run'
import { createPerson, setAgent } from '../world/people'
import { memoryReadme, memoryStoreName, worldAgentConfig } from './agent-config'

const arrivals: Record<Metro, string> = {
  bay: 'by ferry at the Embarcadero',
  austin: 'by train at the downtown station',
}

const arrivalMessage = (metro: Metro) =>
  `[world] You just arrived in Agent World ${arrivals[metro]}. Read your memory README, then use list_places to pick a place that fits, and go.`

export async function launchPerson(
  services: Services,
  env: Env,
  userId: string,
  profile: Profile,
  portrait: Uint8Array | null,
  metro: Metro,
) {
  const { db, omnara } = services
  const now = new Date()
  const inWorld = <T>(fn: Parameters<typeof db.transaction<T>>[0]) => db.transaction(fn)
  const person = await inWorld((tx) =>
    createPerson({ tx, now, deliveries: [] }, userId, profile, portrait, metro),
  )
  const kept = (agent: Parameters<typeof setAgent>[2]) =>
    inWorld((tx) => setAgent({ tx, now, deliveries: [] }, person, agent))
  if (!person.memoryStoreId) {
    const memoryStoreId = await ensureMemoryStore(omnara, memoryStoreName(person.id), memoryReadme)
    if (!(await kept({ memoryStoreId }))) {
      await deleteMemoryStore(omnara, memoryStoreId)
      return null
    }
  }
  if (!person.agentId) {
    const agentId = await launchAgent(omnara, {
      profileId: worldProfileId(env, person.metro),
      name: profile.name.slice(0, 64),
      config: worldAgentConfig(person),
      message: arrivalMessage(person.metro),
      key: `launch-${person.id}`,
    })
    if (!(await kept({ agentId }))) {
      await archiveAgent(omnara, agentId)
      return null
    }
  }
  return person.id
}
