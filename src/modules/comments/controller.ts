import type { FastifyRequest, FastifyReply } from 'fastify';
import * as commentService from './service.js';
import { CreateCommentBodySchema, UpdateCommentBodySchema } from './schema.js';

export async function listCommentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, issueId } = request.params as { projectId: string; issueId: string };
  const comments = await commentService.listComments(
    request.server.prisma,
    request.workspace.id,
    projectId,
    issueId,
  );
  reply.send(comments);
}

export async function createCommentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, issueId } = request.params as { projectId: string; issueId: string };
  const body = CreateCommentBodySchema.parse(request.body);
  const comment = await commentService.createComment(
    request.server.prisma,
    request.workspace.id,
    projectId,
    issueId,
    request.userId,
    body,
  );
  reply.code(201).send(comment);
}

export async function updateCommentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, issueId, commentId } = request.params as {
    projectId: string;
    issueId: string;
    commentId: string;
  };
  const body = UpdateCommentBodySchema.parse(request.body);
  const comment = await commentService.updateComment(
    request.server.prisma,
    request.workspace.id,
    projectId,
    issueId,
    commentId,
    request.userId,
    request.workspaceMember.role,
    body,
  );
  reply.send(comment);
}

export async function deleteCommentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, issueId, commentId } = request.params as {
    projectId: string;
    issueId: string;
    commentId: string;
  };
  await commentService.deleteComment(
    request.server.prisma,
    request.workspace.id,
    projectId,
    issueId,
    commentId,
    request.userId,
    request.workspaceMember.role,
  );
  reply.code(204).send();
}
