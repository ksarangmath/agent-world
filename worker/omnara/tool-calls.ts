import { ApiError, sdk, type ToolCall } from '@omnara/sdk'
import type { Omnara } from './client'

export type { ToolCall }

export type ToolResult = {
  outcome: 'succeeded' | 'failed'
  content_blocks: (
    { type: 'text'; text: string } | { type: 'media'; media_type: 'image/webp'; data: string }
  )[]
}

export async function readyCustomCalls(omnara: Omnara, agentId: string): Promise<ToolCall[]> {
  const calls: ToolCall[] = []
  let cursor: string | undefined
  do {
    const { data: page } = await sdk.listToolCalls({
      client: omnara.client,
      path: { ...omnara.path, agentID: agentId },
      query: { type: 'custom', state: 'ready', cursor },
    })
    calls.push(...page.data)
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return calls
}

export async function submitResult(
  omnara: Omnara,
  agentId: string,
  toolCallId: string,
  result: ToolResult,
) {
  try {
    await sdk.submitToolCallResult({
      client: omnara.client,
      path: { ...omnara.path, agentID: agentId, toolCallID: toolCallId },
      body: result,
    })
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error
  }
}
