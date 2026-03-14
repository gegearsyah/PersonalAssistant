import type { FastifyInstance } from 'fastify';
import { listConnectors, setConnector, removeConnector, CONNECTOR_DEFINITIONS, type ConnectorService } from '../store/connectors.js';
import { requireUser } from '../auth.js';

const SERVICES: ConnectorService[] = ['notion', 'google'];

export async function registerConnectorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/users/me/connectors', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const connectors = await listConnectors(user.id);
    const allServices = SERVICES.map((s) => ({
      service: s,
      name: CONNECTOR_DEFINITIONS[s].name,
      description: CONNECTOR_DEFINITIONS[s].description,
      needsApiKey: CONNECTOR_DEFINITIONS[s].needsApiKey,
      connected: connectors.some((c) => c.service === s),
      connectedAt: connectors.find((c) => c.service === s)?.connectedAt,
    }));
    return reply.send({ connectors: allServices });
  });

  fastify.post<{
    Body: { service?: string; api_key?: string; refresh_token?: string };
  }>('/users/me/connectors', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { service, api_key, refresh_token } = req.body ?? {};
    if (!service || !SERVICES.includes(service as ConnectorService)) {
      return reply.status(400).send({ error: 'bad_request', message: 'Valid service required: notion, google' });
    }
    let cred: string;
    if ((service as ConnectorService) === 'google') {
      const rt = typeof refresh_token === 'string' ? refresh_token.trim() : '';
      if (!rt) return reply.status(400).send({ error: 'bad_request', message: 'refresh_token required for Google (use Sign in with Google)' });
      cred = JSON.stringify({ refresh_token: rt });
    } else {
      cred = typeof api_key === 'string' ? api_key.trim() : '';
      if (!cred) return reply.status(400).send({ error: 'bad_request', message: 'api_key required' });
    }
    await setConnector(user.id, service as ConnectorService, cred);
    return reply.send({ ok: true, service, message: 'Connected' });
  });

  fastify.delete<{ Params: { service: string } }>('/users/me/connectors/:service', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { service } = req.params;
    if (!SERVICES.includes(service as ConnectorService)) {
      return reply.status(400).send({ error: 'bad_request', message: 'Valid service required' });
    }
    const removed = await removeConnector(user.id, service as ConnectorService);
    if (!removed) return reply.status(404).send({ error: 'not_found', message: 'Connector not found' });
    return reply.send({ ok: true, message: 'Disconnected' });
  });
}
