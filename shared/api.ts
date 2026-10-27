import type { Tile } from './map/route'
import type { Avatar, Profile } from './profile'
import type { OwnerMessageDirection, Verdict } from './world'

export type MeResponse = { person: { id: string; profile: Profile; tile: Tile | null } | null }

export type WorldPerson = {
  id: string
  name: string
  avatar: Avatar
  placeId: string
  tile: Tile
  trip: { from: Tile; departedAt: string; arrivesAt: string } | null
  conversationId: string | null
}

export type WorldSnapshot = { now: string; people: WorldPerson[] }

export type OnboardingStatus =
  { status: 'none' | 'building' | 'failed' } | { status: 'ready'; draft: Profile }

export type Transcript = {
  id: string
  placeId: string
  people: { id: string; name: string; headline: string }[]
  endedAt: string | null
  messages: { senderId: string; text: string; at: string }[]
}

export type MyConversation = { id: string; with: string; startedAt: string; endedAt: string | null }

export type Matches = {
  verdicts: { about: string; aboutId: string; verdict: Verdict; reason: string; at: string }[]
  mutual: {
    personId: string
    name: string
    headline: string
    myReason: string
    theirReason: string
  }[]
}

export type ThreadMessage = { direction: OwnerMessageDirection; text: string; at: string }

export type PersonCard = {
  id: string
  name: string
  headline: string
  currentWork: string
  interests: string[]
  avatar: Avatar
  conversationId: string | null
  conversations: MyConversation[]
}
