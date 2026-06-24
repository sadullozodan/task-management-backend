import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth-hook.js';
import { requireWorkspaceMember } from '../../plugins/workspace-hook.js';
import {
  listProjectsSchema,
  createProjectSchema,
  getProjectSchema,
  updateProjectSchema,
  deleteProjectSchema,
  listProjectMembersSchema,
  addProjectMemberSchema,
  removeProjectMemberSchema,
} from './schema.js';
import {
  listProjectsHandler,
  createProjectHandler,
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  listProjectMembersHandler,
  addProjectMemberHandler,
  removeProjectMemberHandler,
} from './controller.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // All project routes require workspace membership; some require admin+.
  const member = [authenticate, requireWorkspaceMember()];
  const admin = [authenticate, requireWorkspaceMember('admin')];

  app.get('/', { schema: listProjectsSchema, preHandler: member }, listProjectsHandler);
  app.post('/', { schema: createProjectSchema, preHandler: admin }, createProjectHandler);

  app.get('/:projectId', { schema: getProjectSchema, preHandler: member }, getProjectHandler);
  app.patch(
    '/:projectId',
    { schema: updateProjectSchema, preHandler: admin },
    updateProjectHandler,
  );
  app.delete(
    '/:projectId',
    { schema: deleteProjectSchema, preHandler: admin },
    deleteProjectHandler,
  );

  // Project member sub-routes
  app.get(
    '/:projectId/members',
    { schema: listProjectMembersSchema, preHandler: member },
    listProjectMembersHandler,
  );
  app.post(
    '/:projectId/members',
    { schema: addProjectMemberSchema, preHandler: admin },
    addProjectMemberHandler,
  );
  app.delete(
    '/:projectId/members/:userId',
    { schema: removeProjectMemberSchema, preHandler: admin },
    removeProjectMemberHandler,
  );
}
