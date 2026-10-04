import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertCurrentTryoutResponse } from './qa-smoke-contract.mjs';

const ref = 'pkamenfnwmoeisccnrnk';
assert.equal(process.env.NODE_ENV, 'development');
assert.equal(process.env.SUPABASE_URL, `https://${ref}.supabase.co`);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
const vault = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../.qa-seed/accounts.json'), 'utf8'));
assert.equal(vault.projectRef, ref);
const base = process.env.API_INTERNAL_URL;
assert.ok(base === 'http://localhost:3001/api/v1', 'Use the local Development API.');

const sessions = {};
for (const [name, account] of Object.entries(vault.accounts)) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ifError(error);
  assert.equal(data.user.id, account.id);
  sessions[name] = data.session.access_token;
}
async function api(actor, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${sessions[actor]}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  return { status: response.status, value };
}
const identities = {};
for (const actor of Object.keys(sessions)) {
  const result = await api(actor, '/identity/me');
  assert.equal(result.status, 200, `${actor} identity failed`);
  identities[actor] = result.value;
}
assert.equal(identities.admin.role, 'ADMIN');
assert.equal(identities.teacherA.teacherVerified, true);
assert.equal(identities.studentA.studentAffiliation, 'SCHOOL');
assert.equal(identities.studentB.studentAffiliation, 'MANDIRI');
assert.equal((await api('studentB', '/chapters')).status, 200);
const history = await api('studentB', '/students/me/assessment-results');
assert.equal(history.status, 200);
assert.ok(Array.isArray(history.value.records));
assert.equal((await api('studentB', '/students/me/assessment-results?cursor=bad')).status, 400);
for (const actor of ['studentB', 'studentA']) {
  assertCurrentTryoutResponse(await api(actor, '/tryout/packages/current'), actor);
}
assert.equal((await api('studentB', '/classes')).status, 403);
assert.equal((await api('teacherB', '/classes')).status, identities.teacherB.teacherVerified ? 200 : 403);
assert.equal((await api('studentA', '/admin/schools')).status, 403);
const unauthenticated = await fetch(`${base}/identity/me`);
assert.equal(unauthenticated.status, 401);

const schools = await api('admin', '/admin/schools');
assert.equal(schools.status, 200);
const school = schools.value.items.find((item) => item.code === 'DEMO-QA-SCHOOL');
assert.ok(school);
const teacherAClasses = await api('teacherA', '/classes');
assert.equal(teacherAClasses.status, 200);
assert.ok(teacherAClasses.value.items.some((item) => item.name === 'DEMO-QA Class A'));

if (process.argv.includes('--apply')) {
  if (!identities.teacherB.teacherVerified) {
    const issued = await api('admin', `/admin/schools/${school.id}/teacher-tokens`, 'POST');
    assert.equal(issued.status, 201);
    const verified = await api('teacherB', `/schools/${school.id}/teacher-verifications`, 'POST', { token: issued.value.token });
    assert.equal(verified.status, 201);
    assert.equal((await api('teacherB', `/schools/${school.id}/teacher-verifications`, 'POST', { token: issued.value.token })).status, 409);
  }
  const teacherBClasses = await api('teacherB', '/classes');
  assert.equal(teacherBClasses.status, 200);
  let classB = teacherBClasses.value.items.find((item) => item.name === 'DEMO-QA Class B');
  if (!classB) {
    const created = await api('teacherB', '/classes', 'POST', { name: 'DEMO-QA Class B' });
    assert.equal(created.status, 201);
    classB = created.value;
  }
  assert.equal((await api('teacherA', `/classes/${classB.id}/students`)).status, 403);
  assert.equal((await api('studentA', '/classes/join', 'POST', { joinCode: classB.joinCode })).status, 409);
  const joined = await api('studentC', '/classes/join', 'POST', { joinCode: classB.joinCode });
  assert.equal(joined.status, 201);
  assert.equal((await api('studentC', '/identity/me')).value.studentAffiliation, 'SCHOOL');
  assert.equal((await api('studentB', '/identity/me')).value.studentAffiliation, 'MANDIRI');
  console.log('QA workflow passed: token, class creation, join, and cross-role denials.');
} else {
  console.log('QA login and read-only authorization smoke passed.');
}
