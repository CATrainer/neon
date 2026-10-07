import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance } from 'fastify'
import { createMcpServer } from './server.js'
import type { Services } from '../services.js'

/**
 * MCP over Streamable HTTP, stateless: a server and a transport per request,
 * both closed when it ends.
 *
 * Stateless because there is nothing to keep — every tool call is a complete
 * unit of work against the database, and sessions would only add a thing to
 * expire. It also means an agent can reconnect mid-task without losing
 * anything.
 */
export async function registerMcpRoutes(app: FastifyInstance, services: Services) {
  app.post('/mcp', async (request, reply) => {
    const server = createMcpServer(services, request.neon)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })

    await server.connect(transport)
    // Fastify must not also try to answer: the transport owns this response.
    reply.hijack()
    await transport.handleRequest(request.raw, reply.raw, request.body)
  })

  // Stateless mode has no server-initiated stream and no session to delete.
  const notAllowed = async (_request: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.code(405).send({
      error: 'method_not_allowed',
      message: 'this MCP endpoint is stateless: use POST',
    })

  app.get('/mcp', notAllowed)
  app.delete('/mcp', notAllowed)
}
