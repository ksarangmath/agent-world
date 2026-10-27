import { zEventWebhookPayload } from '@omnara/sdk/zod'
import { Webhook } from 'standardwebhooks'

export function verifyWebhook(secret: string, body: string, headers: Record<string, string>) {
  try {
    return zEventWebhookPayload.parse(new Webhook(secret).verify(body, headers))
  } catch {
    return null
  }
}
