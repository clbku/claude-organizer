import type { FastifyInstance } from 'fastify'

export function registerEventsWs(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/ws/projects/:projectId',
    { websocket: true },
    (socket, req) => {
      const { projectId } = req.params

      const unsubscribe = app.events.subscribe((event) => {
        if ((event as { projectId?: string }).projectId !== projectId) return
        try {
          socket.send(JSON.stringify(event))
        } catch {
          // socket may be closing
        }
      })

      socket.on('close', () => unsubscribe())
      socket.on('error', () => unsubscribe())

      try {
        socket.send(JSON.stringify({ type: 'hello', projectId }))
      } catch {
        // ignore
      }
    }
  )
}
