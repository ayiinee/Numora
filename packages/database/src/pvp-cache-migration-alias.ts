import type { MigrationMeta } from 'drizzle-orm/migrator';

// Exact LF/CRLF SQL published by PR #172 before integration with #167.
const hashes = [
  '02abaee2be79dd98019a21d909679af3d336dd0e4023dc5202f8224a745424fd',
  '7f97d5af2e5050a3ed4c09fb67bf1028c46fa7e9f2a066398c623df2e4089106',
];
export const pvpCacheLegacyAliases = hashes.map((hash) => ({
  hash,
  created_at: '1794312000001',
}));

export function appliedPvpCacheAlias(
  migrations: MigrationMeta[],
  history: { hash: string; created_at: string }[],
) {
  if (
    !history.some((row) =>
      pvpCacheLegacyAliases.some(
        (alias) => alias.hash === row.hash && alias.created_at === row.created_at,
      ),
    )
  )
    return undefined;
  const canonical = migrations[74];
  if (!canonical || !hashes.includes(canonical.hash) || canonical.folderMillis !== 1794315600002)
    throw new Error('Renumbered PvP cache SQL differs from the published migration.');
  return canonical;
}
