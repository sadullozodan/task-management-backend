import { z } from 'zod';
import type { FastifySchema } from 'fastify';

const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export const CreateIssueBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).optional(),
  state_id: z.string().uuid(),
  priority: z.enum(PRIORITIES).default('none'),
  parent_id: z.string().uuid().optional().nullable(),
  assignee_ids: z.array(z.string().uuid()).optional(),
  label_ids: z.array(z.string().uuid()).optional(),
  start_date: z.string().datetime().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  estimate_points: z.number().min(0).optional().nullable(),
});

export const UpdateIssueBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(50_000).optional().nullable(),
  state_id: z.string().uuid().optional(),
  priority: z.enum(PRIORITIES).optional(),
  parent_id: z.string().uuid().optional().nullable(),
  start_date: z.string().datetime().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  estimate_points: z.number().min(0).optional().nullable(),
  sort_order: z.number().optional(),
});

export const IssueFilterQuerySchema = z.object({
  state: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.union([z.string(), z.array(z.string())]).optional(),
  assignee: z.union([z.string(), z.array(z.string())]).optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  search: z.string().optional(),
  parent_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const AssigneeBodySchema = z.object({
  user_id: z.string().uuid(),
});

export const LabelAttachBodySchema = z.object({
  label_id: z.string().uuid(),
});

export type CreateIssueBody = z.infer<typeof CreateIssueBodySchema>;
export type UpdateIssueBody = z.infer<typeof UpdateIssueBodySchema>;
export type IssueFilterQuery = z.infer<typeof IssueFilterQuerySchema>;
export type AssigneeBody = z.infer<typeof AssigneeBodySchema>;
export type LabelAttachBody = z.infer<typeof LabelAttachBodySchema>;

// ─── Fastify route schemas ────────────────────────────────────────────────────

const issueShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    workspace_id: { type: 'string' },
    project_id: { type: 'string' },
    sequence_id: { type: 'integer' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    state_id: { type: 'string' },
    priority: { type: 'string', enum: PRIORITIES },
    parent_id: { type: 'string', nullable: true },
    estimate_points: { type: 'number', nullable: true },
    start_date: { type: 'string', nullable: true },
    due_date: { type: 'string', nullable: true },
    completed_at: { type: 'string', nullable: true },
    created_by_id: { type: 'string' },
    sort_order: { type: 'number' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    assignees: { type: 'array', items: { type: 'object' } },
    labels: { type: 'array', items: { type: 'object' } },
  },
} as const;

const security = [{ bearerAuth: [] }];

export const listIssuesSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'List issues in a project with optional filtering and cursor pagination',
  security,
  querystring: {
    type: 'object',
    properties: {
      state: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      priority: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      assignee: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      label: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      search: { type: 'string' },
      parent_id: { type: 'string' },
      cursor: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: issueShape },
        next_cursor: { type: 'string', nullable: true },
      },
    },
  },
};

export const createIssueSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Create an issue',
  security,
  body: {
    type: 'object',
    required: ['title', 'state_id'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: 'string' },
      state_id: { type: 'string', format: 'uuid' },
      priority: { type: 'string', enum: PRIORITIES },
      parent_id: { type: 'string', format: 'uuid', nullable: true },
      assignee_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
      label_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
      start_date: { type: 'string', nullable: true },
      due_date: { type: 'string', nullable: true },
      estimate_points: { type: 'number', nullable: true },
    },
  },
  response: { 201: issueShape },
};

export const getIssueSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Get issue details',
  security,
  response: { 200: issueShape },
};

export const updateIssueSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Update an issue',
  security,
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: 'string', nullable: true },
      state_id: { type: 'string', format: 'uuid' },
      priority: { type: 'string', enum: PRIORITIES },
      parent_id: { type: 'string', format: 'uuid', nullable: true },
      start_date: { type: 'string', nullable: true },
      due_date: { type: 'string', nullable: true },
      estimate_points: { type: 'number', nullable: true },
      sort_order: { type: 'number' },
    },
  },
  response: { 200: issueShape },
};

export const deleteIssueSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Soft-delete an issue',
  security,
  response: { 204: { type: 'null' } },
};

export const addAssigneeSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Add an assignee to an issue',
  security,
  body: {
    type: 'object',
    required: ['user_id'],
    properties: { user_id: { type: 'string', format: 'uuid' } },
  },
  response: { 201: issueShape },
};

export const removeAssigneeSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Remove an assignee from an issue',
  security,
  response: { 200: issueShape },
};

export const addLabelSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Attach a label to an issue',
  security,
  body: {
    type: 'object',
    required: ['label_id'],
    properties: { label_id: { type: 'string', format: 'uuid' } },
  },
  response: { 201: issueShape },
};

export const removeLabelSchema: FastifySchema = {
  tags: ['Issues'],
  summary: 'Detach a label from an issue',
  security,
  response: { 200: issueShape },
};
