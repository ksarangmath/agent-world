import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid, authUsers } from 'drizzle-orm/supabase'
import type { Profile } from '../../shared/profile'
import {
  deliveryModes,
  maxMessageLength,
  maxOpenerLength,
  maxOwnerMessageLength,
  maxReasonLength,
  ownerMessageDirections,
  requestStatuses,
  verdicts,
  worldEventKinds,
} from '../../shared/world'

const timestamptz = () => timestamp({ withTimezone: true })
const createdAt = () => timestamptz().notNull().defaultNow()
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
})
const maxLength = (column: AnyPgColumn, limit: number): SQL =>
  sql`char_length(${column}) <= ${sql.raw(String(limit))}`
const ownedBy = (personId: AnyPgColumn): SQL =>
  sql`${personId} in (select ${people.id} from ${people} where ${people.userId} = ${authUid})`

export const requestStatus = pgEnum('request_status', requestStatuses)
export const verdict = pgEnum('verdict', verdicts)
export const ownerMessageDirection = pgEnum('owner_message_direction', ownerMessageDirections)
export const deliveryMode = pgEnum('delivery_mode', deliveryModes)
export const worldEventKind = pgEnum('world_event_kind', worldEventKinds)

export const people = pgTable(
  'people',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    profile: jsonb().$type<Profile>().notNull(),
    agentId: text().unique(),
    memoryStoreId: text(),
    placeId: text(),
    tileX: integer(),
    tileY: integer(),
    tripFromX: integer(),
    tripFromY: integer(),
    departedAt: timestamptz(),
    arrivesAt: timestamptz(),
    conversationId: uuid().references((): AnyPgColumn => conversations.id),
    lastActiveAt: createdAt(),
    lastNudgedAt: timestamptz(),
    profileVersion: integer().notNull().default(0),
    configVersion: integer().notNull().default(0),
    portrait: bytes(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('people_tile').on(t.placeId, t.tileX, t.tileY),
    pgPolicy('people_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
)

export const conversationRequests = pgTable(
  'conversation_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    fromId: uuid()
      .notNull()
      .references(() => people.id),
    toId: uuid()
      .notNull()
      .references(() => people.id),
    placeId: text().notNull(),
    opener: text().notNull(),
    status: requestStatus().notNull().default('pending'),
    expiresAt: timestamptz().notNull(),
    respondedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('conversation_requests_one_pending')
      .on(t.fromId)
      .where(sql`${t.status} = 'pending'`),
    index('conversation_requests_pending_to')
      .on(t.toId)
      .where(sql`${t.status} = 'pending'`),
    index('conversation_requests_pending_expiry')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
    check('conversation_requests_opener_length', maxLength(t.opener, maxOpenerLength)),
  ],
).enableRLS()

export const conversations = pgTable(
  'conversations',
  {
    id: uuid().primaryKey().defaultRandom(),
    personA: uuid()
      .notNull()
      .references(() => people.id),
    personB: uuid()
      .notNull()
      .references(() => people.id),
    placeId: text().notNull(),
    startedAt: createdAt(),
    lastMessageAt: createdAt(),
    endedAt: timestamptz(),
    endedBy: uuid().references(() => people.id),
    endReason: text(),
  },
  (t) => [
    index('conversations_pair').on(t.personA, t.personB, t.startedAt),
    index('conversations_person_b').on(t.personB, t.startedAt),
    index('conversations_active_last_message')
      .on(t.lastMessageAt)
      .where(sql`${t.endedAt} is null`),
    check('conversations_ordered_pair', sql`${t.personA} < ${t.personB}`),
    check('conversations_end_reason_length', maxLength(t.endReason, maxReasonLength)),
  ],
).enableRLS()

export const messages = pgTable(
  'messages',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id),
    senderId: uuid()
      .notNull()
      .references(() => people.id),
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_conversation').on(t.conversationId, t.id),
    check('messages_text_length', maxLength(t.text, maxMessageLength)),
  ],
).enableRLS()

export const impressions = pgTable(
  'impressions',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => people.id),
    aboutId: uuid()
      .notNull()
      .references(() => people.id),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id),
    verdict: verdict().notNull(),
    reason: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('impressions_one_per_conversation').on(t.ownerId, t.conversationId),
    index('impressions_about').on(t.aboutId, t.ownerId),
    check('impressions_reason_length', maxLength(t.reason, maxReasonLength)),
    pgPolicy('impressions_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: ownedBy(t.ownerId),
    }),
  ],
)

export const ownerMessages = pgTable(
  'owner_messages',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    personId: uuid()
      .notNull()
      .references(() => people.id),
    direction: ownerMessageDirection().notNull(),
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('owner_messages_person').on(t.personId, t.id),
    check('owner_messages_text_length', maxLength(t.text, maxOwnerMessageLength)),
    pgPolicy('owner_messages_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: ownedBy(t.personId),
    }),
  ],
)

export const handledToolCalls = pgTable(
  'handled_tool_calls',
  {
    toolCallId: text().primaryKey(),
    agentId: text().notNull(),
    result: jsonb().notNull(),
    dueAt: createdAt(),
    postedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('handled_tool_calls_unposted')
      .on(t.dueAt)
      .where(sql`${t.postedAt} is null`),
  ],
).enableRLS()

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    sequence: bigint({ mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    personId: uuid()
      .notNull()
      .references(() => people.id),
    actorId: uuid().references(() => people.id),
    mode: deliveryMode().notNull(),
    text: text().notNull(),
    deliveredAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('deliveries_pending')
      .on(t.personId, t.sequence)
      .where(sql`${t.deliveredAt} is null`),
  ],
).enableRLS()

export const worldEvents = pgTable(
  'world_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    personId: uuid()
      .notNull()
      .references(() => people.id),
    kind: worldEventKind().notNull(),
    placeId: text(),
    otherId: uuid().references(() => people.id),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('world_events_person').on(t.personId, t.id),
    check('world_events_note_length', maxLength(t.note, maxReasonLength)),
  ],
).enableRLS()

export const profileDrafts = pgTable(
  'profile_drafts',
  {
    userId: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    runId: uuid().notNull(),
    builderAgentId: text().unique(),
    links: jsonb().$type<string[]>().notNull(),
    profile: jsonb().$type<Profile>(),
    photoUrl: text(),
    portrait: bytes(),
    portraitCallId: text(),
    portraitClaimedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy('profile_drafts_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
)
