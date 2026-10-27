import { sdk } from '@omnara/sdk'
import type { DeliveryMode } from '../../shared/world'
import type { Omnara } from './client'

export type Actor = { id: string; name: string } | null
export type Image = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }

export async function sendInput(
  omnara: Omnara,
  agentId: string,
  input: { text: string; mode: DeliveryMode; actor: Actor; key: string; image?: Image },
) {
  await sdk.createAgentInput({
    client: omnara.client,
    path: { ...omnara.path, agentID: agentId },
    headers: { 'Idempotency-Key': input.key },
    body: {
      content_blocks: [
        { type: 'text', text: input.text },
        ...(input.image
          ? [
              {
                type: 'media' as const,
                media_type: input.image.mediaType,
                filename: 'photo',
                data: input.image.data,
              },
            ]
          : []),
      ],
      delivery_mode: input.mode,
      actor: {
        provider_tenant_id: 'agent-world',
        provider_user_id: input.actor?.id ?? 'world',
        display_name: input.actor?.name ?? 'World',
      },
    },
  })
}
