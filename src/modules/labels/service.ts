import type { PrismaClient, Label } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { CreateLabelBody, UpdateLabelBody } from './schema.js';

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

export async function listLabels(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
): Promise<Label[]> {
  await resolveProject(prisma, workspaceId, projectId);
  return prisma.label.findMany({
    where: { project_id: projectId },
    orderBy: { name: 'asc' },
  });
}

export async function createLabel(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  body: CreateLabelBody,
): Promise<Label> {
  await resolveProject(prisma, workspaceId, projectId);
  return prisma.label.create({
    data: { workspace_id: workspaceId, project_id: projectId, name: body.name, color: body.color },
  });
}

export async function updateLabel(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  labelId: string,
  body: UpdateLabelBody,
): Promise<Label> {
  await resolveProject(prisma, workspaceId, projectId);
  const label = await prisma.label.findFirst({ where: { id: labelId, project_id: projectId } });
  if (!label) throw AppError.notFound('Label not found');

  return prisma.label.update({
    where: { id: labelId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
    },
  });
}

export async function deleteLabel(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  labelId: string,
): Promise<void> {
  await resolveProject(prisma, workspaceId, projectId);
  const label = await prisma.label.findFirst({ where: { id: labelId, project_id: projectId } });
  if (!label) throw AppError.notFound('Label not found');
  await prisma.label.delete({ where: { id: labelId } });
}
