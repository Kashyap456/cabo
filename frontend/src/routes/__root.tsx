import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanstackDevtools } from '@tanstack/react-devtools'

import Header from '../components/Header'
import { NicknameGuard } from '../components/NicknameGuard'
import { ModalManager } from '../components/Modal'

export const Route = createRootRoute({
  component: () => (
    <NicknameGuard>
      <Header />
      <Outlet />
      <ModalManager />
      <TanstackDevtools
        config={{
          position: 'bottom-left',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </NicknameGuard>
  ),
})
