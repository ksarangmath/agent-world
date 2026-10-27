import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from '@tanstack/react-router'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { queryClient, useMe } from './api'
import { signIn, signOut, useSession } from './auth'
import { Onboarding } from './screens/Onboarding'
import { MyAgent } from './screens/MyAgent'
import { PersonCardPage } from './screens/PersonCard'
import { Terms } from './screens/Terms'
import { TranscriptPage } from './screens/Transcript'
import './styles.css'

const WorldMap = lazy(() => import('./map/WorldMap'))

const rootRoute = createRootRoute()

const focusSearch = z
  .object({ x: z.number().optional(), y: z.number().optional(), zoom: z.number().optional() })
  .catch({})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search) => focusSearch.parse(search),
  component: Home,
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: Onboarding,
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: Terms,
})

const meRoute = createRoute({ getParentRoute: () => rootRoute, path: '/me', component: MyAgent })

const transcriptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations/$conversationId',
  component: TranscriptPage,
})

const personRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/people/$personId',
  component: PersonCardPage,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    onboardingRoute,
    termsRoute,
    meRoute,
    transcriptRoute,
    personRoute,
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const regions = [
  ['San Francisco', { x: 215, y: 233, zoom: 5 }],
  ['Marin', { x: 135, y: 88, zoom: 6 }],
  ['East Bay', { x: 379, y: 161, zoom: 5 }],
  ['South Bay', { x: 374, y: 430, zoom: 5 }],
] as const

function Home() {
  const session = useSession()
  const me = useMe(session?.user.id)
  const search = homeRoute.useSearch()
  const mine = me.data?.person?.tile
  const focus = search.x === undefined && mine ? { ...mine, zoom: 30 } : search
  return (
    <main className="home">
      <Suspense>
        <WorldMap focus={focus} />
      </Suspense>
      <header className="panel">
        <img className="lockup" src="/lockup.png" alt="Agent World" />
        <nav className="regions">
          {regions.map(([name, view]) => (
            <Link key={name} to="/" search={view}>
              {name}
            </Link>
          ))}
        </nav>
        {session === null && (
          <button type="button" onClick={() => void signIn()}>
            Join with LinkedIn
          </button>
        )}
        {session && (
          <p>
            Signed in as {String(session.user.user_metadata.name ?? session.user.email)}
            {me.data && (me.data.person ? ', and your agent is in the world.' : '.')}{' '}
            {me.data?.person && <Link to="/me">Your agent</Link>}{' '}
            {me.data && !me.data.person && <Link to="/onboarding">Create your agent</Link>}{' '}
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        )}
      </header>
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
