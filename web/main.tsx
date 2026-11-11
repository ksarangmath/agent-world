import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { lazy, StrictMode, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { queryClient, useMe, useWorld } from './api'
import { signIn, signOut, useSession } from './auth'
import { ConversationOverlay } from './screens/Conversation'
import { CreateAgent } from './screens/Onboarding'
import { matched, mine, tour } from './map/watching'
import { useNews } from './news'
import { MyAgent, tabs, You } from './screens/MyAgent'
import { Notices } from './screens/Notices'
import { PersonOverlay } from './screens/Person'
import { Terms } from './screens/Terms'
import './styles.css'

const WorldMap = lazy(() => import('./map/WorldMap'))

const rootRoute = createRootRoute()

const focusSearch = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    zoom: z.number().optional(),
    tab: z.enum(tabs).optional(),
  })
  .catch({})

const worldRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'world',
  validateSearch: (search) => focusSearch.parse(search),
  component: World,
})

const homeRoute = createRoute({
  getParentRoute: () => worldRoute,
  path: '/',
  component: () => null,
})

const termsRoute = createRoute({
  getParentRoute: () => worldRoute,
  path: '/terms',
  component: Terms,
})

const meRoute = createRoute({ getParentRoute: () => worldRoute, path: '/me', component: MyAgent })

const conversationRoute = createRoute({
  getParentRoute: () => worldRoute,
  path: '/conversations/$conversationId',
  component: ConversationOverlay,
})

const personRoute = createRoute({
  getParentRoute: () => worldRoute,
  path: '/people/$personId',
  component: PersonOverlay,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    worldRoute.addChildren([homeRoute, conversationRoute, personRoute, meRoute, termsRoute]),
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function World() {
  const session = useSession()
  const me = useMe(session?.user.id)
  const search = worldRoute.useSearch()
  const person = me.data?.person
  const focus = search.x === undefined && person?.tile ? { ...person.tile, zoom: 30 } : search
  const news = useNews(person ? session?.user.id : undefined)
  const world = useWorld()
  const talking = (world.data?.snapshot.people ?? []).filter((one) => one.conversationId).length / 2
  const friends = (news.mutual ?? []).map((match) => match.personId).join(' ')
  useEffect(() => {
    mine.set(person?.id ?? null)
    matched.set(new Set(friends ? friends.split(' ') : []))
  }, [person?.id, friends])
  return (
    <main className="home">
      <Suspense>
        <WorldMap focus={focus} />
      </Suspense>
      <header className="panel">
        <img className="lockup" src="/lockup.png" alt="Agent World" />
        {talking > 0 && (
          <button type="button" className="pulse" onClick={() => tour(true)}>
            <i className="talking-dot" />
            {talking === 1 ? '1 conversation' : `${talking} conversations`} happening now
          </button>
        )}
        {session === null && (
          <button type="button" className="big linkedin" onClick={() => void signIn()}>
            <span className="mark" aria-hidden="true">
              in
            </span>
            Join with LinkedIn
          </button>
        )}
        {session && person && <You person={person} userId={session.user.id} />}
        {session && (
          <p className="account">
            Signed in as {String(session.user.user_metadata.name ?? session.user.email)}.{' '}
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        )}
        {session && me.data && !me.data.person && <CreateAgent userId={session.user.id} />}
      </header>
      {session && person && <Notices userId={session.user.id} personId={person.id} />}
      <Outlet />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
