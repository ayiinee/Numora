import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import type { TransactionSql } from 'postgres';

type History = { hash: string; created_at: string }[];
type Manifest = {
  history: History;
  canonicalHashes: string[];
  catalogues: Record<string, unknown>;
  aliases: Record<string, string>;
};
const signature = '5aa86c7155dbcc5330d0a38bf4d36222606ff9b1be088510842a27776123354d';
const pair = (hash: string, cursor: number | string) => `${hash}:${cursor}`;
const plain = (value: unknown) => JSON.stringify(value);

/** Compare SQL tokens, retaining quoted literals/identifiers and dropping only comments/spacing. */
export function sqlBodyTokens(value: string) {
  return (
    value.match(
      /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z_][a-zA-Z_0-9$]*|\d+(?:\.\d+)?|\S/g,
    ) ?? []
  )
    .filter((token) => !token.startsWith('--') && !token.startsWith('/*'))
    .map((token) => (token.startsWith("'") || token.startsWith('"') ? token : token.toLowerCase()));
}

export async function tableCatalogue(tx: TransactionSql, name: string) {
  const relation = `public.${name}`;
  const columns =
    await tx`select a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as required,pg_get_expr(d.adbin,d.adrelid) as default from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=to_regclass(${relation}) and a.attnum>0 and not a.attisdropped order by a.attname`;
  const constraints =
    await tx`select conname as name,pg_get_constraintdef(oid,true) as definition from pg_constraint where conrelid=to_regclass(${relation}) order by conname`;
  const indexes =
    await tx`select indexname as name,indexdef as definition from pg_indexes where schemaname='public' and tablename=${name} order by indexname`;
  const policies =
    await tx`select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=${name} order by policyname`;
  const rls =
    await tx`select relrowsecurity,relforcerowsecurity from pg_class where oid=to_regclass(${relation})`;
  return {
    columns: [...columns],
    constraints: [...constraints],
    indexes: [...indexes],
    policies: [...policies],
    rls: [...rls],
  };
}

function body(sql: string) {
  const match = sql.match(/AS\s+\$\$([\s\S]*?)\$\$/i);
  if (!match) throw new Error('Expected reviewed PL/pgSQL function body.');
  return sqlBodyTokens(match[1]!);
}

/** Narrow adoption of the independently backed-up/audited Development mixed history. */
export async function reconcileDevelopmentHistory(
  tx: TransactionSql,
  migrations: MigrationMeta[],
  folder: string,
  history: History,
) {
  if (!history.some((row) => row.hash === signature && row.created_at === '1791324846967'))
    return false;
  const fixture = resolve(folder, '..', 'staging/fixtures/development-20261029');
  const manifest = JSON.parse(
    await readFile(resolve(fixture, 'provenance.json'), 'utf8'),
  ) as Manifest;
  if (
    manifest.history.length !== 62 ||
    manifest.canonicalHashes.length !== 50 ||
    Object.keys(manifest.catalogues).sort().join(',') !==
      'content_upload_sessions,generator_packages' ||
    Object.keys(manifest.aliases).sort().join(',') !== '32,33,37,38'
  )
    throw new Error('Invalid audited Development adoption manifest.');
  if (plain(history.slice(0, manifest.history.length)) !== plain(manifest.history))
    throw new Error('Unknown Development history: audited prefix differs.');
  if (!manifest.canonicalHashes.every((hash, i) => migrations[i]?.hash === hash))
    throw new Error('Canonical SQL differs from the audited Development adoption plan.');
  const applied = new Set(history.map((row) => pair(row.hash, row.created_at)));
  const allowed = new Set(migrations.map((entry) => pair(entry.hash, entry.folderMillis)));
  if (
    !history
      .slice(manifest.history.length)
      .every((row) => allowed.has(pair(row.hash, row.created_at)))
  )
    throw new Error('Unknown Development history: extra migration is not canonical.');
  const adopted = migrations
    .slice(3, 50)
    .every((entry) => applied.has(pair(entry.hash, entry.folderMillis)));
  if (!adopted) {
    if (history.length !== manifest.history.length)
      throw new Error('Partial Development adoption requires explicit reconciliation.');
    for (const [name, expected] of Object.entries(manifest.catalogues))
      if (plain(await tableCatalogue(tx, name)) !== plain(expected))
        throw new Error(`Development schema drift in ${name}; adoption refused.`);
    const functions = await tx<
      {
        proname: string;
        prosrc: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        args: string;
        returns: string;
      }[]
    >`
      select proname,prosrc,prosecdef,proconfig,pg_get_function_arguments(oid) as args,pg_get_function_result(oid) as returns
      from pg_proc where oid in (to_regprocedure('public.drill_reward_guard()'),to_regprocedure('public.guard_pvp_transient_cancellation()')) order by proname`;
    const xp = functions.find((row) => row.proname === 'drill_reward_guard');
    const pvp = functions.find((row) => row.proname === 'guard_pvp_transient_cancellation');
    const runtimeSql = await readFile(
      resolve(folder, '../staging/fixtures/runtime-pr102/0040_tryout_reward_decimal_guard.sql'),
      'utf8',
    );
    const legacyPvp = `BEGIN IF OLD.status IN ('WAITING','READY','RUNNING') AND NEW.status='CANCELLED' AND NEW.end_reason='SERVICE_INTERRUPTED' THEN RETURN OLD; END IF; RETURN NEW; END;`;
    if (
      !xp ||
      !pvp ||
      functions.some((row) => row.prosecdef || row.args !== '' || row.returns !== 'trigger') ||
      xp.proconfig !== null ||
      plain(pvp.proconfig) !== plain(['search_path=public']) ||
      plain(sqlBodyTokens(xp.prosrc)) !== plain(body(runtimeSql)) ||
      plain(sqlBodyTokens(pvp.prosrc)) !== plain(sqlBodyTokens(legacyPvp))
    )
      throw new Error('Development function drift; adoption refused.');
    const triggers = await tx<{ valid: boolean }[]>`
      select (t.tgtype=19 and t.tgnargs=0 and t.tgqual is null and t.tgenabled='O' and t.tgconstraint=0
        and t.tgfoid=to_regprocedure('public.guard_pvp_transient_cancellation()')
        and t.tgattr::text=(select attnum::text from pg_attribute where attrelid=t.tgrelid and attname='status')) as valid
      from pg_trigger t where t.tgrelid='public.pvp_matches'::regclass and t.tgname='pvp_transient_cancellation_guard' and not t.tgisinternal`;
    if (triggers.length !== 1 || !triggers[0]!.valid)
      throw new Error('Development PvP trigger drift; adoption refused.');
    const ledger = await tx<{ valid: boolean }[]>`
      select (t.tgtype=31 and t.tgnargs=0 and t.tgqual is null and t.tgenabled='O' and t.tgconstraint=0
        and t.tgattr::text='' and t.tgfoid=to_regprocedure('public.drill_reward_guard()')
        and (select count(*) from pg_attribute where attrelid=t.tgrelid and attname in ('base_xp','xp_amount')
          and format_type(atttypid,atttypmod)='numeric(14,6)')=2
        and exists(select 1 from pg_index i where i.indrelid=t.tgrelid and i.indisunique and i.indisvalid and i.indisready
          and i.indpred is null and i.indkey::text=(select attnum::text from pg_attribute where attrelid=t.tgrelid and attname='attempt_id'))) as valid
      from pg_trigger t where t.tgrelid='public.xp_ledger'::regclass and t.tgname='drill_reward_immutable' and not t.tgisinternal`;
    if (ledger.length !== 1 || !ledger[0]!.valid)
      throw new Error('Development XP ledger protection drift; adoption refused.');
    const hashes = new Set(history.map((row) => row.hash));
    // Validate every adoption before applying any forward DDL or appending a cursor.
    for (const [index, entry] of migrations.slice(0, 48).entries()) {
      if (index < 3 || hashes.has(entry.hash)) continue;
      const alias = manifest.aliases[String(index)];
      if (!alias || !hashes.has(alias))
        throw new Error('Development migration provenance is incomplete.');
      if (index === 33 || index === 37) {
        const sql = entry.sql.join('--> statement-breakpoint');
        // Drizzle's split statements preserve the exact original file when rejoined.
        const crlfHash = createHash('sha256')
          .update(sql.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))
          .digest('hex');
        if (crlfHash !== alias)
          throw new Error('Development line-ending alias differs from canonical SQL.');
      }
    }
  }
  const hashes = new Set(history.map((row) => row.hash));
  for (const [index, entry] of migrations.entries()) {
    if (index < 3 || applied.has(pair(entry.hash, entry.folderMillis))) continue;
    if (index >= 48) {
      for (const statement of entry.sql) {
        if (!statement.trim()) continue;
        // The exact existing trigger was inspected; replace its function, never recreate it.
        if (
          !adopted &&
          index === 49 &&
          /CREATE TRIGGER pvp_transient_cancellation_guard/.test(statement)
        )
          continue;
        await tx.unsafe(statement);
      }
    } else if (!hashes.has(entry.hash) && !manifest.aliases[String(index)]) {
      throw new Error('Development adoption lacks an audited schema witness.');
    }
    await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
  }
  return true;
}
