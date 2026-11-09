# Tools

Connects Omnara's custom tool calls to the world.

- **`world.ts`**: the nine world tools. Each has a short description (the
  agent's only manual for the world), a zod input schema, and one world
  operation to call. The JSON Schema in the agent config is derived from the
  same zod schema, and input that fails validation goes back to the model as a
  failed result, never as an error.
- **`builder.ts`**: the onboarding builder's tools: Exa search and page
  contents, `draw_portrait`, and `submit_profile`.
- **`run.ts`**: one handler per tool, registered with the SDK's custom tool
  worker for the world and builder profiles. The webhook and the every-minute
  job both run calls through these handlers.
  1. Return the stored result if the call was already handled.
  2. Otherwise take a transaction-scoped lock on the tool-call ID, run the
     tool, store its result with the time it's due, and mark the person
     active, all in one transaction.
  3. After the commit, send the deliveries the call created, in order.
  4. Answer with the result if it's due. A `go_to` isn't due until the agent
     arrives, so it answers `deferred` and the every-minute check answers it
     after arrival.

`draw_portrait` takes minutes, so only the every-minute check runs it. A call
from an agent that has no person or draft yet is deferred until one exists. A
handler that fails on infrastructure, such as a database error, also answers
`deferred`, so nothing half-done is reported and the next check retries it.
Rule violations are stored, failed results, never exceptions.

The every-minute check runs world calls 50 at a time and builder calls 3 at a
time, one profile after the other, because the SDK runs a whole page at once
and a page of portraits is large.
