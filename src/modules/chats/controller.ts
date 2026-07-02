import type { FastifyRequest, FastifyReply } from 'fastify';
import * as chatService from './service.js';
import {
  StartChatBodySchema,
  SendMessageBodySchema,
  ChatListQuerySchema,
  MessageListQuerySchema,
} from './schema.js';

export async function startChatHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = StartChatBodySchema.parse(request.body);
  const chat = await chatService.startChat(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    body,
  );
  reply.status(201).send(chat);
}

export async function listChatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ChatListQuerySchema.parse(request.query);
  const chats = await chatService.listChats(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    query,
  );
  reply.send(chats);
}

export async function listChatRequestsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const chats = await chatService.listChatRequests(
    request.server.prisma,
    request.workspace.id,
    request.userId,
  );
  reply.send(chats);
}

export async function acceptChatHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { chatId } = request.params as { chatId: string };
  const chat = await chatService.acceptChat(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    chatId,
  );
  reply.send(chat);
}

export async function rejectChatHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { chatId } = request.params as { chatId: string };
  const chat = await chatService.rejectChat(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    chatId,
  );
  reply.send(chat);
}

export async function listMessagesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { chatId } = request.params as { chatId: string };
  const query = MessageListQuerySchema.parse(request.query);
  const result = await chatService.listMessages(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    chatId,
    query,
  );
  reply.send(result);
}

export async function sendMessageHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { chatId } = request.params as { chatId: string };
  const { body } = SendMessageBodySchema.parse(request.body);
  const message = await chatService.sendMessage(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    chatId,
    body,
  );
  reply.status(201).send(message);
}

export async function markChatReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { chatId } = request.params as { chatId: string };
  const result = await chatService.markChatRead(
    request.server.prisma,
    request.workspace.id,
    request.userId,
    chatId,
  );
  reply.send(result);
}
