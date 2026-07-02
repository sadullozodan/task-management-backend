import type { PrismaClient, Prisma, ChatMessage } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config/index.js';
import { sendChatRequestEmail } from '../../lib/email.js';
import type { StartChatBody, ChatListQuery, MessageListQuery } from './schema.js';

const USER_SELECT = {
  id: true,
  email: true,
  display_name: true,
  avatar_url: true,
} as const;

export interface ChatDetail {
  id: string;
  workspace_id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  last_message_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  other_user: { id: string; email: string; display_name: string; avatar_url: string | null };
  last_message: ChatMessage | null;
  unread_count: number;
}

type ChatRow = Prisma.ChatGetPayload<{
  include: {
    requester: { select: typeof USER_SELECT };
    recipient: { select: typeof USER_SELECT };
  };
}>;

const INCLUDE_PARTICIPANTS = {
  requester: { select: USER_SELECT },
  recipient: { select: USER_SELECT },
} as const;

/**
 * Shape a chat row for a given viewer: expose the *other* participant, the most
 * recent message, and how many messages the viewer has not yet read.
 */
async function toDetail(
  prisma: PrismaClient,
  chat: ChatRow,
  viewerId: string,
): Promise<ChatDetail> {
  const other = chat.requester_id === viewerId ? chat.recipient : chat.requester;

  const [last_message, unread_count] = await Promise.all([
    prisma.chatMessage.findFirst({
      where: { chat_id: chat.id },
      orderBy: { created_at: 'desc' },
    }),
    prisma.chatMessage.count({
      where: { chat_id: chat.id, sender_id: { not: viewerId }, read_at: null },
    }),
  ]);

  return {
    id: chat.id,
    workspace_id: chat.workspace_id,
    requester_id: chat.requester_id,
    recipient_id: chat.recipient_id,
    status: chat.status,
    last_message_at: chat.last_message_at,
    accepted_at: chat.accepted_at,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    other_user: other,
    last_message,
    unread_count,
  };
}

/** Load a chat and assert the viewer is one of its two participants (else 404). */
async function loadParticipantChat(
  prisma: PrismaClient,
  workspaceId: string,
  chatId: string,
  viewerId: string,
): Promise<ChatRow> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, workspace_id: workspaceId },
    include: INCLUDE_PARTICIPANTS,
  });
  if (!chat) throw AppError.notFound('Chat not found');
  if (chat.requester_id !== viewerId && chat.recipient_id !== viewerId) {
    throw AppError.notFound('Chat not found');
  }
  return chat;
}

/**
 * Start a direct chat with another workspace member (by email or user id), or
 * return the existing conversation if one already exists between the pair (in
 * either direction). A pending chat notifies the recipient by email.
 */
export async function startChat(
  prisma: PrismaClient,
  workspaceId: string,
  requesterId: string,
  body: StartChatBody,
): Promise<ChatDetail> {
  // Resolve the recipient user.
  const recipient = body.user_id
    ? await prisma.user.findUnique({ where: { id: body.user_id } })
    : await prisma.user.findUnique({ where: { email: body.email!.toLowerCase() } });

  if (!recipient) throw AppError.notFound('Recipient user not found');
  if (recipient.id === requesterId) {
    throw AppError.badRequest('You cannot start a chat with yourself');
  }

  // Both parties must belong to this workspace.
  const recipientMember = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: recipient.id } },
  });
  if (!recipientMember) {
    throw AppError.badRequest('Recipient is not a member of this workspace');
  }

  // Reuse any existing chat between the pair, regardless of who started it.
  const existing = await prisma.chat.findFirst({
    where: {
      workspace_id: workspaceId,
      OR: [
        { requester_id: requesterId, recipient_id: recipient.id },
        { requester_id: recipient.id, recipient_id: requesterId },
      ],
    },
    include: INCLUDE_PARTICIPANTS,
  });

  if (existing) {
    // If an intro message was supplied and the chat is open to the sender, append it.
    if (body.message && existing.status !== 'rejected') {
      await appendMessage(prisma, existing.id, requesterId, body.message);
      return loadDetail(prisma, existing.id, requesterId);
    }
    return toDetail(prisma, existing, requesterId);
  }

  const chat = await prisma.chat.create({
    data: {
      workspace_id: workspaceId,
      requester_id: requesterId,
      recipient_id: recipient.id,
      ...(body.message && {
        messages: { create: { sender_id: requesterId, body: body.message } },
        last_message_at: new Date(),
      }),
    },
    include: INCLUDE_PARTICIPANTS,
  });

  // Notify the recipient by email (fire-and-forget; failures shouldn't block).
  const [workspace, requester] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.user.findUnique({ where: { id: requesterId } }),
  ]);
  try {
    await sendChatRequestEmail({
      to: recipient.email,
      workspaceName: workspace?.name ?? 'your workspace',
      requesterName: requester?.display_name ?? 'A teammate',
      chatUrl: `${config.PUBLIC_BASE_URL}/workspaces/${workspace?.slug ?? ''}/chats/${chat.id}`,
      preview: body.message,
    });
  } catch {
    // Non-fatal: the recipient can still discover the request in-app.
  }

  return toDetail(prisma, chat, requesterId);
}

/** List the viewer's chats in a workspace, filtered by status (default accepted). */
export async function listChats(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  query: ChatListQuery,
): Promise<ChatDetail[]> {
  const chats = await prisma.chat.findMany({
    where: {
      workspace_id: workspaceId,
      status: query.status ?? 'accepted',
      OR: [{ requester_id: viewerId }, { recipient_id: viewerId }],
    },
    include: INCLUDE_PARTICIPANTS,
    orderBy: [{ last_message_at: 'desc' }, { created_at: 'desc' }],
  });

  return Promise.all(chats.map((c) => toDetail(prisma, c, viewerId)));
}

/** Incoming pending chat requests addressed to the viewer. */
export async function listChatRequests(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
): Promise<ChatDetail[]> {
  const chats = await prisma.chat.findMany({
    where: { workspace_id: workspaceId, recipient_id: viewerId, status: 'pending' },
    include: INCLUDE_PARTICIPANTS,
    orderBy: { created_at: 'desc' },
  });
  return Promise.all(chats.map((c) => toDetail(prisma, c, viewerId)));
}

/** Recipient accepts a pending chat; it then appears in both members' panels. */
export async function acceptChat(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  chatId: string,
): Promise<ChatDetail> {
  const chat = await loadParticipantChat(prisma, workspaceId, chatId, viewerId);
  if (chat.recipient_id !== viewerId) {
    throw AppError.forbidden('Only the recipient can respond to this chat request');
  }
  if (chat.status === 'accepted') return toDetail(prisma, chat, viewerId);
  if (chat.status !== 'pending') throw AppError.conflict('This chat request is no longer pending');

  await prisma.chat.update({
    where: { id: chatId },
    data: { status: 'accepted', accepted_at: new Date() },
  });
  return loadDetail(prisma, chatId, viewerId);
}

/** Recipient rejects a pending chat request. */
export async function rejectChat(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  chatId: string,
): Promise<ChatDetail> {
  const chat = await loadParticipantChat(prisma, workspaceId, chatId, viewerId);
  if (chat.recipient_id !== viewerId) {
    throw AppError.forbidden('Only the recipient can respond to this chat request');
  }
  if (chat.status !== 'pending') throw AppError.conflict('This chat request is no longer pending');

  await prisma.chat.update({ where: { id: chatId }, data: { status: 'rejected' } });
  return loadDetail(prisma, chatId, viewerId);
}

/** List messages in a chat the viewer participates in, newest first. */
export async function listMessages(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  chatId: string,
  query: MessageListQuery,
): Promise<{ data: ChatMessage[]; next_cursor: string | null }> {
  await loadParticipantChat(prisma, workspaceId, chatId, viewerId);

  const limit = query.limit;
  const entries = await prisma.chatMessage.findMany({
    where: { chat_id: chatId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });

  const hasMore = entries.length > limit;
  const data = hasMore ? entries.slice(0, limit) : entries;
  const next_cursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
  return { data, next_cursor };
}

/** Send a message in an accepted chat. Only participants may post. */
export async function sendMessage(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  chatId: string,
  bodyText: string,
): Promise<ChatMessage> {
  const chat = await loadParticipantChat(prisma, workspaceId, chatId, viewerId);
  if (chat.status !== 'accepted') {
    throw AppError.forbidden('This chat must be accepted before messages can be sent');
  }
  return appendMessage(prisma, chatId, viewerId, bodyText);
}

/** Mark every message the viewer did not send as read. */
export async function markChatRead(
  prisma: PrismaClient,
  workspaceId: string,
  viewerId: string,
  chatId: string,
): Promise<{ updated: number }> {
  await loadParticipantChat(prisma, workspaceId, chatId, viewerId);
  const result = await prisma.chatMessage.updateMany({
    where: { chat_id: chatId, sender_id: { not: viewerId }, read_at: null },
    data: { read_at: new Date() },
  });
  return { updated: result.count };
}

// ─── internal helpers ─────────────────────────────────────────────────────────

/** Create a message and bump the chat's `last_message_at` in one transaction. */
async function appendMessage(
  prisma: PrismaClient,
  chatId: string,
  senderId: string,
  bodyText: string,
): Promise<ChatMessage> {
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { chat_id: chatId, sender_id: senderId, body: bodyText },
    }),
    prisma.chat.update({ where: { id: chatId }, data: { last_message_at: new Date() } }),
  ]);
  return message;
}

/** Re-read a chat and shape it for the viewer. */
async function loadDetail(
  prisma: PrismaClient,
  chatId: string,
  viewerId: string,
): Promise<ChatDetail> {
  const chat = await prisma.chat.findUniqueOrThrow({
    where: { id: chatId },
    include: INCLUDE_PARTICIPANTS,
  });
  return toDetail(prisma, chat, viewerId);
}
