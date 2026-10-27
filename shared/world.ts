export const verdicts = ['match', 'not_a_match'] as const
export type Verdict = (typeof verdicts)[number]

export const requestStatuses = ['pending', 'accepted', 'declined', 'expired'] as const
export type RequestStatus = (typeof requestStatuses)[number]

export const ownerMessageDirections = ['to_owner', 'to_agent'] as const
export type OwnerMessageDirection = (typeof ownerMessageDirections)[number]

export const deliveryModes = ['queued', 'steering'] as const
export type DeliveryMode = (typeof deliveryModes)[number]

export const worldEventKinds = [
  'arrived',
  'conversation_started',
  'conversation_ended',
  'mutual_match',
] as const
export type WorldEventKind = (typeof worldEventKinds)[number]

export type PersonStatus = 'available' | 'in_conversation' | 'traveling'

export const maxOpenerLength = 280
export const maxMessageLength = 500
export const maxReasonLength = 300
export const maxOwnerMessageLength = 500
