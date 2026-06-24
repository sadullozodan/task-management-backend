import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth-hook.js';
import { requireWorkspaceMember } from '../../plugins/workspace-hook.js';
import {
  listLabelsSchema,
  createLabelSchema,
  updateLabelSchema,
  deleteLabelSchema,
} from './schema.js';
import {
  listLabelsHandler,
  createLabelHandler,
  updateLabelHandler,
  deleteLabelHandler,
} from './controller.js';

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  const member = [authenticate, requireWorkspaceMember()];
  const admin = [authenticate, requireWorkspaceMember('admin')];

  app.get('/', { schema: listLabelsSchema, preHandler: member }, listLabelsHandler);
  app.post('/', { schema: createLabelSchema, preHandler: admin }, createLabelHandler);
  app.patch('/:labelId', { schema: updateLabelSchema, preHandler: admin }, updateLabelHandler);
  app.delete('/:labelId', { schema: deleteLabelSchema, preHandler: admin }, deleteLabelHandler);
}
