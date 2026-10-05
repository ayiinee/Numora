import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { runQaAdmins } from './qa-admins.mjs';
import { QaAccountError } from './qa-accounts.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => a !== '--check'))
    throw new QaAccountError(
      'Only optional --check is supported. Password rotation is not part of qa:admins.',
    );
  const result = await runQaAdmins({
    root: resolve(import.meta.dirname, '../../..'),
    env: process.env,
    createClient,
    connect: postgres,
    check: args.includes('--check'),
  });
  console.log(
    `Development QA Admin roles ${result}. All Admin credentials: ignored .qa-seed/admin-roles/accounts.json. Teacher/Student credentials: .qa-seed/accounts.json.`,
  );
} catch (error) {
  console.error(
    error instanceof QaAccountError
      ? error.message
      : 'QA Admin provisioning failed. Credentials were not logged; preserve vaults and rerun the same command.',
  );
  process.exitCode = 1;
}
