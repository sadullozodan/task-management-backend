// Integration tests: multi-tenant isolation.
//
// Verifies that a user belonging to workspace A cannot access workspace B
// resources, and that workspace-scoped data never leaks across boundaries.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const TS = Date.now();
const ALICE_EMAIL = `alice-${TS}@example.com`;
const BOB_EMAIL = `bob-${TS}@example.com`;
const PW = 'Password123!';

let app: FastifyInstance;
let aliceToken: string;
let bobToken: string;
let aliceWorkspaceSlug: string;
let bobWorkspaceSlug: string;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();

  // Register Alice.
  const aliceReg = await request(app.server)
    .post('/api/v1/auth/register')
    .send({ email: ALICE_EMAIL, password: PW, display_name: 'Alice' });
  aliceToken = aliceReg.body.access_token;

  // Register Bob.
  const bobReg = await request(app.server)
    .post('/api/v1/auth/register')
    .send({ email: BOB_EMAIL, password: PW, display_name: 'Bob' });
  bobToken = bobReg.body.access_token;

  // Alice creates her workspace.
  aliceWorkspaceSlug = `alice-ws-${TS}`;
  await request(app.server)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ name: "Alice's Workspace", slug: aliceWorkspaceSlug });

  // Bob creates his workspace.
  bobWorkspaceSlug = `bob-ws-${TS}`;
  await request(app.server)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${bobToken}`)
    .send({ name: "Bob's Workspace", slug: bobWorkspaceSlug });
});

afterAll(async () => {
  // Cascade: deleting workspaces removes members, projects, issues etc.
  await app.prisma.workspace.deleteMany({
    where: { slug: { in: [aliceWorkspaceSlug, bobWorkspaceSlug] } },
  });
  await app.prisma.user.deleteMany({ where: { email: { in: [ALICE_EMAIL, BOB_EMAIL] } } });
  await app.close();
});

describe('multi-tenant isolation', () => {
  it('Alice can read her own workspace', async () => {
    const res = await request(app.server)
      .get(`/api/v1/workspaces/${aliceWorkspaceSlug}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(aliceWorkspaceSlug);
  });

  it("Bob cannot access Alice's workspace", async () => {
    const res = await request(app.server)
      .get(`/api/v1/workspaces/${aliceWorkspaceSlug}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it("Alice cannot access Bob's workspace", async () => {
    const res = await request(app.server)
      .get(`/api/v1/workspaces/${bobWorkspaceSlug}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(403);
  });

  it("Bob cannot add members to Alice's workspace", async () => {
    // First get Alice's user id.
    const aliceMe = await request(app.server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${aliceToken}`);
    const aliceId = aliceMe.body.id;

    const res = await request(app.server)
      .post(`/api/v1/workspaces/${aliceWorkspaceSlug}/members`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ user_id: aliceId, role: 'member' });
    expect(res.status).toBe(403);
  });

  it("Alice's workspace list does not include Bob's workspace", async () => {
    const res = await request(app.server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    const slugs = (res.body as Array<{ slug: string }>).map((w) => w.slug);
    expect(slugs).toContain(aliceWorkspaceSlug);
    expect(slugs).not.toContain(bobWorkspaceSlug);
  });

  it('Alice can create a project in her workspace', async () => {
    const res = await request(app.server)
      .post(`/api/v1/workspaces/${aliceWorkspaceSlug}/projects`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alpha Project', identifier: 'ALPHA' });
    expect(res.status).toBe(201);
    expect(res.body.identifier).toBe('ALPHA');
  });

  it("Bob cannot create a project in Alice's workspace", async () => {
    const res = await request(app.server)
      .post(`/api/v1/workspaces/${aliceWorkspaceSlug}/projects`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Hijack Project', identifier: 'HACK' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests are rejected', async () => {
    const res = await request(app.server).get(`/api/v1/workspaces/${aliceWorkspaceSlug}`);
    expect(res.status).toBe(401);
  });
});
