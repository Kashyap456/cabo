import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import React from 'react'

// Lazy load devtools only in development
const TanStackRouterDevtools = import.meta.env.MODE === 'production'
  ? () => null
  : React.lazy(() =>
      Promise.all([
        import('@tanstack/react-router-devtools'),
        import('@tanstack/react-devtools'),
      ]).then(([routerDevtools, reactDevtools]) => ({
        default: () => (
          <reactDevtools.TanstackDevtools
            config={{
              position: 'bottom-left',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <routerDevtools.TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ),
      }))
    )

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.MODE !== 'production' && (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools />
        </React.Suspense>
      )}
    </>
  ),
})
