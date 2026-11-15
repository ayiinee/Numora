import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { connectionBudget } from './check-postgres-budget.mjs';

const example = JSON.parse(
  await readFile(
    new URL('../deploy/postgres/connection-budget.example.json', import.meta.url),
    'utf8',
  ),
);
test('budget includes every independent pool, deployment overlap and administrative reserves', () => {
  const result = connectionBudget(example);
  assert.equal(result.clients, 26);
  assert.equal(result.planned, 44);
  assert.equal(result.unallocated, 16);
  assert.deepEqual(
    result.services.map((service) => service.connections),
    [10, 10, 4, 2],
  );
});
test('rejects global exhaustion even when each individual login limit fits', () => {
  assert.throws(() => connectionBudget({ ...example, maxConnections: 43 }), /max_connections/);
});
test('shared login limits aggregate across services and overlap processes', () => {
  const config = structuredClone(example);
  config.services[1].login = 'numora_api';
  assert.throws(() => connectionBudget(config), /login connection limit/);
  config.services[1].connectionLimit = 13;
  assert.throws(() => connectionBudget(config), /limits disagree/);
});
test('rejects missing, fractional, negative, unsafe and duplicate inventory entries', () => {
  for (const value of [undefined, -1, 0, 0.5, '3', Number.MAX_SAFE_INTEGER + 1]) {
    const config = structuredClone(example);
    config.services[0].pools[0].max = value;
    assert.throws(() => connectionBudget(config));
  }
  for (const change of [
    { services: [] },
    { headroomConnections: 0 },
    { operationsConnections: -1 },
    { superuserReservedConnections: undefined },
  ])
    assert.throws(() => connectionBudget({ ...example, ...change }));
  const config = structuredClone(example);
  config.services[0].overlapInstances = undefined;
  assert.throws(() => connectionBudget(config));
  config.services[0].overlapInstances = Number.MAX_SAFE_INTEGER;
  assert.throws(() => connectionBudget(config));
  config.services[0] = structuredClone(example.services[0]);
  config.services[0].pools.push(config.services[0].pools[0]);
  assert.throws(() => connectionBudget(config), /unique/);
  config.services[0] = structuredClone(example.services[1]);
  assert.throws(() => connectionBudget(config), /unique/);
});
