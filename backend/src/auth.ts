import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';
import { findUserById } from './store/users.js';

export interface AuthUser {
  id: string;
  email: string;
}

/** Resolve auth from Bearer JWT or legacy X-API-Key. Sets request.user if JWT valid. Returns token string for rate limit key. */
export async function resolveAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<{ token: string; user: AuthUser | null }> {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = (req.headers['x-api-key'] as string) ?? '';

  if (bearer) {
    try {
      const decoded = await (req.server as { jwt: { verify: (t: string) => Promise<{ userId: string; email: string }> } }).jwt.verify(bearer) as { userId: string; email: string };
      const user = await findUserById(decoded.userId);
      if (user) {
        (req as FastifyRequest & { user: AuthUser }).user = { id: user.id, email: user.email };
        return { token: bearer.slice(0, 32), user: { id: user.id, email: user.email } };
      }
    } catch {
      // invalid JWT
    }
  }

  if (apiKey && config.backendApiKey && apiKey === config.backendApiKey) {
    return { token: apiKey, user: null };
  }

  return { token: '', user: null };
}

/** Require either valid JWT (user) or valid backend API key. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<{ token: string; user: AuthUser | null }> {
  const { token, user } = await resolveAuth(req, reply);
  if (!token) {
    return reply.status(401).send({ error: 'unauthorized', message: 'Sign in or provide a valid API key' }) as never;
  }
  return { token, user: user ?? null };
}

/** Require logged-in user (JWT). Rejects backend API key only. Returns null if unauthorized (reply already sent). */
export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser | null> {
  const { user } = await resolveAuth(req, reply);
  if (!user) {
    void reply.status(401).send({ error: 'unauthorized', message: 'Sign in required' });
    return null;
  }
  return user;
}
