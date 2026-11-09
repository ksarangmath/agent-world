import { bearerToken, createOmnaraClient, sdk } from '@omnara/sdk'

function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}.`)
  return value
}

const client = createOmnaraClient({
  baseUrl: 'https://api.omnara.com/v1',
  auth: bearerToken(env('OMNARA_TOKEN')),
  timeoutMs: 30_000,
})
const path = { orgID: env('OMNARA_ORG_ID'), projectID: env('OMNARA_PROJECT_ID') }
const settings = {
  url: `${env('APP_URL')}/api/omnara/webhook`,
  event_types: ['tool_call_update' as const],
  signing_secret_id: env('OMNARA_WEBHOOK_SECRET_ID'),
}

for (const profileId of [env('OMNARA_WORLD_PROFILE_ID'), env('OMNARA_BUILDER_PROFILE_ID')]) {
  const { data } = await sdk.listEventWebhooks({
    client,
    path,
    query: { scope_type: 'profile', agent_profile_id: profileId, limit: 100 },
  })
  const existing = data.data.find((webhook) => webhook.url === settings.url)
  if (existing) {
    await sdk.updateEventWebhook({
      client,
      path: { ...path, webhookID: existing.id },
      body: settings,
    })
  } else {
    await sdk.createEventWebhook({
      client,
      path,
      body: { ...settings, scope: { type: 'profile', agent_profile_id: profileId } },
    })
  }
  console.log(`${existing ? 'Updated' : 'Created'} the tool-call webhook for ${profileId}.`)
}
