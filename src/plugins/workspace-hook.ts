import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `requireWorkspaceMember` on workspace-scoped routes. */
    workspace: Workspace;
    /** The authenticated user's membership record in the current workspace. */
    workspaceMember: WorkspaceMember;
  }
}

const ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * preHandler factory: resolve workspace by slug, verify the authenticated user
 * is a member, and optionally enforce a minimum role.
 *
 * Must run after `authenticate` (requires `request.userId`).
 *
 * Usage:
 *   `{ preHandler: [authenticate, requireWorkspaceMember()] }`          // any member
 *   `{ preHandler: [authenticate, requireWorkspaceMember('admin')] }`   // admin or owner
 */
export function requireWorkspaceMember(
  minRole: WorkspaceRole = 'guest',
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function workspaceMemberHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const slug = (request.params as Record<string, string>).workspaceSlug;
    if (!slug) throw AppError.badRequest('workspaceSlug param is missing');

    const workspace = await request.server.prisma.workspace.findUnique({
      where: { slug },
    });
    if (!workspace) throw AppError.notFound(`Workspace "${slug}" not found`);

    const member = await request.server.prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: request.userId } },
    });
    if (!member) throw AppError.forbidden('You are not a member of this workspace');

    if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
      throw AppError.forbidden(
        `This action requires at least the "${minRole}" role in this workspace`,
      );
    }

    request.workspace = workspace;
    request.workspaceMember = member;
  };
}

async function workspacePlugin(app: FastifyInstance): Promise<void> {
  // Initial values are null at route registration time; the preHandler sets the real objects.
  app.decorateRequest('workspace', null as unknown as Workspace);
  app.decorateRequest('workspaceMember', null as unknown as WorkspaceMember);
}

export default fp(workspacePlugin, { name: 'workspace' });
