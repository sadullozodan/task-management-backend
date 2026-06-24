import type { FastifyRequest, FastifyReply } from 'fastify';
import * as labelService from './service.js';
import { CreateLabelBodySchema, UpdateLabelBodySchema } from './schema.js';

export async function listLabelsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId } = request.params as { projectId: string };
  const labels = await labelService.listLabels(
    request.server.prisma,
    request.workspace.id,
    projectId,
  );
  reply.send(labels);
}

export async function createLabelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId } = request.params as { projectId: string };
  const body = CreateLabelBodySchema.parse(request.body);
  const label = await labelService.createLabel(
    request.server.prisma,
    request.workspace.id,
    projectId,
    body,
  );
  reply.code(201).send(label);
}

export async function updateLabelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, labelId } = request.params as { projectId: string; labelId: string };
  const body = UpdateLabelBodySchema.parse(request.body);
  const label = await labelService.updateLabel(
    request.server.prisma,
    request.workspace.id,
    projectId,
    labelId,
    body,
  );
  reply.send(label);
}

export async function deleteLabelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { projectId, labelId } = request.params as { projectId: string; labelId: string };
  await labelService.deleteLabel(request.server.prisma, request.workspace.id, projectId, labelId);
  reply.code(204).send();
}
