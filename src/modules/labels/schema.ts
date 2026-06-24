import { z } from 'zod';
import type { FastifySchema } from 'fastify';

export const CreateLabelBodySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #3B82F6'),
});

export const UpdateLabelBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #3B82F6')
    .optional(),
});

export type CreateLabelBody = z.infer<typeof CreateLabelBodySchema>;
export type UpdateLabelBody = z.infer<typeof UpdateLabelBodySchema>;

const labelShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    workspace_id: { type: 'string' },
    project_id: { type: 'string' },
    name: { type: 'string' },
    color: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
} as const;

const security = [{ bearerAuth: [] }];

export const listLabelsSchema: FastifySchema = {
  tags: ['Labels'],
  summary: 'List labels in a project',
  security,
  response: { 200: { type: 'array', items: labelShape } },
};

export const createLabelSchema: FastifySchema = {
  tags: ['Labels'],
  summary: 'Create a label (admin+)',
  security,
  body: {
    type: 'object',
    required: ['name', 'color'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    },
  },
  response: { 201: labelShape },
};

export const updateLabelSchema: FastifySchema = {
  tags: ['Labels'],
  summary: 'Update a label (admin+)',
  security,
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    },
  },
  response: { 200: labelShape },
};

export const deleteLabelSchema: FastifySchema = {
  tags: ['Labels'],
  summary: 'Delete a label (admin+)',
  security,
  response: { 204: { type: 'null' } },
};
