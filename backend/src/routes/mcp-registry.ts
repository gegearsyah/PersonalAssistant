/**
 * MCP registry proxy (search) + per-user MCP config (stored in data/, not env).
 */

import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { getUserMcpServers, setUserMcpServers } from '../store/mcp-servers.js';
import type { McpServerConfig } from '../config.js';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io';

export async function registerMcpRegistryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/mcp-servers/config', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const servers = await getUserMcpServers(user.id);
    return reply.send({ servers });
  });

  fastify.put<{ Body: { servers?: unknown[] } }>('/api/mcp-servers/config', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const raw = req.body?.servers;
    const list = Array.isArray(raw)
      ? (raw.filter(
          (s): s is McpServerConfig =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as McpServerConfig).id === 'string' &&
            typeof (s as McpServerConfig).command === 'string'
        ) as McpServerConfig[])
      : [];
    await setUserMcpServers(user.id, list);
    return reply.send({ ok: true, servers: list });
  });

  fastify.get<{
    Querystring: { search?: string; limit?: string; cursor?: string };
  }>('/api/mcp-servers', async (req, reply) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const cursor = (req.query.cursor ?? '').trim();
    const search = (req.query.search ?? '').trim().toLowerCase();
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const url = `${REGISTRY_BASE}/v0.1/servers?${params.toString()}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        return reply.status(res.status).send({
          error: 'registry_error',
          message: `Registry returned ${res.status}`,
        });
      }
      const data = (await res.json()) as {
        servers?: Array<{ server?: { name?: string; title?: string; description?: string; packages?: unknown[]; remotes?: unknown[] }; _meta?: unknown }>;
        metadata?: { nextCursor?: string; count?: number };
      };
      let servers = data.servers ?? [];
      if (search) {
        servers = servers.filter((s) => {
          const name = (s.server?.name ?? '').toLowerCase();
          const title = (s.server?.title ?? '').toLowerCase();
          const desc = (s.server?.description ?? '').toLowerCase();
          return name.includes(search) || title.includes(search) || desc.includes(search);
        });
      }
      return reply.send({ servers, metadata: data.metadata ?? {} });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(502).send({
        error: 'registry_unavailable',
        message: err instanceof Error ? err.message : 'Failed to fetch registry',
      });
    }
  });
}
