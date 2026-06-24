import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by the `authenticate` preHandler on protected routes. */
    userId: string;
  }
}

/**
 * preHandler: verify the Bearer access token and set `request.userId`.
 * Add to any route that requires authentication:
 *   `{ preHandler: [authenticate] }`
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Bearer token');
  }
  try {
    request.userId = verifyAccessToken(auth.slice(7)).sub;
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  // Initialize the decorator so Fastify knows the shape before any preHandler sets it.
  app.decorateRequest('userId', '');
}

export default fp(authPlugin, { name: 'auth' });
