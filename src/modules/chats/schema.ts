import { z } from 'zod';
import type { FastifySchema } from 'fastify';

// ─── Zod validators ───────────────────────────────────────────────────────────

// Start a chat with another workspace member, addressed either by their email
// or user id. An optional intro `message` is stored as the request preview.
export const StartChatBodySchema = z
  .object({
    email: z.string().email().optional(),
    user_id: z.string().uuid().optional(),
    message: z.string().min(1).max(4000).optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.user_id), {
    message: 'Provide either "email" or "user_id" to identify the recipient',
    path: ['email'],
  });

export const SendMessageBodySchema = z.object({
  body: z.string().min(1).max(4000),
});

export const ChatListQuerySchema = z.object({
  /** Filter by chat status. Defaults to `accepted` (the ones shown in the panel). */
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
});

export const MessageListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type StartChatBody = z.infer<typeof StartChatBodySchema>;
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
export type ChatListQuery = z.infer<typeof ChatListQuerySchema>;
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

// ─── Fastify route schemas ────────────────────────────────────────────────────

const security = [{ bearerAuth: [] }];

const userShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    display_name: { type: 'string' },
    avatar_url: { type: 'string', nullable: true },
  },
} as const;

const messageShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    chat_id: { type: 'string' },
    sender_id: { type: 'string' },
    body: { type: 'string' },
    read_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
} as const;

const chatShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    workspace_id: { type: 'string' },
    requester_id: { type: 'string' },
    recipient_id: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
    last_message_at: { type: 'string', format: 'date-time', nullable: true },
    accepted_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    // The participant that is NOT the requesting user.
    other_user: userShape,
    last_message: { ...messageShape, nullable: true },
    unread_count: { type: 'integer' },
  },
} as const;

export const startChatSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'Start (or reuse) a direct chat with another workspace member',
  security,
  params: { type: 'object', properties: { workspaceSlug: { type: 'string' } } },
  body: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      user_id: { type: 'string', format: 'uuid' },
      message: { type: 'string', minLength: 1, maxLength: 4000 },
    },
  },
  response: { 201: chatShape },
};

export const listChatsSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'List the current user chats in a workspace (accepted by default)',
  security,
  params: { type: 'object', properties: { workspaceSlug: { type: 'string' } } },
  querystring: {
    type: 'object',
    properties: { status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] } },
  },
  response: { 200: { type: 'array', items: chatShape } },
};

export const listChatRequestsSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'List incoming pending chat requests addressed to the current user',
  security,
  params: { type: 'object', properties: { workspaceSlug: { type: 'string' } } },
  response: { 200: { type: 'array', items: chatShape } },
};

export const acceptChatSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'Accept a pending chat request (recipient only)',
  security,
  response: { 200: chatShape },
};

export const rejectChatSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'Reject a pending chat request (recipient only)',
  security,
  response: { 200: chatShape },
};

export const listMessagesSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'List messages in a chat (newest first, cursor-paginated)',
  security,
  querystring: {
    type: 'object',
    properties: {
      cursor: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: messageShape },
        next_cursor: { type: 'string', nullable: true },
      },
    },
  },
};

export const sendMessageSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'Send a message in an accepted chat',
  security,
  body: {
    type: 'object',
    required: ['body'],
    properties: { body: { type: 'string', minLength: 1, maxLength: 4000 } },
  },
  response: { 201: messageShape },
};

export const markChatReadSchema: FastifySchema = {
  tags: ['Chats'],
  summary: 'Mark all incoming messages in a chat as read',
  security,
  response: {
    200: { type: 'object', properties: { updated: { type: 'integer' } } },
  },
};
