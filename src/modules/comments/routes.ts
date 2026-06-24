import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth-hook.js';
import { requireWorkspaceMember } from '../../plugins/workspace-hook.js';
import {
  listCommentsSchema,
  createCommentSchema,
  updateCommentSchema,
  deleteCommentSchema,
} from './schema.js';
import {
  listCommentsHandler,
  createCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
} from './controller.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  const member = [authenticate, requireWorkspaceMember()];

  app.get('/', { schema: listCommentsSchema, preHandler: member }, listCommentsHandler);
  app.post('/', { schema: createCommentSchema, preHandler: member }, createCommentHandler);
  app.patch(
    '/:commentId',
    { schema: updateCommentSchema, preHandler: member },
    updateCommentHandler,
  );
  app.delete(
    '/:commentId',
    { schema: deleteCommentSchema, preHandler: member },
    deleteCommentHandler,
  );
}
