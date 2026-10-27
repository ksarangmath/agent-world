import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient, useMe } from './api'
import { signIn, signOut, useSession } from './auth'
import './styles.css'

const rootRoute = createRootRoute()

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function Home() {
  const session = useSession()
  const me = useMe(session?.user.id)
  return (
    <main className="home">
      <img className="lockup" src="/lockup.png" alt="Agent World" />
      {session === null && (
        <button type="button" onClick={() => void signIn()}>
          Join with LinkedIn
        </button>
      )}
      {session && (
        <p>
          Signed in as {String(session.user.user_metadata.name ?? session.user.email)}
          {me.data && (me.data.person ? ', and your agent is in the world.' : '.')}{' '}
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      )}
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
