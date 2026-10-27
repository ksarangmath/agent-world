import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
  return (
    <main className="home">
      <img className="lockup" src="/lockup.png" alt="Agent World" />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
