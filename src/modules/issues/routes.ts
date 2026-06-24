import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth-hook.js';
import { requireWorkspaceMember } from '../../plugins/workspace-hook.js';
import {
  listIssuesSchema,
  createIssueSchema,
  getIssueSchema,
  updateIssueSchema,
  deleteIssueSchema,
  addAssigneeSchema,
  removeAssigneeSchema,
  addLabelSchema,
  removeLabelSchema,
} from './schema.js';
import {
  listIssuesHandler,
  createIssueHandler,
  getIssueHandler,
  updateIssueHandler,
  deleteIssueHandler,
  addAssigneeHandler,
  removeAssigneeHandler,
  addLabelHandler,
  removeLabelHandler,
} from './controller.js';

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  const member = [authenticate, requireWorkspaceMember()];

  app.get('/', { schema: listIssuesSchema, preHandler: member }, listIssuesHandler);
  app.post('/', { schema: createIssueSchema, preHandler: member }, createIssueHandler);

  app.get('/:issueId', { schema: getIssueSchema, preHandler: member }, getIssueHandler);
  app.patch('/:issueId', { schema: updateIssueSchema, preHandler: member }, updateIssueHandler);
  app.delete('/:issueId', { schema: deleteIssueSchema, preHandler: member }, deleteIssueHandler);

  // Assignees
  app.post(
    '/:issueId/assignees',
    { schema: addAssigneeSchema, preHandler: member },
    addAssigneeHandler,
  );
  app.delete(
    '/:issueId/assignees/:userId',
    { schema: removeAssigneeSchema, preHandler: member },
    removeAssigneeHandler,
  );

  // Labels
  app.post('/:issueId/labels', { schema: addLabelSchema, preHandler: member }, addLabelHandler);
  app.delete(
    '/:issueId/labels/:labelId',
    { schema: removeLabelSchema, preHandler: member },
    removeLabelHandler,
  );
}
