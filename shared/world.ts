export const verdicts = ['match', 'not_a_match'] as const
export type Verdict = (typeof verdicts)[number]

export const requestStatuses = ['pending', 'accepted', 'declined', 'expired'] as const
export type RequestStatus = (typeof requestStatuses)[number]

export const ownerMessageDirections = ['to_owner', 'to_agent'] as const
export type OwnerMessageDirection = (typeof ownerMessageDirections)[number]

export const linkedInProblems = [
  'no-sign-in-photo',
  'not-a-profile',
  'not-found',
  'no-public-photo',
  'not-yours',
  'unreachable',
] as const
export type LinkedInProblem = (typeof linkedInProblems)[number]

export const deliveryModes = ['queued', 'steering'] as const
export type DeliveryMode = (typeof deliveryModes)[number]

export const worldEventKinds = [
  'departed',
  'arrived',
  'looked_around',
  'asked',
  'was_asked',
  'accepted',
  'declined',
  'was_declined',
  'request_expired',
  'conversation_started',
  'conversation_ended',
  'judged_match',
  'judged_not_a_match',
  'mutual_match',
] as const
export type WorldEventKind = (typeof worldEventKinds)[number]

export type PersonStatus = 'available' | 'in_conversation' | 'traveling' | 'asleep' | 'resting'

export const maxOpenerLength = 280
export const maxMessageLength = 300
export const longMessageLength = 140
export const maxReasonLength = 300
export const maxOwnerMessageLength = 500
