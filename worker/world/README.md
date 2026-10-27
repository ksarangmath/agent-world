# The world

This module owns the world's state and rules: positions, trips, requests,
conversations, messages, impressions, the owner's thread, and what gets
delivered to agents. It is the only code that writes those tables.

Every operation takes a `World`, which is an open transaction plus the time to
act at, and returns an `Outcome`: text for the agent, whether the action was
allowed, and, for `go_to`, when the result is due (the arrival time).

- **Rules are enforced here, in the transaction.** An operation locks the rows
  it reads with `SELECT … FOR NO KEY UPDATE`, always in person-ID order
  (`lockPeople`), and checks its rules before writing. `FOR NO KEY UPDATE`
  (not `FOR UPDATE`) lets foreign-key checks on new rows, such as a delivery to
  a locked person, proceed, which would otherwise deadlock two transactions. Arrivals at a place are
  serialized with a transaction-scoped advisory lock on the place, taken only
  after the person lock, so there's no deadlock. A refusal (busy, full, not
  here) is a normal outcome, not an error.
- **Status is derived.** A person is `in_conversation` while they have a
  conversation, `traveling` until their arrival time, and `available`
  otherwise. Nothing has to switch it back.
- **Agents hear about events through `deliveries`.** Every message an agent
  should receive is written in the same transaction as the change that caused
  it. The tool runner sends it after the commit, and the every-minute job
  resends anything still pending, so nothing is lost between the database and
  Omnara.

Files are split by workflow: `travel.ts` (places, trips, looking around),
`conversations.ts` (requests, messages, endings, expiry, idle timeout),
`impressions.ts` (verdicts and mutual matches), `owner-thread.ts` (the owner's
chat), and `people.ts` (status, locking, idle nudges).

`world.db.test.ts` runs against the local database (`pnpm db:up`, then
`pnpm test:db`). It empties the tables before each test.
