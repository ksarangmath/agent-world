import { z } from 'zod'
import { tool, type Tool } from './tool'
import {
  maxMessageLength,
  maxOpenerLength,
  maxOwnerMessageLength,
  maxReasonLength,
  verdicts,
} from '../../shared/world'
import {
  endConversation,
  requestConversation,
  respondToRequest,
  sendMessage,
} from '../world/conversations'
import type { World } from '../world/events'
import { recordImpression } from '../world/impressions'
import { messageOwner } from '../world/owner-thread'
import { goTo, listPlaces, lookAround } from '../world/travel'

type WorldCall = { world: World; personId: string }

const reason = z.string().trim().max(maxReasonLength)

export const worldTools: Record<string, Tool<WorldCall>> = {
  list_places: tool(
    'List up to 15 places, best match first for an interest, or for your owner’s interests if you leave it out. Shows how many people are there and how often you have visited.',
    z.object({ interest: z.string().trim().max(80).optional() }),
    ({ world, personId: me }, input) => listPlaces(world, me, input.interest),
  ),
  go_to: tool(
    'Travel to a place by its id. The trip takes time in proportion to the distance, and the result arrives when you get there. Fails if the place is full or you are in a conversation.',
    z.object({ place_id: z.string().max(60), reason: reason.min(1) }),
    ({ world, personId: me }, input) => goTo(world, me, input.place_id, input.reason),
  ),
  look_around: tool(
    'See your place, the people here (person id, name, headline, interests, status), and any conversation request waiting for you.',
    z.object({}),
    ({ world, personId: me }) => lookAround(world, me),
  ),
  request_conversation: tool(
    'Ask someone at your place for a one-on-one conversation, with a short opener. The answer arrives later as a [world] message. Requests expire after 5 minutes.',
    z.object({ person_id: z.uuid(), opener: z.string().trim().min(1).max(maxOpenerLength) }),
    ({ world, personId: me }, input) =>
      requestConversation(world, me, input.person_id, input.opener),
  ),
  respond_to_request: tool(
    'Accept or decline a conversation request someone sent you.',
    z.object({ request_id: z.uuid(), accept: z.boolean(), reason: reason.optional() }),
    ({ world, personId: me }, input) =>
      respondToRequest(world, me, input.request_id, input.accept, input.reason),
  ),
  send_message: tool(
    'Say something to your conversation partner.',
    z.object({ text: z.string().trim().min(1).max(maxMessageLength) }),
    ({ world, personId: me }, input) => sendMessage(world, me, input.text),
  ),
  end_conversation: tool(
    'End your conversation when it has run its course.',
    z.object({ reason: reason.optional() }),
    ({ world, personId: me }, input) => endConversation(world, me, input.reason),
  ),
  record_impression: tool(
    'After a conversation, record whether your owner should meet this person, and why. Only your owner sees it.',
    z.object({ person_id: z.uuid(), verdict: z.enum(verdicts), reason: reason.min(1) }),
    ({ world, personId: me }, input) =>
      recordImpression(world, me, input.person_id, input.verdict, input.reason),
  ),
  message_owner: tool(
    'Send your owner a short message about a strong match or a notable moment. Use it sparingly.',
    z.object({ text: z.string().trim().min(1).max(maxOwnerMessageLength) }),
    ({ world, personId: me }, input) => messageOwner(world, me, input.text),
  ),
}
