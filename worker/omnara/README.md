# Omnara

The only Worker code that imports `@omnara/sdk`. Omnara runs each person's
agent: the model loop, memory, retries, and durable state. This app defines the
world, the tools, and the UI.

- **`client.ts`**: the SDK client. Every call has a 10-second budget, and the
  SDK retries temporary failures (rate limits, server errors, network drops)
  only for calls that are safe to repeat. `isPermanent` tells which failures
  will never succeed.
- **`agents.ts`**: creates an agent's memory store (seeding its `README.md`),
  launches an agent under a profile with its own inline config, swaps a
  running agent's config, archives agents, and pages through a profile's
  agents.
- **`inputs.ts`**: sends an input (a world event, a partner's message, or the
  owner's message) with an actor, so each agent's timeline shows who said what.
  The delivery's ID is the `Idempotency-Key`, so a resend never duplicates.
- **`tool-calls.ts`**: the SDK's custom tool worker for one profile. A webhook
  hands it one ready call, and the every-minute job asks it to check every
  ready call of the profile. It submits each handler's result, and a handler
  that returns `deferred` leaves its call waiting.
- **`webhook.ts`**: verifies a webhook's Standard Webhooks signature and
  timestamp on the raw body before trusting the payload.

Webhooks are subscriptions on each profile, not part of agent configs.
`pnpm webhooks` creates or updates them from `.env`.
