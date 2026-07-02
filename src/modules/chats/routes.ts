import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth-hook.js';
import { requireWorkspaceMember } from '../../plugins/workspace-hook.js';
import {
  startChatSchema,
  listChatsSchema,
  listChatRequestsSchema,
  acceptChatSchema,
  rejectChatSchema,
  listMessagesSchema,
  sendMessageSchema,
  markChatReadSchema,
} from './schema.js';
import {
  startChatHandler,
  listChatsHandler,
  listChatRequestsHandler,
  acceptChatHandler,
  rejectChatHandler,
  listMessagesHandler,
  sendMessageHandler,
  markChatReadHandler,
} from './controller.js';

// Direct chats between workspace members
// (`.../workspaces/:workspaceSlug/chats`). Every route requires an authenticated
// member of the workspace.
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const member = [authenticate, requireWorkspaceMember()];

  app.post('/', { schema: startChatSchema, preHandler: member }, startChatHandler);
  app.get('/', { schema: listChatsSchema, preHandler: member }, listChatsHandler);
  app.get(
    '/requests',
    { schema: listChatRequestsSchema, preHandler: member },
    listChatRequestsHandler,
  );
  app.post('/:chatId/accept', { schema: acceptChatSchema, preHandler: member }, acceptChatHandler);
  app.post('/:chatId/reject', { schema: rejectChatSchema, preHandler: member }, rejectChatHandler);
  app.get(
    '/:chatId/messages',
    { schema: listMessagesSchema, preHandler: member },
    listMessagesHandler,
  );
  app.post(
    '/:chatId/messages',
    { schema: sendMessageSchema, preHandler: member },
    sendMessageHandler,
  );
  app.post('/:chatId/read', { schema: markChatReadSchema, preHandler: member }, markChatReadHandler);
}
