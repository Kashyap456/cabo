import { createFileRoute } from '@tanstack/react-router'

import LandingPage from '@/components/home/LandingPage'

export const Route = createFileRoute('/')({
  component: LandingPage,
})
