import { describe, expect, test } from 'vitest'
import { verifyWebhook } from './webhook'

const secret = btoa('agent-world-webhook-signing-key!')
const body = JSON.stringify({
  event: 'tool_call_update',
  data: {
    org_id: 'org_5n6a2bfgik7mv4qtrwz3jehcyd',
    project_id: 'proj_5n6a2bfgik7mv4qtrwz3jehcyd',
    tool_call_id: 'tcl_5n6a2bfgik7mv4qtrwz3jehcyd',
    agent_id: 'agt_5n6a2bfgik7mv4qtrwz3jehcyd',
    agent_profile_id: null,
    parent_agent_id: null,
    root_agent_id: 'agt_5n6a2bfgik7mv4qtrwz3jehcyd',
    state: 'ready',
    name: 'look_around',
    input: {},
  },
})

async function signed(payload: string, at = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const id = 'msg_test'
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${at}.${payload}`),
  )
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': String(at),
    'webhook-signature': `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`,
  })
}

describe('webhook verification', () => {
  test('accepts a correctly signed, current payload', async () => {
    const payload = await verifyWebhook(secret, body, await signed(body))
    expect(payload?.event).toBe('tool_call_update')
  })

  test('rejects a body that does not match its signature', async () => {
    const headers = await signed(body)
    expect(await verifyWebhook(secret, body.replace('look_around', 'go_to'), headers)).toBeNull()
  })

  test('rejects a signature made with another key', async () => {
    expect(
      await verifyWebhook(btoa('a-different-signing-key-entirely'), body, await signed(body)),
    ).toBeNull()
  })

  test('rejects a stale timestamp', async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60
    expect(await verifyWebhook(secret, body, await signed(body, tenMinutesAgo))).toBeNull()
  })
})
