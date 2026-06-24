import type { PrismaClient, Workspace, WorkspaceMember } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  AddMemberBody,
  ChangeMemberRoleBody,
} from './schema.js';

export async function listWorkspaces(prisma: PrismaClient, userId: string): Promise<Workspace[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { user_id: userId },
    include: { workspace: true },
  });
  return memberships.map((m) => m.workspace);
}

export async function createWorkspace(
  prisma: PrismaClient,
  userId: string,
  body: CreateWorkspaceBody,
): Promise<Workspace> {
  const existing = await prisma.workspace.findUnique({ where: { slug: body.slug } });
  if (existing) throw AppError.conflict(`Workspace slug "${body.slug}" is already taken`);

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name: body.name, slug: body.slug, owner_id: userId },
    });
    // Creator gets the owner role automatically.
    await tx.workspaceMember.create({
      data: { workspace_id: workspace.id, user_id: userId, role: 'owner' },
    });
    return workspace;
  });
}

export async function updateWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  body: UpdateWorkspaceBody,
): Promise<Workspace> {
  if (body.slug) {
    const conflict = await prisma.workspace.findUnique({ where: { slug: body.slug } });
    if (conflict && conflict.id !== workspaceId) {
      throw AppError.conflict(`Workspace slug "${body.slug}" is already taken`);
    }
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.slug !== undefined && { slug: body.slug }),
    },
  });
}

export async function deleteWorkspace(prisma: PrismaClient, workspaceId: string): Promise<void> {
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function listMembers(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  return prisma.workspaceMember.findMany({
    where: { workspace_id: workspaceId },
    include: { user: { select: { id: true, email: true, display_name: true, avatar_url: true } } },
    orderBy: { created_at: 'asc' },
  });
}

export async function addMember(
  prisma: PrismaClient,
  workspaceId: string,
  body: AddMemberBody,
): Promise<WorkspaceMember> {
  const user = await prisma.user.findUnique({ where: { id: body.user_id } });
  if (!user) throw AppError.notFound('User not found');

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: body.user_id } },
  });
  if (existing) throw AppError.conflict('User is already a member of this workspace');

  return prisma.workspaceMember.create({
    data: { workspace_id: workspaceId, user_id: body.user_id, role: body.role },
    include: { user: { select: { id: true, email: true, display_name: true, avatar_url: true } } },
  });
}

export async function changeMemberRole(
  prisma: PrismaClient,
  workspaceId: string,
  targetUserId: string,
  requesterId: string,
  body: ChangeMemberRoleBody,
): Promise<WorkspaceMember> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
  });
  if (!member) throw AppError.notFound('Member not found');

  // Cannot change the role of the workspace owner.
  if (member.role === 'owner') throw AppError.forbidden('Cannot change the workspace owner role');

  // Cannot demote yourself via this endpoint.
  if (targetUserId === requesterId) {
    throw AppError.forbidden('Cannot change your own role');
  }

  return prisma.workspaceMember.update({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
    data: { role: body.role },
    include: { user: { select: { id: true, email: true, display_name: true, avatar_url: true } } },
  });
}

export async function removeMember(
  prisma: PrismaClient,
  workspaceId: string,
  targetUserId: string,
  requesterId: string,
): Promise<void> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
  });
  if (!member) throw AppError.notFound('Member not found');
  if (member.role === 'owner') throw AppError.forbidden('Cannot remove the workspace owner');
  if (targetUserId === requesterId) {
    throw AppError.forbidden(
      'Use the leave-workspace endpoint to remove yourself (not implemented yet)',
    );
  }

  await prisma.workspaceMember.delete({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
  });
}
