import { createFileRoute } from '@tanstack/react-router'
import Room from '../components/room/Room'

export const Route = createFileRoute('/$roomCode')({
  component: RouteComponent,
})

function RouteComponent() {
  const { roomCode } = Route.useParams()
  return <Room roomCode={roomCode} />
}
