import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { checkRateLimit } from './rateLimit.js';
import { createMcpClient } from './mcp.js';
import { runChatStream, clearChatHistory } from './orchestrator.js';
import { DEFAULT_MODELS, type LLMOptions } from './llm/index.js';
import { resolveAuth } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConnectorRoutes } from './routes/connectors.js';
import { registerGoogleAuthRoutes } from './routes/google-auth.js';
import { registerMcpRegistryRoutes } from './routes/mcp-registry.js';
import type { ClientMessage, ServerMessage } from './types.js';

function send(socket: { send: (data: string) => void }, msg: ServerMessage): void {
  socket.send(JSON.stringify(msg));
}

function validateLegacyApiKey(token: string): boolean {
  return !!config.backendApiKey && token === config.backendApiKey;
}

async function main() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
    credentials: true,
  });
  await fastify.register(jwt, { secret: config.jwtSecret });
  await fastify.register(websocket);

  await registerAuthRoutes(fastify);
  await registerConnectorRoutes(fastify);
  await registerGoogleAuthRoutes(fastify);
  await registerMcpRegistryRoutes(fastify);

  fastify.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' });
  });

  fastify.post('/v1/clear-chat', async (req, reply) => {
    const auth = await resolveAuth(req, reply);
    if (!auth.token) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in or provide a valid API key' });
    }
    clearChatHistory();
    return reply.send({ ok: true });
  });

  fastify.get('/users/me', async (req, reply) => {
    const { user } = await resolveAuth(req, reply);
    if (!user) return reply.status(401).send({ error: 'unauthorized', message: 'Sign in required' });
    return reply.send({ user });
  });

  fastify.post<{
    Body: { id?: string; message?: string; context?: unknown; allow_tools?: boolean; provider?: LLMOptions['provider']; api_key?: string; model?: string };
  }>('/v1/chat', async (req, reply) => {
    const auth = await resolveAuth(req, reply);
    if (!auth.token) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in or provide a valid API key' });
    }
    const { message, context, allow_tools, provider, api_key, model } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: 'bad_request', message: 'Missing or invalid message' });
    }
    if (message.length > config.maxMessageLength) {
      return reply.status(400).send({ error: 'bad_request', message: `Message exceeds ${config.maxMessageLength} characters` });
    }
    const rl = checkRateLimit(auth.token, config.rateLimitRequestsPerMinute);
    if (!rl.allowed) {
      return reply.status(429).header('Retry-After', String(rl.retryAfter ?? 60)).send({ error: 'rate_limited', message: 'Too many requests' });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const sendSSE = (event: string, data: ServerMessage) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const llmOptions: LLMOptions = {
      provider: provider ?? 'claude',
      api_key: (api_key as string)?.trim() ?? config.anthropicApiKey,
      model: (model as string)?.trim() ?? DEFAULT_MODELS.claude,
    };
    const mcpClient = await createMcpClient(auth.user?.id);
    try {
      await runChatStream(
        message,
        context as import('./types.js').ContextPayload | undefined,
        allow_tools !== false,
        mcpClient,
        (m) => {
          const event = m.type === 'text_delta' ? 'text_delta' : m.type === 'tool_use' ? 'tool_use' : m.type === 'tool_result' ? 'tool_result' : m.type === 'done' ? 'done' : 'error';
          sendSSE(event, m);
        },
        llmOptions
      );
    } catch (err) {
      sendSSE('error', { type: 'error', code: 'upstream_error', message: err instanceof Error ? err.message : String(err) });
    }
    reply.raw.end();
  });

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    let token = url.searchParams.get('token') ?? '';

    let wsUserId: string | null = null;
    async function verifyToken(t: string): Promise<boolean> {
      if (!t) return false;
      if (validateLegacyApiKey(t)) return true;
      try {
        const decoded = await fastify.jwt.verify(t) as { userId?: string };
        if (decoded?.userId) wsUserId = decoded.userId;
        return true;
      } catch {
        return false;
      }
    }

    const authPromise = (async () => {
      const ok = await verifyToken(token);
      if (!ok) {
        send(socket, { type: 'error', code: 'unauthorized', message: 'Sign in or provide a valid API key' });
        socket.close();
        return false;
      }
      send(socket, { type: 'auth_ok' });
      return true;
    })();

    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        if (msg.type === 'auth') {
          const ok = await verifyToken(msg.token);
          if (ok) {
            token = msg.token;
            send(socket, { type: 'auth_ok' });
          } else {
            send(socket, { type: 'error', code: 'unauthorized', message: 'Invalid token' });
            socket.close();
          }
          return;
        }
        const authenticated = await authPromise;
        if (!authenticated) return;
        if (msg.type === 'ping') {
          send(socket, { type: 'pong' });
          return;
        }
        if (msg.type === 'chat') {
          const rl = checkRateLimit(token || 'anonymous', config.rateLimitRequestsPerMinute);
          if (!rl.allowed) {
            send(socket, {
              type: 'error',
              code: 'rate_limited',
              message: `Too many requests; retry after ${rl.retryAfter ?? 60}s`,
            });
            return;
          }
          if (!msg.message || typeof msg.message !== 'string') {
            send(socket, { type: 'error', code: 'bad_request', message: 'Missing or invalid message' });
            return;
          }
          if (msg.message.length > config.maxMessageLength) {
            send(socket, {
              type: 'error',
              code: 'bad_request',
              message: `Message exceeds ${config.maxMessageLength} characters`,
            });
            return;
          }
          const llmOptions: LLMOptions = {
            provider: msg.provider ?? 'claude',
            api_key: msg.api_key?.trim() ?? config.anthropicApiKey,
            model: msg.model?.trim() ?? DEFAULT_MODELS[msg.provider ?? 'claude'],
          };
          const mcpClient = await createMcpClient(wsUserId);
          try {
            await runChatStream(
              msg.message,
              msg.context,
              msg.allow_tools !== false,
              mcpClient,
              (m) => send(socket, m),
              llmOptions
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            send(socket, { type: 'error', code: 'upstream_error', message });
          }
        }
      } catch (err) {
        send(socket, {
          type: 'error',
          code: 'server_error',
          message: err instanceof Error ? err.message : 'Invalid request',
        });
      }
    });
  });

  const port = config.port;
  if (!config.anthropicApiKey) {
    fastify.log.warn('ANTHROPIC_API_KEY is not set; Claude will need per-request api_key from extension.');
  }
  if (!config.backendApiKey) {
    fastify.log.warn('BACKEND_API_KEY is not set; WebSocket auth will reject all connections.');
  }
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Server listening on http://0.0.0.0:${port}; WebSocket at ws://localhost:${port}/ws`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
