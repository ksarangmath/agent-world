import {
  ApiError,
  sdk,
  type Agent,
  type AgentConfigDefinition,
  type AgentConfigDefinitionToolInputSchema,
} from '@omnara/sdk'
import type { Omnara } from './client'

export type AgentConfig = AgentConfigDefinition
export type { Agent }
export type ToolInputSchema = AgentConfigDefinitionToolInputSchema

export async function ensureMemoryStore(omnara: Omnara, name: string, readme: string) {
  const id = await sdk
    .createMemoryStore({
      client: omnara.client,
      path: omnara.path,
      body: { name, agent_access: 'read_write' },
    })
    .then(({ data }) => data.id)
    .catch(async (error: unknown) => {
      if (!(error instanceof ApiError && error.status === 409)) throw error
      const { data } = await sdk.listMemoryStores({
        client: omnara.client,
        path: omnara.path,
        query: { name, limit: 1 },
      })
      const existing = data.data[0]
      if (!existing) throw error
      return existing.id
    })
  await sdk.writeMemoryFile({
    client: omnara.client,
    path: { ...omnara.path, memoryStoreID: id },
    query: { path: 'README.md' },
    body: new Blob([readme], { type: 'text/markdown' }),
  })
  return id
}

export async function launchAgent(
  omnara: Omnara,
  launch: { profileId: string; name: string; config: AgentConfig; message?: string; key: string },
) {
  const { data } = await sdk.createAgent({
    client: omnara.client,
    path: omnara.path,
    headers: { 'Idempotency-Key': launch.key },
    body: {
      profile: launch.profileId,
      name: launch.name,
      config_source: { source: launch.config, source_format: 'json' },
      ...(launch.message && {
        initial_input: {
          content_blocks: [{ type: 'text' as const, text: launch.message }],
          actor: {
            provider_tenant_id: 'agent-world',
            provider_user_id: 'world',
            display_name: 'World',
          },
        },
      }),
    },
  })
  return data.agent.id
}

export async function updateAgentConfig(omnara: Omnara, agentId: string, config: AgentConfig) {
  await sdk.updateAgentConfig({
    client: omnara.client,
    path: { ...omnara.path, agentID: agentId },
    body: { source: config, source_format: 'json' },
  })
}

export async function archiveAgent(omnara: Omnara, agentId: string) {
  await sdk.archiveAgent({ client: omnara.client, path: { ...omnara.path, agentID: agentId } })
}

export async function* agentsOfProfile(omnara: Omnara, profileId: string): AsyncGenerator<Agent> {
  let cursor: string | undefined
  do {
    const { data: page } = await sdk.listAgents({
      client: omnara.client,
      path: omnara.path,
      query: { agent_profile_id: profileId, limit: 100, cursor },
    })
    yield* page.data
    cursor = page.next_cursor ?? undefined
  } while (cursor)
}
