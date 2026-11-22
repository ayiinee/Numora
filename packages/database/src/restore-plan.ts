import { backupCheck, backupSchemas } from './backup-config.js';
import { accessKey, sortAccess, type AccessObject } from './restore-access.js';
import type { Inventory } from './backup-runtime.js';

export type Mapping = {
  format: 'NUMORA_VPS_OWNER_MAPPING_V1';
  reviewedBy: string;
  reviewedAt: string;
  owners: Record<string, 'numora_owner'>;
  dropGrantees: string[];
};
const runtimeRoles = ['numora_main_runtime', 'numora_irt_runtime'];
export function ownerMapping(input: unknown): Mapping {
  const value = input as Mapping;
  backupCheck(
    value?.format === 'NUMORA_VPS_OWNER_MAPPING_V1' &&
      typeof value.reviewedBy === 'string' &&
      value.reviewedBy.trim() &&
      typeof value.reviewedAt === 'string' &&
      Number.isFinite(Date.parse(value.reviewedAt)) &&
      value.owners &&
      typeof value.owners === 'object' &&
      !Array.isArray(value.owners) &&
      Object.keys(value.owners).length > 0 &&
      Object.entries(value.owners).every(
        ([name, target]) =>
          name.length > 0 &&
          target === 'numora_owner' &&
          ![
            'PUBLIC',
            ...runtimeRoles,
            'numora_api',
            'numora_worker',
            'numora_compute',
            'numora_migrator',
          ].includes(name),
      ) &&
      Array.isArray(value.dropGrantees) &&
      new Set(value.dropGrantees).size === value.dropGrantees.length &&
      value.dropGrantees.every(
        (role) =>
          typeof role === 'string' &&
          role &&
          !['PUBLIC', 'numora_owner', ...runtimeRoles].includes(role) &&
          !Object.hasOwn(value.owners, role),
      ),
    'Mapping needs a reviewed explicit source-owner map to numora_owner and non-runtime dropped grantees',
  );
  return value;
}

export function mappedAccess(inventory: Inventory, mapping: Mapping) {
  backupCheck(
    Array.isArray(inventory.restoreAccess) && inventory.restoreAccess.length > 0,
    'Mapped restore requires a new backup containing structured ACL inventory',
  );
  backupCheck(
    inventory.dependencies.length === 0 && inventory.sequencesStable,
    'External dependencies or changing sequences block mapped restore',
  );
  const owners = new Set(inventory.restoreAccess.map((object) => object.owner));
  for (const owner of owners)
    backupCheck(
      Object.hasOwn(mapping.owners, owner),
      'Mapping does not cover every source object/default-privilege owner',
    );
  backupCheck(
    Object.keys(mapping.owners).every((owner) => owners.has(owner)),
    'Mapping contains an unused source owner',
  );
  for (const policy of inventory.policies)
    backupCheck(
      (policy.roles as string[]).every((role) => role === 'public' || runtimeRoles.includes(role)),
      'Provider-specific RLS policy roles require a separate reviewed schema change',
    );
  const mapped = new Map<string, AccessObject>();
  for (const source of inventory.restoreAccess) {
    backupCheck(
      source.schema === null || (backupSchemas as readonly string[]).includes(source.schema),
      'ACL inventory includes an unapproved schema',
    );
    const object: AccessObject = { ...source, owner: 'numora_owner', grants: [] };
    for (const grant of source.grants) {
      if (mapping.dropGrantees.includes(grant.grantee)) continue;
      const grantee = Object.hasOwn(mapping.owners, grant.grantee) ? 'numora_owner' : grant.grantee;
      backupCheck(
        grantee === 'PUBLIC' || grantee === 'numora_owner' || runtimeRoles.includes(grantee),
        'Unmapped direct-login/provider grant requires an explicit reviewed decision',
      );
      backupCheck(
        Object.hasOwn(mapping.owners, grant.grantor),
        'Delegated grant chains require a separate reviewed mapping',
      );
      backupCheck(
        !grant.grantable || grantee === 'numora_owner',
        'Grant options to runtime or PUBLIC are not permitted',
      );
      backupCheck(
        !['CREATE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'].includes(grant.privilege) ||
          grantee === 'numora_owner',
        'Administrative/DDL-like grants to non-owner roles are not permitted',
      );
      // PR 2 explicitly removes PUBLIC schema access on the VPS; object grants remain exact.
      if (source.kind === 'SCHEMA' && grantee === 'PUBLIC') continue;
      const candidate = { ...grant, grantee, grantor: 'numora_owner' };
      if (!object.grants.some((item) => JSON.stringify(item) === JSON.stringify(candidate)))
        object.grants.push(candidate);
    }
    const key = accessKey(object),
      existing = mapped.get(key);
    if (object.kind === 'SCHEMA')
      backupCheck(
        ['USAGE', 'CREATE'].every((privilege) =>
          object.grants.some(
            (grant) =>
              grant.grantee === 'numora_owner' && grant.privilege === privilege && !grant.grantable,
          ),
        ),
        'The stable owner must retain schema USAGE/CREATE in this restore profile',
      );
    backupCheck(
      !existing ||
        JSON.stringify(sortAccess([existing])[0]!.grants) ===
          JSON.stringify(sortAccess([object])[0]!.grants),
      'Collapsing source owners produces conflicting default privileges',
    );
    mapped.set(key, object);
  }
  return sortAccess([...mapped.values()]);
}

export function restoreSelection(list: string) {
  let removed = 0;
  const result = list.split('\n').filter((line) => {
    if (/^\d+; \d+ \d+ SCHEMA - public(?:\s|$)/.test(line)) {
      removed++;
      return false;
    }
    return true;
  });
  backupCheck(
    removed === 1,
    'Archive must contain exactly one public schema entry for the prepared target',
  );
  return result.join('\n');
}

/** Ownership/ACL differences are checked separately using structured privileges. No SQL/body rewriting. */
export function structuralCatalog(
  inventory: Inventory | Awaited<ReturnType<typeof import('./backup-catalog.js').catalog>>,
) {
  const {
    namespaces,
    relations,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    policies,
    types,
    history,
  } = inventory;
  return JSON.stringify(
    {
      namespaces,
      relations,
      columns,
      constraints,
      indexes,
      functions,
      triggers,
      policies,
      types,
      history,
    },
    (key, value) => (['owner', 'acl', 'publicUsage'].includes(key) ? undefined : value),
  );
}
