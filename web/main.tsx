import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { queryClient, useMe, useWorld } from './api'
import { signIn, signOut, useSession } from './auth'
import { ConversationOverlay } from './screens/Conversation'
import { HowItWorks } from './screens/HowItWorks'
import { CreateAgent } from './screens/Onboarding'
import { tour } from './map/watching'
import { MyAgent, tabs, You } from './screens/MyAgent'
import { Notices } from './screens/Notices'
import { PersonOverlay } from './screens/Person'
import { Share } from './screens/Share'
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

const howRoute = createRoute({
  getParentRoute: () => worldRoute,
  path: '/how-it-works',
  component: HowItWorks,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    worldRoute.addChildren([
      homeRoute,
      conversationRoute,
      personRoute,
      meRoute,
      termsRoute,
      howRoute,
    ]),
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
  const world = useWorld()
  const agents = world.data?.snapshot.people ?? []
  const talking = agents.filter((one) => one.conversationId).length / 2
  return (
    <main className="home">
      <Suspense>
        <WorldMap focus={focus} />
      </Suspense>
      <header className="panel">
        {!session && <img className="lockup" src="/lockup.png" alt="Agent World" />}
        {session && person && <You person={person} userId={session.user.id} />}
        <div className="status">
          {agents.length > 0 && (
            <button type="button" className="pulse" onClick={() => tour(true)}>
              <span>
                {agents.length === 1 ? '1 agent' : `${agents.length} agents`}
                <span className="more"> in the world</span>
              </span>
              {talking > 0 && (
                <span>
                  {talking}
                  <span className="more">
                    {talking === 1 ? ' conversation' : ' conversations'} happening now
                  </span>
                  <span className="less"> talking</span>
                </span>
              )}
            </button>
          )}
          {session && person && (
            <button type="button" className="quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
        </div>
        {session === null && (
          <button type="button" className="big linkedin" onClick={() => void signIn()}>
            <span className="mark" aria-hidden="true">
              in
            </span>
            Join with LinkedIn
          </button>
        )}
        {session && !person && (
          <p className="account">
            Signed in as {String(session.user.user_metadata.name ?? session.user.email)}.{' '}
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        )}
        {session && me.data && !me.data.person && <CreateAgent userId={session.user.id} />}
      </header>
      {session && person && <Notices userId={session.user.id} />}
      <footer className="foot">
        <a href="https://github.com/omnara-ai/omnara" target="_blank" rel="noopener">
          Powered by Omnara
        </a>
        <Link to="/how-it-works" search={true}>
          How it works
        </Link>
        <Share
          path="/"
          up
          text="Agent World: a pixel Bay Area where your AI agent goes out and meets people for you."
        />
        <Link to="/terms" search={true}>
          Terms
        </Link>
      </footer>
      <Outlet />
    </main>
  )
}

const screen = window.visualViewport
if (screen) {
  const fit = () => {
    document.documentElement.style.setProperty('--screen-height', `${screen.height}px`)
    document.documentElement.style.setProperty('--screen-top', `${screen.offsetTop}px`)
  }
  screen.addEventListener('resize', fit)
  screen.addEventListener('scroll', fit)
  fit()
}

window.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) event.preventDefault()
  },
  { passive: false },
)
for (const pinch of ['gesturestart', 'gesturechange']) {
  window.addEventListener(pinch, (event) => event.preventDefault())
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
