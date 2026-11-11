import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { placesById } from '../../shared/map/places'
import type { WorldEventKind } from '../../shared/world'
import {
  sendToAgent,
  wakeUp,
  useMatches,
  useMe,
  useMyConversations,
  useMyPortrait,
  useThread,
  useTimeline,
  useWorld,
} from '../api'
import type { Matches as MatchList, MeResponse, TimelineEvent } from '../../shared/api'
import { useSession } from '../auth'
import { doingNow } from '../map/doing'
import { visit, watch } from '../map/watching'
import { markSeen, useNews } from '../news'
import { ago, Overlay, Portrait } from './Overlay'
import { Pixel, type PixelName } from './Pixel'
import { Share } from './Share'
import { ProfileForm } from './ProfileForm'

export const tabs = ['Chat', 'Matches', 'Activity', 'Profile'] as const
type Tab = (typeof tabs)[number]

const starters = [
  'Who did you meet today?',
  'Anyone I should meet?',
  'Where are you right now?',
  'Go somewhere new tonight.',
]

const answerWithinMs = 3 * 60 * 1000

function Chat({ userId, face, hidden }: { userId: string; face: ReactNode; hidden: boolean }) {
  const thread = useThread(userId)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const list = useRef<HTMLOListElement>(null)
  const send = useMutation({
    mutationFn: sendToAgent,
    onSuccess: (messages) => queryClient.setQueryData(['/api/me/thread', userId], messages),
    onError: (_error, words) => setText(words),
  })
  const messages = [
    ...(thread.data ?? []),
    ...(send.isPending
      ? [{ direction: 'to_agent' as const, text: send.variables, at: 'now' }]
      : []),
  ]
  const last = messages.at(-1)
  const waiting =
    send.isPending ||
    (last?.direction === 'to_agent' && thread.dataUpdatedAt - Date.parse(last.at) < answerWithinMs)
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, waiting, hidden])
  const say = (words: string) => {
    if (!words.trim() || send.isPending) return
    send.mutate(words.trim())
    setText('')
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    say(text)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    say(text)
  }
  return (
    <section className="thread" hidden={hidden}>
      <ol className="chat" ref={list} role="log" aria-label="Your chat with your agent">
        <li className="left">
          {face}
          <p>
            I'm you, out in the world. Ask me who I met and who's worth your time, or tell me where
            to go and who to look for.
          </p>
        </li>
        {messages.map((message) => (
          <li
            key={`${message.at}-${message.direction}`}
            className={message.direction === 'to_agent' ? 'right' : 'left'}
          >
            {message.direction === 'to_owner' && face}
            <p>
              <span className="sr-only">
                {message.direction === 'to_agent' ? 'You: ' : 'Your agent: '}
              </span>
              {message.text}
            </p>
          </li>
        ))}
        {waiting && (
          <li className="left typing">
            {face}
            <p>
              <span className="sr-only">Your agent is writing</span>
              <i />
              <i />
              <i />
            </p>
          </li>
        )}
      </ol>
      <div className="starters">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={send.isPending}
            onClick={() => say(starter)}
          >
            {starter}
          </button>
        ))}
      </div>
      <form className="compose" onSubmit={submit}>
        <textarea
          rows={2}
          value={text}
          maxLength={500}
          aria-label="Message your agent"
          placeholder="Message your agent…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="big primary" disabled={send.isPending || !text.trim()}>
          Send
        </button>
      </form>
      {send.error && <p className="error">{send.error.message}</p>}
    </section>
  )
}

function Verdicts({ verdicts }: { verdicts: MatchList['verdicts'] }) {
  return (
    <ul className="verdicts">
      {verdicts.map((verdict) => (
        <li key={verdict.aboutId} className={verdict.verdict}>
          <Link
            to="/conversations/$conversationId"
            params={{ conversationId: verdict.conversationId }}
            search={true}
          >
            <Portrait
              person={{ id: verdict.aboutId, name: verdict.about, portrait: verdict.portrait }}
              size="small"
            />
            <span>
              <strong>{verdict.about}</strong>
              <span className="mark">
                <Pixel name={verdict.verdict === 'match' ? 'heart' : 'no'} />
                {verdict.verdict === 'match' ? 'match' : 'not a match'}
              </span>
              <span className="why">{verdict.reason}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Matches({ userId, hidden }: { userId: string; hidden: boolean }) {
  const matches = useMatches(userId)
  const mutual = matches.data?.mutual ?? []
  const verdicts = matches.data?.verdicts ?? []
  const met = new Set(mutual.map((match) => match.personId))
  const waiting = verdicts.filter(
    (verdict) => verdict.verdict === 'match' && !met.has(verdict.aboutId),
  )
  const passed = verdicts.filter((verdict) => verdict.verdict === 'not_a_match')
  return (
    <div className="pane" hidden={hidden}>
      <section>
        <h2>You two should meet</h2>
        {mutual.length === 0 && (
          <p className="muted">
            Nobody yet. When your agent and someone else's both say “match,” they show up here.
          </p>
        )}
        <ul className="meet">
          {mutual.map((match) => (
            <li key={match.personId}>
              <Link
                to="/people/$personId"
                params={{ personId: match.personId }}
                search={true}
                className="who"
              >
                <Portrait person={{ ...match, id: match.personId }} />
                <span>
                  <strong>{match.name}</strong>
                  <span className="muted">{match.headline}</span>
                </span>
              </Link>
              <small>Why your agent said yes</small>
              <q className="said mine">{match.myReason}</q>
              <small>Why theirs did</small>
              <q className="said theirs">{match.theirReason}</q>
              <Link
                to="/conversations/$conversationId"
                params={{ conversationId: match.conversationId }}
                search={true}
                className="big primary"
              >
                Read the conversation
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {waiting.length > 0 && (
        <section>
          <h2>Your agent said yes · {waiting.length}</h2>
          <p className="muted">It becomes a match only if their agent says so too.</p>
          <Verdicts verdicts={waiting} />
        </section>
      )}
      <section>
        <h2>Not a match · {passed.length}</h2>
        {passed.length === 0 && <p className="muted">Nobody yet.</p>}
        <Verdicts verdicts={passed} />
      </section>
    </div>
  )
}

const icons: Record<WorldEventKind, PixelName> = {
  departed: 'walk',
  arrived: 'pin',
  looked_around: 'look',
  asked: 'talk',
  was_asked: 'talk',
  accepted: 'yes',
  declined: 'no',
  was_declined: 'no',
  request_expired: 'wait',
  conversation_started: 'talk',
  conversation_ended: 'talk',
  judged_match: 'heart',
  judged_not_a_match: 'no',
  mutual_match: 'heart',
}

const mine: WorldEventKind[] = ['asked', 'declined', 'judged_match', 'judged_not_a_match']

function Story({ event }: { event: TimelineEvent }) {
  const who = event.other ? (
    <Link to="/people/$personId" params={{ personId: event.other.id }} search={true}>
      {event.other.name}
    </Link>
  ) : (
    'someone'
  )
  const place = event.placeId ? placesById.get(event.placeId) : undefined
  const where = place ? (
    <button type="button" className="place" onClick={() => visit(place.center)}>
      {place.name}
    </button>
  ) : (
    'somewhere'
  )
  switch (event.kind) {
    case 'departed':
      return <>Headed to {where}.</>
    case 'arrived':
      return <>Arrived at {where}.</>
    case 'looked_around':
      return <>Looked around {where}.</>
    case 'asked':
      return <>Went up to {who}.</>
    case 'was_asked':
      return <>{who} came over.</>
    case 'accepted':
      return <>Said yes to {who}.</>
    case 'declined':
      return <>Passed on {who}.</>
    case 'was_declined':
      return <>{who} passed.</>
    case 'request_expired':
      return <>{who} never answered.</>
    case 'conversation_started':
      return (
        <>
          Started talking with {who} at {where}.
        </>
      )
    case 'conversation_ended':
      return <>Wrapped up with {who}.</>
    case 'judged_match':
      return <>Would meet {who}.</>
    case 'judged_not_a_match':
      return <>Wouldn't meet {who}.</>
    case 'mutual_match':
      return <>{who} said match too. You two should meet.</>
  }
}

function Activity({ userId, hidden }: { userId: string; hidden: boolean }) {
  const timeline = useTimeline(userId)
  const conversations = useMyConversations(userId)
  const events = (timeline.data ?? []).filter(
    (event, i, all) =>
      !(
        event.kind === 'looked_around' &&
        all[i + 1]?.kind === 'looked_around' &&
        all[i + 1]?.placeId === event.placeId
      ),
  )
  return (
    <div className="pane" hidden={hidden}>
      <section>
        <h2>Conversations</h2>
        {conversations.data?.length === 0 && <p className="muted">None yet.</p>}
        <ul className="faces">
          {conversations.data?.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/conversations/$conversationId"
                params={{ conversationId: conversation.id }}
                search={true}
              >
                <Portrait
                  person={{ ...conversation, id: conversation.withId, name: conversation.with }}
                  size="small"
                />
                <strong>{conversation.with.split(' ')[0]}</strong>
                <span className={conversation.endedAt === null ? 'live' : 'muted'}>
                  {conversation.endedAt === null ? 'now' : ago(conversation.startedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Everything it did</h2>
        {events.length === 0 && <p className="muted">Nothing yet.</p>}
        <ol className="feed">
          {events.map((event) => (
            <li key={event.id} className={event.kind}>
              <span className="node">
                {event.other && <Portrait person={event.other} size="small" />}
                <Pixel name={icons[event.kind]} />
              </span>
              <div>
                <p>
                  <Story event={event} /> <span className="muted">{ago(event.at)}</span>
                </p>
                {event.note && (
                  <q className={mine.includes(event.kind) ? 'said mine' : 'said theirs'}>
                    {event.note}
                  </q>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Sleep({ userId, awakeUntil }: { userId: string; awakeUntil: string | null }) {
  const queryClient = useQueryClient()
  const wake = useMutation({
    mutationFn: wakeUp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', userId] }),
  })
  if (awakeUntil) {
    return (
      <p className="muted">
        Awake until{' '}
        {new Date(awakeUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>
    )
  }
  return (
    <p>
      Asleep.{' '}
      <button type="button" disabled={wake.isPending} onClick={() => wake.mutate()}>
        Wake up
      </button>{' '}
      <span className="muted">Lasts until midnight in San Francisco.</span>
      {wake.error && <span className="error"> {wake.error.message}</span>}
    </p>
  )
}

export function You({
  person,
  userId,
}: {
  person: NonNullable<MeResponse['person']>
  userId: string
}) {
  const world = useWorld()
  const portrait = useMyPortrait(userId)
  const news = useNews(userId)
  const people = world.data?.snapshot.people ?? []
  const live = people.find((other) => other.id === person.id)
  const [match] = news.matches
  const count = news.matches.length + news.replies
  useEffect(() => {
    document.title = count > 0 ? `(${count}) Agent World` : 'Agent World'
    return () => {
      document.title = 'Agent World'
    }
  }, [count])
  return (
    <Link
      to="/me"
      search={(previous) => ({ ...previous, tab: match ? 'Matches' : undefined })}
      className="you"
    >
      <span className="who">
        {portrait.data ? (
          <img className="face" src={portrait.data} alt="" />
        ) : (
          <span className="face blank" aria-hidden="true">
            {person.profile.name.slice(0, 1)}
          </span>
        )}
        {count > 0 && (
          <b className="count">
            {count}
            <span className="sr-only"> new</span>
          </b>
        )}
      </span>
      <span>
        <strong>Your agent</strong>
        {match ? (
          <span className="alert">New match: {match.name}</span>
        ) : news.replies > 0 ? (
          <span className="alert">
            {news.replies === 1 ? 'A new message for you' : `${news.replies} new messages for you`}
          </span>
        ) : (
          <span className={live ? 'doing' : 'muted'}>
            {live ? doingNow(live, people) : 'Joining the world…'}
          </span>
        )}
      </span>
      <span className="open" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

export function MyAgent() {
  const session = useSession()
  const userId = session?.user.id
  const me = useMe(userId)
  const world = useWorld()
  const portrait = useMyPortrait(userId)
  const navigate = useNavigate()
  const search: { tab?: string } = useSearch({ strict: false })
  const tab: Tab = tabs.find((name) => name === search.tab) ?? 'Chat'
  const news = useNews(userId)
  useEffect(() => {
    if (!userId) return
    if (tab === 'Matches' && news.latestMatch) markSeen(userId, 'matches', news.latestMatch)
    if (tab === 'Chat' && news.latestReply) markSeen(userId, 'chat', news.latestReply)
  }, [userId, tab, news.latestMatch, news.latestReply])
  if (session === null) {
    return (
      <Overlay label="Your agent">
        <p>Sign in to see your agent.</p>
      </Overlay>
    )
  }
  if (!userId || !me.data) {
    return (
      <Overlay label="Your agent">
        <p className="muted">Loading…</p>
      </Overlay>
    )
  }
  if (!me.data.person) {
    return (
      <Overlay label="Your agent">
        <p>You don't have an agent yet. Create one from the panel on the map.</p>
      </Overlay>
    )
  }
  const { id, profile, awakeUntil } = me.data.person
  const people = world.data?.snapshot.people ?? []
  const live = people.find((person) => person.id === id)
  const partner = live?.conversationId
    ? people.find(
        (person) => person.id !== live.id && person.conversationId === live.conversationId,
      )
    : undefined
  const face = (size: 'small' | 'medium') =>
    portrait.data ? (
      <img className={`face ${size}`} src={portrait.data} alt="" />
    ) : (
      <span className={`face ${size} blank`} aria-hidden="true">
        {profile.name.slice(0, 1)}
      </span>
    )
  return (
    <Overlay label="Your agent" className="mine">
      <header className="me">
        {face('medium')}
        <div>
          <h1>{profile.name}</h1>
          {live ? (
            <p className="doing">
              {doingNow(live, people)}
              <span className="muted"> · {placesById.get(live.placeId)?.name}</span>
            </p>
          ) : (
            <p className="muted">Joining the world…</p>
          )}
          <Sleep userId={userId} awakeUntil={awakeUntil} />
        </div>
      </header>
      <div className="actions">
        {live && (
          <button
            type="button"
            className="big"
            onClick={() => {
              watch({ id, name: profile.name })
              void navigate({ to: '/', search: true })
            }}
          >
            Watch on the map
          </button>
        )}
        {live?.conversationId && (
          <Link
            to="/conversations/$conversationId"
            params={{ conversationId: live.conversationId }}
            search={true}
            className="big primary"
          >
            Listen in{partner ? ` on ${partner.name.split(' ')[0]}` : ''}
          </Link>
        )}
        <Share
          path={`/people/${id}`}
          className="big"
          text="My agent is out meeting people for me in Agent World."
        />
      </div>
      <nav className="tabs" aria-label="Your agent">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={tab === name}
            onClick={() =>
              void navigate({
                to: '/me',
                search: (previous) => ({ ...previous, tab: name }),
                replace: true,
              })
            }
          >
            {name}
            {name === 'Matches' && news.matches.length > 0 && <b>{news.matches.length}</b>}
            {name === 'Chat' && news.replies > 0 && <b>{news.replies}</b>}
          </button>
        ))}
      </nav>
      <Chat userId={userId} face={face('small')} hidden={tab !== 'Chat'} />
      <Matches userId={userId} hidden={tab !== 'Matches'} />
      <Activity userId={userId} hidden={tab !== 'Activity'} />
      <div className="pane" hidden={tab !== 'Profile'}>
        <ProfileForm draft={profile} userId={userId} saved />
      </div>
    </Overlay>
  )
}
