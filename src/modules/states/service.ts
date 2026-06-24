import type { PrismaClient, State } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { CreateStateBody, UpdateStateBody, DeleteStateBody } from './schema.js';

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

export async function listStates(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
): Promise<State[]> {
  await resolveProject(prisma, workspaceId, projectId);
  return prisma.state.findMany({
    where: { project_id: projectId },
    orderBy: { order: 'asc' },
  });
}

export async function createState(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  body: CreateStateBody,
): Promise<State> {
  await resolveProject(prisma, workspaceId, projectId);

  return prisma.$transaction(async (tx) => {
    // If this is marked as default, unset any current default in the same group.
    if (body.is_default) {
      await tx.state.updateMany({
        where: { project_id: projectId, group: body.group, is_default: true },
        data: { is_default: false },
      });
    }
    return tx.state.create({ data: { ...body, project_id: projectId } });
  });
}

export async function updateState(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  stateId: string,
  body: UpdateStateBody,
): Promise<State> {
  await resolveProject(prisma, workspaceId, projectId);

  const state = await prisma.state.findFirst({
    where: { id: stateId, project_id: projectId },
  });
  if (!state) throw AppError.notFound('State not found');

  return prisma.$transaction(async (tx) => {
    const group = body.group ?? state.group;
    if (body.is_default) {
      await tx.state.updateMany({
        where: { project_id: projectId, group, is_default: true, id: { not: stateId } },
        data: { is_default: false },
      });
    }
    return tx.state.update({
      where: { id: stateId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.group !== undefined && { group: body.group }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.is_default !== undefined && { is_default: body.is_default }),
      },
    });
  });
}

export async function deleteState(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  stateId: string,
  body: DeleteStateBody,
): Promise<void> {
  await resolveProject(prisma, workspaceId, projectId);

  const state = await prisma.state.findFirst({
    where: { id: stateId, project_id: projectId },
  });
  if (!state) throw AppError.notFound('State not found');

  const issueCount = await prisma.issue.count({
    where: { state_id: stateId, deleted_at: null },
  });

  await prisma.$transaction(async (tx) => {
    if (issueCount > 0) {
      let targetStateId = body.transfer_to_state_id;

      if (!targetStateId) {
        // Find the default state in the project (excluding the one being deleted).
        const defaultState = await tx.state.findFirst({
          where: { project_id: projectId, is_default: true, id: { not: stateId } },
        });
        if (!defaultState) {
          throw AppError.conflict(
            'Cannot delete this state: there are issues assigned to it and no default state to transfer them to. Provide transfer_to_state_id.',
          );
        }
        targetStateId = defaultState.id;
      } else {
        const targetState = await tx.state.findFirst({
          where: { id: targetStateId, project_id: projectId },
        });
        if (!targetState)
          throw AppError.badRequest('transfer_to_state_id does not belong to this project');
      }

      await tx.issue.updateMany({
        where: { state_id: stateId, deleted_at: null },
        data: { state_id: targetStateId },
      });
    }

    await tx.state.delete({ where: { id: stateId } });
  });
}
