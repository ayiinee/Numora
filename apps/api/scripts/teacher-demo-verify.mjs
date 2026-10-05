// Read-only product/API verification. Auth login creates normal development sessions.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from '../../../packages/database/node_modules/postgres/src/index.js';
import {
  root,
  directory,
  requireDemoTarget,
  serverAdminKey,
  projectRef,
  scenario,
} from './teacher-demo-accounts.mjs';

async function run() {
  const target = requireDemoTarget(process.env);
  const base = process.env.API_INTERNAL_URL;
  assert.equal(base, 'http://localhost:3001/api/v1', 'Only the local Development API is allowed.');
  const vault = JSON.parse(await readFile(join(directory, 'accounts.json'), 'utf8'));
  const qa = JSON.parse(await readFile(join(root, '.qa-seed/accounts.json'), 'utf8'));
  assert.equal(vault.projectRef, projectRef);
  assert.equal(vault.scenario, scenario);
  assert.equal(qa.projectRef, projectRef);
  const sources = {
    teacher: vault.accounts[0],
    student: vault.accounts[1],
    teacherB: qa.accounts.teacherB,
  };
  const tokens = {};
  const clients = [];
  const checks = [];
  try {
    for (const [name, account] of Object.entries(sources)) {
      const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      let result = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (name === 'teacherB' && result.error?.code === 'invalid_credentials') {
        // Existing QA credentials can be stale. Generate a session for this exact,
        // already-existing QA email identity; never send mail or reset its password.
        const admin = createClient(process.env.SUPABASE_URL, serverAdminKey(process.env), {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const existing = await admin.auth.admin.getUserById(account.id);
        assert.ok(!existing.error && existing.data.user?.email === account.email);
        assert.equal(existing.data.user.app_metadata.numora_qa, true);
        assert.ok(existing.data.user.identities?.length > 0);
        assert.ok(existing.data.user.identities.every((identity) => identity.provider === 'email'));
        const generated = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: account.email,
        });
        assert.ok(!generated.error && generated.data.user?.id === account.id);
        result = await client.auth.verifyOtp({
          token_hash: generated.data.properties.hashed_token,
          type: 'email',
        });
      }
      assert.ok(
        !result.error && result.data.user?.id === account.id,
        `${name} Development login failed`,
      );
      tokens[name] = result.data.session.access_token;
      clients.push(client);
    }
    const request = async (name, path, expected) => {
      const response = await fetch(base + path, {
        headers: name ? { authorization: `Bearer ${tokens[name]}` } : {},
      });
      assert.equal(response.status, expected, `${name ?? 'anonymous'} ${path}`);
      checks.push({ actor: name ?? 'anonymous', path, status: response.status });
      return response.json();
    };
    const teacher = await request('teacher', '/identity/me', 200);
    assert.equal(teacher.teacherVerified, true);
    const teacherB = await request('teacherB', '/identity/me', 200);
    assert.equal(teacherB.teacherVerified, true);
    const cls = '04000000-0000-4000-8000-000000000010';
    const student = '04000000-0000-4000-8000-000000001001';
    const listed = await request('teacher', '/classes', 200);
    assert.equal(listed.items.length, 3);
    for (const item of listed.items) {
      const students = await request('teacher', `/classes/${item.id}/students`, 200);
      assert.equal(students.items.length, item.joinCode === 'NUM-9A26' ? 34 : 32);
    }
    const progress = await request('teacher', `/classes/${cls}/students/${student}/progress`, 200);
    assert.equal(progress.levels.filter((row) => row.bestDrillScore >= 80).length, 15);
    const feedback = await request('teacher', `/classes/${cls}/students/${student}/feedback`, 200);
    assert.ok(feedback.items.length > 0);
    const history = await request(
      'teacher',
      `/classes/${cls}/students/${student}/assessment-results`,
      200,
    );
    const past = history.records.find((row) => row.title.includes('Batch #01'));
    const current = history.records.find((row) => row.title.includes('Batch #02'));
    assert.equal(past?.resultState, 'ready');
    assert.equal(past?.score, 97);
    assert.equal(current?.resultState, 'waitingIrt');
    assert.equal(current?.score, null);
    await request('teacherB', `/classes/${cls}/students`, 403);
    await request('teacherB', `/classes/${cls}/students/${student}/progress`, 403);
    await request('teacherB', `/classes/${cls}/students/${student}/feedback`, 404);
    await request('student', '/classes', 403);
    await request('student', `/classes/${cls}/students/${student}/progress`, 403);
    await request('student', '/admin/schools', 403);
    await request(null, '/classes', 401);
    await request(null, `/classes/${cls}/students`, 401);
    const ownHistory = await request('student', '/students/me/assessment-results', 200);
    assert.equal(ownHistory.records.find((row) => row.title.includes('Batch #02'))?.score, null);
    await request('student', `/tryout/attempts/${current.attemptId}/result`, 409);
    // These actions fail before querying the missing notification tables.
    await request('teacher', '/students/me/notifications', 403);
    const sql = postgres(target, { max: 1 });
    try {
      for (const role of ['anon', 'authenticated']) {
        let rejected = false;
        try {
          await sql.begin('read only', async (tx) => {
            await tx.unsafe(`SET LOCAL ROLE ${role}`);
            await tx.unsafe('SELECT id FROM public.users LIMIT 1');
          });
        } catch (error) {
          rejected = error.code === '42501';
        }
        assert.equal(rejected, true, `${role} direct Data API role must not read product profiles`);
        checks.push({ actor: role, path: 'PostgreSQL public.users', status: 'permission_denied' });
      }
    } finally {
      await sql.end();
    }
    await writeFile(
      join(directory, 'api-verification.json'),
      JSON.stringify({ passed: true, checks }, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ passed: true, checks }));
  } finally {
    for (const client of clients) await client.auth.signOut({ scope: 'local' });
  }
}
run().catch((error) => {
  console.error(
    error.code === 'ERR_ASSERTION'
      ? `Teacher DEMO verification failed: ${error.message}`
      : 'Teacher DEMO API verification failed; credentials and provider payloads were suppressed.',
  );
  process.exitCode = 1;
});
