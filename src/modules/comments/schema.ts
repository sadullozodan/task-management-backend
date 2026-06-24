import { z } from 'zod';
import type { FastifySchema } from 'fastify';

export const CreateCommentBodySchema = z.object({
  body: z.string().min(1).max(50_000),
  parent_comment_id: z.string().uuid().optional().nullable(),
});

export const UpdateCommentBodySchema = z.object({
  body: z.string().min(1).max(50_000),
});

export type CreateCommentBody = z.infer<typeof CreateCommentBodySchema>;
export type UpdateCommentBody = z.infer<typeof UpdateCommentBodySchema>;

const commentShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    issue_id: { type: 'string' },
    author_id: { type: 'string' },
    body: { type: 'string' },
    parent_comment_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    deleted_at: { type: 'string', nullable: true },
    author: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        display_name: { type: 'string' },
        avatar_url: { type: 'string', nullable: true },
      },
    },
  },
} as const;

const security = [{ bearerAuth: [] }];

export const listCommentsSchema: FastifySchema = {
  tags: ['Comments'],
  summary: 'List comments on an issue',
  security,
  response: { 200: { type: 'array', items: commentShape } },
};

export const createCommentSchema: FastifySchema = {
  tags: ['Comments'],
  summary: 'Add a comment to an issue',
  security,
  body: {
    type: 'object',
    required: ['body'],
    properties: {
      body: { type: 'string', minLength: 1, maxLength: 50000 },
      parent_comment_id: { type: 'string', format: 'uuid', nullable: true },
    },
  },
  response: { 201: commentShape },
};

export const updateCommentSchema: FastifySchema = {
  tags: ['Comments'],
  summary: 'Edit a comment (author or admin)',
  security,
  body: {
    type: 'object',
    required: ['body'],
    properties: { body: { type: 'string', minLength: 1, maxLength: 50000 } },
  },
  response: { 200: commentShape },
};

export const deleteCommentSchema: FastifySchema = {
  tags: ['Comments'],
  summary: 'Soft-delete a comment (author or admin)',
  security,
  response: { 204: { type: 'null' } },
};
