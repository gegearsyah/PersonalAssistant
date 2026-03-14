import type { FastifyInstance } from 'fastify';
import { createUser, verifyUser } from '../store/users.js';

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Body: { email?: string; password?: string };
  }>('/auth/register', async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'bad_request', message: 'Email and password required' });
    }
    try {
      const user = await createUser(email, password);
      const token = (fastify as { jwt: { sign: (p: object, o: { expiresIn: string }) => string } }).jwt.sign(
        { userId: user.id, email: user.email },
        { expiresIn: '7d' }
      );
      return reply.send({
        token,
        user: { id: user.id, email: user.email },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      return reply.status(400).send({ error: 'bad_request', message });
    }
  });

  fastify.post<{
    Body: { email?: string; password?: string };
  }>('/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'bad_request', message: 'Email and password required' });
    }
    const user = await verifyUser(email, password);
    if (!user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Invalid email or password' });
    }
    const token = (fastify as { jwt: { sign: (p: object, o: { expiresIn: string }) => string } }).jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '7d' }
    );
    return reply.send({
      token,
      user: { id: user.id, email: user.email },
    });
  });
}
