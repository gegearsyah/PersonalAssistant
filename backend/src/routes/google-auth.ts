import type { FastifyInstance } from 'fastify';
import { getAuthUrl } from '../calendar.js';
import { setConnector, type ConnectorService } from '../store/connectors.js';
import { google } from 'googleapis';
import { config } from '../config.js';
import { findUserById } from '../store/users.js';

export async function registerGoogleAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const googleConfigured = !!(config.googleClientId && config.googleClientSecret);
  if (!googleConfigured) {
    fastify.log.warn('Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET); /auth/google will return 503.');
  }

  fastify.get<{ Querystring: { token?: string } }>('/auth/google', async (req, reply) => {
    if (!googleConfigured) {
      return reply.status(503).type('text/html').send(
        '<h1>Google OAuth not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend <code>.env</code> (see <code>backend/.env.example</code>), then restart the server.</p>'
      );
    }
    const token = req.query.token?.trim();
    if (!token) {
      return reply.status(400).send('<h1>Missing token</h1><p>Open Connectors in the extension and click Connect on Google.</p>');
    }
    let userId: string;
    try {
      const decoded = await fastify.jwt.verify(token) as { userId: string };
      userId = String(decoded.userId);
      const user = await findUserById(userId);
      if (!user) return reply.status(401).send('<h1>Invalid token</h1>');
    } catch {
      return reply.status(401).send('<h1>Invalid or expired token</h1><p>Sign in again in the extension.</p>');
    }
    const state = Buffer.from(userId, 'utf-8').toString('base64url');
    const url = getAuthUrl(state);
    return reply.redirect(url, 302);
  });

  fastify.get<{ Querystring: { code?: string; state?: string } }>('/auth/google/callback', async (req, reply) => {
    if (!googleConfigured) {
      return reply.status(503).type('text/html').send(
        '<h1>Google OAuth not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend .env, then restart the server.</p>'
      );
    }
    const { code, state } = req.query;
    if (!code || !state) {
      return reply.status(400).send('<h1>Missing code or state</h1>');
    }
    let userId: string;
    try {
      userId = Buffer.from(state as string, 'base64url').toString('utf-8');
    } catch {
      return reply.status(400).send('<h1>Invalid state</h1>');
    }
    const redirectUri = config.googleRedirectUri || `${req.protocol}://${req.hostname}:${String(config.port)}/auth/google/callback`;
    const oauth2 = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, redirectUri);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return reply.status(400).send('<h1>No refresh token</h1><p>Grant consent again and ensure prompt=consent is used.</p>');
    }
    const service: ConnectorService = 'google';
    await setConnector(userId, service, JSON.stringify({ refresh_token: tokens.refresh_token }));
    return reply.type('text/html').send(
      '<!DOCTYPE html><html><head><title>Connected</title></head><body><h1>Google connected</h1><p>Calendar, Gmail, and Drive are now available. You can close this tab and return to the extension.</p></body></html>'
    );
  });
}
