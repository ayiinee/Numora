import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('development sandbox bridge guard', () => {
  it('blocks sandbox writes before connecting when explicit authorization is missing', () => {
    let output = '';
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'src/staging-bridge.ts', 'apply'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_MIGRATION_URL: 'postgres://postgres.pkamenfnwmoeisccnrnk:fake@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
          SUPABASE_PROJECT_REF: 'pkamenfnwmoeisccnrnk',
          ALLOW_AUDITED_SANDBOX_BRIDGE: '',
        },
        // Includes cold tsx/module startup on Windows; the authorization assertion is unchanged.
        stdio: 'pipe', timeout: 60000,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'stderr' in error)
        output = String(error.stderr);
    }
    expect(output).toContain('ALLOW_AUDITED_SANDBOX_BRIDGE=true');
  }, 75000);
});
