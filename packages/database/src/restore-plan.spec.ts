import { expect, it } from 'vitest';
import { aclStatements, type AccessObject } from './restore-access.js';
import { mappedAccess, ownerMapping, restoreSelection } from './restore-plan.js';
import { vpsRestoreTarget } from './restore-vps.js';
import type { Inventory } from './backup-runtime.js';

const mapping = () =>
  ownerMapping({
    format: 'NUMORA_VPS_OWNER_MAPPING_V1',
    reviewedBy: 'TEST_ONLY',
    reviewedAt: new Date().toISOString(),
    owners: { postgres: 'numora_owner' },
    dropGrantees: ['anon', 'authenticated', 'service_role'],
  });
const object: AccessObject = {
  kind: 'TABLE',
  schema: 'public',
  name: 'users',
  identity: '',
  column: null,
  owner: 'postgres',
  grants: [
    { grantee: 'postgres', grantor: 'postgres', privilege: 'SELECT', grantable: false },
    { grantee: 'numora_main_runtime', grantor: 'postgres', privilege: 'SELECT', grantable: false },
    { grantee: 'anon', grantor: 'postgres', privilege: 'SELECT', grantable: false },
  ],
};
const inventory = (access: AccessObject[]) =>
  ({
    restoreAccess: access,
    dependencies: [],
    sequencesStable: true,
    policies: [],
  }) as unknown as Inventory;
it('maps owners, removes only reviewed grantees and retains exact Main/Compute grants', () => {
  const [result] = mappedAccess(inventory([object]), mapping());
  expect(result!.owner).toBe('numora_owner');
  expect(result!.grants.map((grant) => grant.grantee).sort()).toEqual([
    'numora_main_runtime',
    'numora_owner',
  ]);
  expect(result!.grants.every((grant) => grant.grantor === 'numora_owner')).toBe(true);
});
it('rejects missing structured inventory, owner maps, unsafe grants and delegated grantors', () => {
  expect(() => mappedAccess(inventory([]), mapping())).toThrow();
  expect(() =>
    mappedAccess(inventory([{ ...object, owner: 'unknown_owner' }]), mapping()),
  ).toThrow();
  for (const grant of [
    { ...object.grants[1]!, grantee: 'old_api' },
    { ...object.grants[1]!, grantable: true },
    { ...object.grants[1]!, privilege: 'CREATE' },
    { ...object.grants[1]!, grantor: 'delegate' },
  ])
    expect(() => mappedAccess(inventory([{ ...object, grants: [grant] }]), mapping())).toThrow();
  expect(() =>
    ownerMapping({ ...mapping(), owners: { numora_main_runtime: 'numora_owner' } }),
  ).toThrow();
  expect(() => ownerMapping({ ...mapping(), dropGrantees: ['numora_irt_runtime'] })).toThrow();
  expect(() => ownerMapping({ ...mapping(), reviewedAt: 'REPLACE' })).toThrow();
});
it('rejects incompatible default privileges when source owners collapse into one owner', () => {
  const def = { ...object, kind: 'DEFAULT', name: 'r', schema: null };
  const second = { ...def, owner: 'other_owner', grants: [] };
  expect(() =>
    mappedAccess(inventory([def, second]), {
      ...mapping(),
      owners: { postgres: 'numora_owner', other_owner: 'numora_owner' },
    }),
  ).toThrow(/conflicting/);
});
it('removes PUBLIC schema usage without dropping intentional PUBLIC function execution', () => {
  const pub = { grantee: 'PUBLIC', grantor: 'postgres', privilege: 'USAGE', grantable: false };
  const schemaGrants = [
    pub,
    ...['USAGE', 'CREATE'].map((privilege) => ({ ...pub, grantee: 'postgres', privilege })),
  ];
  expect(
    mappedAccess(
      inventory([{ ...object, kind: 'SCHEMA', name: 'public', grants: schemaGrants }]),
      mapping(),
    )[0]!.grants.some((grant) => grant.grantee === 'PUBLIC'),
  ).toBe(false);
  expect(
    mappedAccess(
      inventory([
        { ...object, kind: 'FUNCTION', name: 'helper', grants: [{ ...pub, privilege: 'EXECUTE' }] },
      ]),
      mapping(),
    )[0]!.grants,
  ).toHaveLength(1);
});
it('quotes identifiers and emits per-object/column/default grants rather than blanket grants', () => {
  const item = {
    ...object,
    owner: 'numora_owner',
    name: 'odd"name.with.dot',
    grants: [
      {
        grantee: 'numora_main_runtime',
        grantor: 'numora_owner',
        privilege: 'UPDATE',
        grantable: false,
      },
    ],
  };
  expect(aclStatements(item)[1]).toBe(
    'GRANT UPDATE ON TABLE "public"."odd""name.with.dot" TO "numora_main_runtime"',
  );
  expect(aclStatements({ ...item, kind: 'COLUMN', column: 'answer' })[1]).toContain(
    'GRANT UPDATE ("answer") ON TABLE',
  );
  expect(aclStatements({ ...item, kind: 'DEFAULT', name: 'r' })[1]).toContain(
    'ALTER DEFAULT PRIVILEGES FOR ROLE numora_owner IN SCHEMA "public" GRANT UPDATE ON TABLES',
  );
});
it('omits only the public schema TOC entry, retaining all data/ACL-independent objects', () => {
  const list =
    ';archive\n1; 2615 2 SCHEMA - public pg_database_owner\n2; 1259 3 TABLE public users postgres\n3; 0 3 TABLE DATA public users postgres\n';
  expect(restoreSelection(list)).toContain('TABLE DATA public users');
  expect(restoreSelection(list)).not.toContain('SCHEMA - public');
  expect(() => restoreSelection('1; 1259 1 TABLE public users postgres')).toThrow();
});
it('pins the direct target/migrator and rejects arbitrary databases/logins/TLS modes', () => {
  const env = {
    NUMORA_BACKUP_TARGET_HOST: 'localhost',
    NUMORA_BACKUP_TARGET_PORT: '5432',
    NUMORA_BACKUP_TARGET_DATABASE: 'numora_production',
    NUMORA_BACKUP_TARGET_USER: 'numora_migrator',
    NUMORA_BACKUP_TARGET_URL:
      'postgres://numora_migrator:TEST_ONLY@localhost:5432/numora_production?sslmode=verify-full',
  };
  expect(vpsRestoreTarget(env).pathname).toBe('/numora_production');
  for (const database of ['postgres', 'numora_test', 'active_business_db'])
    expect(() =>
      vpsRestoreTarget({
        ...env,
        NUMORA_BACKUP_TARGET_DATABASE: database,
        NUMORA_BACKUP_TARGET_URL: env.NUMORA_BACKUP_TARGET_URL.replace(
          'numora_production',
          database,
        ),
      }),
    ).toThrow();
  expect(() =>
    vpsRestoreTarget({
      ...env,
      NUMORA_BACKUP_TARGET_URL: env.NUMORA_BACKUP_TARGET_URL.replace('verify-full', 'require'),
    }),
  ).toThrow();
});
