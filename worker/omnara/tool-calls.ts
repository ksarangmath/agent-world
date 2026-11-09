import { createCustomToolWorker, type CustomToolCall, type ToolCallUpdate } from '@omnara/sdk'
import { logError } from '../log'
import type { Omnara } from './client'

export type { ToolCallUpdate }

export type ToolCall = Omit<CustomToolCall, 'signal'>

export type ToolResult = {
  outcome: 'succeeded' | 'failed'
  content_blocks: (
    { type: 'text'; text: string } | { type: 'media'; media_type: 'image/webp'; data: string }
  )[]
}

export const deferred = { outcome: 'deferred' } as const

export type ToolHandler = (call: ToolCall) => Promise<ToolResult | typeof deferred>

export type ToolWorker = ReturnType<typeof toolWorker>

export function toolWorker(omnara: Omnara, profileId: string, tools: Record<string, ToolHandler>) {
  return createCustomToolWorker({
    client: omnara.client,
    path: omnara.path,
    agentProfileID: profileId,
    tools,
    onError: (error) => logError('custom tool call failed', error),
  })
}
