import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function connectionBudget(config) {
  const integer = (value, name, minimum = 0) => {
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error(`${name} must be an explicit safe integer >= ${minimum}`);
    return value;
  };
  if (!config || typeof config !== 'object') throw new Error('Expected a budget object');
  const max = integer(config.maxConnections, 'maxConnections', 1);
  const reserved = integer(config.superuserReservedConnections, 'superuserReservedConnections', 1);
  const operations = integer(config.operationsConnections, 'operationsConnections', 1);
  const headroom = integer(config.headroomConnections, 'headroomConnections', 1);
  if (!Array.isArray(config.services) || !config.services.length)
    throw new Error('Inventory every service and connection pool');
  const names = new Set();
  const roles = new Map();
  const services = config.services.map((service) => {
    if (
      !service ||
      typeof service.name !== 'string' ||
      !/^[a-z0-9_-]+$/.test(service.name) ||
      names.has(service.name) ||
      typeof service.login !== 'string' ||
      !/^numora_[a-z0-9_]+$/.test(service.login)
    )
      throw new Error('Services require unique names and an explicit numora_ login');
    names.add(service.name);
    const limit = integer(service.connectionLimit, 'connectionLimit', 1);
    const instances = integer(service.instances, 'instances');
    const overlap = integer(service.overlapInstances, 'overlapInstances');
    if (!Array.isArray(service.pools) || !service.pools.length)
      throw new Error('Inventory every independent pool, including orchestration pools');
    const poolNames = new Set();
    const perProcess = service.pools.reduce((sum, pool) => {
      if (!pool || typeof pool.name !== 'string' || !pool.name || poolNames.has(pool.name))
        throw new Error('Pool names must be present and unique per service');
      poolNames.add(pool.name);
      return integer(sum + integer(pool.max, 'pool.max', 1), 'pool sum', 1);
    }, 0);
    const connections = integer((instances + overlap) * perProcess, 'service connections');
    const role = roles.get(service.login) ?? { connections: 0, limit };
    if (role.limit !== limit) throw new Error('Shared-login connection limits disagree');
    role.connections = integer(role.connections + connections, 'role connections');
    roles.set(service.login, role);
    return { name: service.name, login: service.login, connections };
  });
  for (const role of roles.values())
    if (role.connections > role.limit)
      throw new Error('Planned connections exceed a login connection limit');
  const clients = integer(
    services.reduce((sum, service) => sum + service.connections, 0),
    'client total',
  );
  const planned = integer(clients + reserved + operations + headroom, 'planned total');
  if (planned > max) throw new Error('Planned connections and reserves exceed max_connections');
  return {
    max,
    clients,
    reserved,
    operations,
    headroom,
    planned,
    unallocated: max - planned,
    services,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node scripts/check-postgres-budget.mjs <inventory.json>');
    const result = connectionBudget(JSON.parse(await readFile(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    console.log(
      'Static connection arithmetic passed; verify inventory, live limits and memory under load.',
    );
  } catch (error) {
    console.error(
      error instanceof Error && !(error instanceof SyntaxError)
        ? error.message
        : 'Cannot read budget JSON',
    );
    process.exitCode = 1;
  }
}
