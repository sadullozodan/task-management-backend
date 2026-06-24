import type { PrismaClient, Issue, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { CreateIssueBody, UpdateIssueBody, IssueFilterQuery } from './schema.js';

/** Issue with assignees and labels included (the standard response shape). */
type IssueWithRelations = Prisma.IssueGetPayload<{
  include: {
    assignees: {
      include: {
        user: { select: { id: true; email: true; display_name: true; avatar_url: true } };
      };
    };
    labels: { include: { label: true } };
  };
}>;

const INCLUDE_RELATIONS = {
  assignees: {
    include: { user: { select: { id: true, email: true, display_name: true, avatar_url: true } } },
  },
  labels: { include: { label: true } },
} as const;

async function resolveProject(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspace_id: workspaceId },
  });
  if (!project) throw AppError.notFound('Project not found');
}

async function resolveIssue(
  prisma: PrismaClient,
  projectId: string,
  issueId: string,
): Promise<IssueWithRelations> {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, project_id: projectId, deleted_at: null },
    include: INCLUDE_RELATIONS,
  });
  if (!issue) throw AppError.notFound('Issue not found');
  return issue;
}

/** Next sequence_id for a project — use inside a serializable transaction. */
async function nextSequenceId(
  prisma: Prisma.TransactionClient,
  projectId: string,
): Promise<number> {
  const last = await prisma.issue.findFirst({
    where: { project_id: projectId },
    orderBy: { sequence_id: 'desc' },
    select: { sequence_id: true },
  });
  return (last?.sequence_id ?? 0) + 1;
}

function normalizeArrayParam(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export async function listIssues(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  query: IssueFilterQuery,
): Promise<{ data: IssueWithRelations[]; next_cursor: string | null }> {
  await resolveProject(prisma, workspaceId, projectId);

  const states = normalizeArrayParam(query.state);
  const priorities = normalizeArrayParam(query.priority);
  const assignees = normalizeArrayParam(query.assignee);
  const labels = normalizeArrayParam(query.label);

  const where: Prisma.IssueWhereInput = {
    project_id: projectId,
    deleted_at: null,
    ...(states && { state_id: { in: states } }),
    ...(priorities && { priority: { in: priorities as Issue['priority'][] } }),
    ...(assignees && { assignees: { some: { user_id: { in: assignees } } } }),
    ...(labels && { labels: { some: { label_id: { in: labels } } } }),
    ...(query.parent_id !== undefined && { parent_id: query.parent_id }),
    ...(query.search && {
      title: { contains: query.search, mode: 'insensitive' as const },
    }),
    ...(query.cursor && { id: { gt: query.cursor } }),
  };

  const limit = query.limit;
  const issues = await prisma.issue.findMany({
    where,
    include: INCLUDE_RELATIONS,
    orderBy: { created_at: 'asc' },
    take: limit + 1, // fetch one extra to determine if there is a next page
  });

  const hasMore = issues.length > limit;
  const data = hasMore ? issues.slice(0, limit) : issues;
  const next_cursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  return { data, next_cursor };
}

export async function createIssue(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  creatorId: string,
  body: CreateIssueBody,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);

  // Validate state belongs to the project.
  const state = await prisma.state.findFirst({
    where: { id: body.state_id, project_id: projectId },
  });
  if (!state) throw AppError.badRequest('state_id does not belong to this project');

  // Validate parent (single-level only).
  if (body.parent_id) {
    const parent = await prisma.issue.findFirst({
      where: { id: body.parent_id, project_id: projectId, deleted_at: null },
    });
    if (!parent) throw AppError.badRequest('parent_id does not exist in this project');
    if (parent.parent_id)
      throw AppError.badRequest('Sub-issues cannot have sub-issues (single level only)');
  }

  return prisma.$transaction(async (tx) => {
    const sequenceId = await nextSequenceId(tx, projectId);

    const issue = await tx.issue.create({
      data: {
        workspace_id: workspaceId,
        project_id: projectId,
        sequence_id: sequenceId,
        title: body.title,
        description: body.description,
        state_id: body.state_id,
        priority: body.priority,
        parent_id: body.parent_id ?? null,
        start_date: body.start_date ? new Date(body.start_date) : null,
        due_date: body.due_date ? new Date(body.due_date) : null,
        estimate_points: body.estimate_points ?? null,
        created_by_id: creatorId,
        assignees: body.assignee_ids?.length
          ? { createMany: { data: body.assignee_ids.map((uid) => ({ user_id: uid })) } }
          : undefined,
        labels: body.label_ids?.length
          ? { createMany: { data: body.label_ids.map((lid) => ({ label_id: lid })) } }
          : undefined,
      },
      include: INCLUDE_RELATIONS,
    });

    return issue;
  });
}

export async function getIssue(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  return resolveIssue(prisma, projectId, issueId);
}

export async function updateIssue(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  body: UpdateIssueBody,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  if (body.state_id) {
    const state = await prisma.state.findFirst({
      where: { id: body.state_id, project_id: projectId },
    });
    if (!state) throw AppError.badRequest('state_id does not belong to this project');
  }

  if (body.parent_id) {
    if (body.parent_id === issueId) throw AppError.badRequest('An issue cannot be its own parent');
    const parent = await prisma.issue.findFirst({
      where: { id: body.parent_id, project_id: projectId, deleted_at: null },
    });
    if (!parent) throw AppError.badRequest('parent_id does not exist in this project');
    if (parent.parent_id)
      throw AppError.badRequest('Sub-issues cannot have sub-issues (single level only)');
  }

  const completedAt = body.state_id
    ? await (async () => {
        const state = await prisma.state.findUnique({ where: { id: body.state_id } });
        return state?.group === 'completed' ? new Date() : null;
      })()
    : undefined;

  return prisma.issue.update({
    where: { id: issueId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.state_id !== undefined && { state_id: body.state_id }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.parent_id !== undefined && { parent_id: body.parent_id }),
      ...(body.start_date !== undefined && {
        start_date: body.start_date ? new Date(body.start_date) : null,
      }),
      ...(body.due_date !== undefined && {
        due_date: body.due_date ? new Date(body.due_date) : null,
      }),
      ...(body.estimate_points !== undefined && { estimate_points: body.estimate_points }),
      ...(body.sort_order !== undefined && { sort_order: body.sort_order }),
      ...(completedAt !== undefined && { completed_at: completedAt }),
    },
    include: INCLUDE_RELATIONS,
  });
}

export async function deleteIssue(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
): Promise<void> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  await prisma.issue.update({
    where: { id: issueId },
    data: { deleted_at: new Date() },
  });
}

// ─── Assignees ────────────────────────────────────────────────────────────────

export async function addAssignee(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  userId: string,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  const existing = await prisma.issueAssignee.findUnique({
    where: { issue_id_user_id: { issue_id: issueId, user_id: userId } },
  });
  if (existing) throw AppError.conflict('User is already assigned to this issue');

  await prisma.issueAssignee.create({ data: { issue_id: issueId, user_id: userId } });
  return resolveIssue(prisma, projectId, issueId);
}

export async function removeAssignee(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  userId: string,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  const existing = await prisma.issueAssignee.findUnique({
    where: { issue_id_user_id: { issue_id: issueId, user_id: userId } },
  });
  if (!existing) throw AppError.notFound('Assignee not found on this issue');

  await prisma.issueAssignee.delete({
    where: { issue_id_user_id: { issue_id: issueId, user_id: userId } },
  });
  return resolveIssue(prisma, projectId, issueId);
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export async function attachLabel(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  labelId: string,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  const label = await prisma.label.findFirst({ where: { id: labelId, project_id: projectId } });
  if (!label) throw AppError.notFound('Label not found in this project');

  const existing = await prisma.issueLabel.findUnique({
    where: { issue_id_label_id: { issue_id: issueId, label_id: labelId } },
  });
  if (existing) throw AppError.conflict('Label is already attached to this issue');

  await prisma.issueLabel.create({ data: { issue_id: issueId, label_id: labelId } });
  return resolveIssue(prisma, projectId, issueId);
}

export async function detachLabel(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  issueId: string,
  labelId: string,
): Promise<IssueWithRelations> {
  await resolveProject(prisma, workspaceId, projectId);
  await resolveIssue(prisma, projectId, issueId);

  const existing = await prisma.issueLabel.findUnique({
    where: { issue_id_label_id: { issue_id: issueId, label_id: labelId } },
  });
  if (!existing) throw AppError.notFound('Label is not attached to this issue');

  await prisma.issueLabel.delete({
    where: { issue_id_label_id: { issue_id: issueId, label_id: labelId } },
  });
  return resolveIssue(prisma, projectId, issueId);
}
