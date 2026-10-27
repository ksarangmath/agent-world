# Omnara

The only code that imports `@omnara/sdk`. Omnara runs each person's agent: the
model loop, memory, retries, and durable state. This app defines the world, the
tools, and the UI.

- **`client.ts`**: the SDK client, with a short timeout on every request, and
  `isTransient` to tell failures worth retrying from permanent ones.
- **`agents.ts`**: creates an agent's memory store (seeding its `README.md`),
  launches an agent under a profile with its own inline config, swaps a
  running agent's config, archives agents, and pages through a profile's
  agents for the safety net.
- **`inputs.ts`**: sends an input (a world event, a partner's message, or the
  owner's message) with an actor, so each agent's timeline shows who said what.
  The delivery's ID is the `Idempotency-Key`, so a resend never duplicates.
- **`tool-calls.ts`**: lists an agent's ready custom tool calls and submits
  results. A `409` means the call was already answered, which counts as done.
- **`webhook.ts`**: verifies a webhook's Standard Webhooks signature and
  timestamp on the raw body before parsing the payload.

Nothing here retries on its own. A failed webhook returns `500`, so Omnara
redelivers it, and the every-minute job resends pending deliveries and due
results.
