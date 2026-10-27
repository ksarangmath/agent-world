import { z } from 'zod'
import type { ToolInputSchema } from '../omnara/agents'
import { refuse, type Outcome } from '../world/events'

export type Tool<Context> = {
  description: string
  inputSchema: ToolInputSchema
  call: (context: Context, input: unknown) => Promise<Outcome>
}

export function tool<Context, S extends z.ZodType>(
  description: string,
  input: S,
  run: (context: Context, input: z.infer<S>) => Promise<Outcome>,
): Tool<Context> {
  return {
    description,
    inputSchema: z.toJSONSchema(input) as ToolInputSchema,
    call: async (context, raw) => {
      const parsed = input.safeParse(raw)
      return parsed.success
        ? run(context, parsed.data)
        : refuse(`Invalid input: ${z.prettifyError(parsed.error)}`)
    },
  }
}

export const customTools = <Context>(tools: Record<string, Tool<Context>>) =>
  Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      { type: 'custom' as const, description: tool.description, input_schema: tool.inputSchema },
    ]),
  )
