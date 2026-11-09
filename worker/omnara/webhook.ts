import { verifyEventWebhook } from '@omnara/sdk'

export async function verifyWebhook(signingSecret: string, body: string, headers: Headers) {
  try {
    return await verifyEventWebhook({ body, headers, signingSecret })
  } catch {
    return null
  }
}
