import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { CreateCommentBody, UpdateCommentBody } from './schema.js';

type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: { author: { select: { id: true; display_name: true; avatar_url: true } } };
}>;

const INCLUDE_AUTHOR = {
  author: { select: { id: true, display_name: true, avatar_url: true } },
} as const;

async function resolveIssue(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
): Promise<void> {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, project_id: projectId, workspace_id: workspaceId, deleted_at: null },
  });
  if (!issue) throw AppError.notFound('Issue not found');
}

export async function listComments(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
): Promise<CommentWithAuthor[]> {
  await resolveIssue(prisma, workspaceId, projectId, issueId);
  return prisma.comment.findMany({
    where: { issue_id: issueId },
    include: INCLUDE_AUTHOR,
    orderBy: { created_at: 'asc' },
  });
}

export async function createComment(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  authorId: string,
  body: CreateCommentBody,
): Promise<CommentWithAuthor> {
  await resolveIssue(prisma, workspaceId, projectId, issueId);

  if (body.parent_comment_id) {
    const parent = await prisma.comment.findFirst({
      where: { id: body.parent_comment_id, issue_id: issueId },
    });
    if (!parent) throw AppError.badRequest('parent_comment_id does not exist on this issue');
  }

  return prisma.comment.create({
    data: {
      issue_id: issueId,
      author_id: authorId,
      body: body.body,
      parent_comment_id: body.parent_comment_id ?? null,
    },
    include: INCLUDE_AUTHOR,
  });
}

export async function updateComment(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  commentId: string,
  requesterId: string,
  requesterRole: string,
  body: UpdateCommentBody,
): Promise<CommentWithAuthor> {
  await resolveIssue(prisma, workspaceId, projectId, issueId);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, issue_id: issueId },
  });
  if (!comment) throw AppError.notFound('Comment not found');
  if (comment.deleted_at) throw AppError.notFound('Comment has been deleted');

  const isAuthor = comment.author_id === requesterId;
  const isAdmin = requesterRole === 'admin' || requesterRole === 'owner';
  if (!isAuthor && !isAdmin)
    throw AppError.forbidden('Only the author or an admin can edit this comment');

  return prisma.comment.update({
    where: { id: commentId },
    data: { body: body.body },
    include: INCLUDE_AUTHOR,
  });
}

export async function deleteComment(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  commentId: string,
  requesterId: string,
  requesterRole: string,
): Promise<void> {
  await resolveIssue(prisma, workspaceId, projectId, issueId);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, issue_id: issueId },
  });
  if (!comment) throw AppError.notFound('Comment not found');
  if (comment.deleted_at) throw AppError.notFound('Comment has already been deleted');

  const isAuthor = comment.author_id === requesterId;
  const isAdmin = requesterRole === 'admin' || requesterRole === 'owner';
  if (!isAuthor && !isAdmin)
    throw AppError.forbidden('Only the author or an admin can delete this comment');

  await prisma.comment.update({ where: { id: commentId }, data: { deleted_at: new Date() } });
}
