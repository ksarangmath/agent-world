# Tools

Connects Omnara's custom tool calls to the world.

- **`world.ts`**: the nine world tools. Each has a short description (the
  agent's only manual for the world), a zod input schema, and one world
  operation to call. The JSON Schema in the agent config is derived from the
  same zod schema, and input that fails validation goes back to the model as a
  failed result, never as an error.
- **`run.ts`**: the single path for running a call, used by the webhook, by
  the every-minute safety net, and for `go_to` results that come due on
  arrival.
  1. Take a transaction-scoped lock on the tool-call ID, so a duplicate
     delivery waits and then finds the stored result instead of running the
     tool twice.
  2. Run the tool, store its result with the time it's due, and mark the
     person active, all in one transaction.
  3. After the commit, send the deliveries the call created, in order, then
     post the result if it's due.

A call is run only for an agent whose ID belongs to a person in this
environment's database, so test and production agents never cross.
