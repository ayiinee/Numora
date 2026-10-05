import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { QaAccountError, runQaAccounts } from './qa-accounts.mjs';

try {
  const result = await runQaAccounts({
    root: resolve(import.meta.dirname, '../../..'),
    env: process.env,
    args: process.argv.slice(2),
    createClient,
  });
  console.log(
    `Six Development QA Auth accounts ${result}; Teacher/Student credentials: .qa-seed/accounts.json. Content Admin: .qa-seed/admin-roles/accounts.json. Six-actor IDs: .qa-seed/actors.json. All files are ignored.`,
  );
} catch (error) {
  // Provider/filesystem errors may contain credentials: emit only fixed operator messages.
  console.error(
    error instanceof QaAccountError
      ? error.message
      : 'QA provisioning failed. Credentials were not logged.',
  );
  process.exitCode = 1;
}
