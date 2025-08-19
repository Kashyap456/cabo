import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$roomCode')({
  component: RouteComponent,
})

function RouteComponent() {
  const { roomCode } = Route.useParams()
  return <div>Hello {roomCode}!</div>
}
