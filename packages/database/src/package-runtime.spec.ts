import { describe, expect, it } from 'vitest';
import { allowSyntheticContent, developmentProjectRef } from './package-runtime.js';

describe('synthetic content isolation', () => {
  const dev = {
    NODE_ENV: 'development',
    ALLOW_SYNTHETIC_CONTENT: 'true',
    SUPABASE_PROJECT_REF: developmentProjectRef,
    SUPABASE_URL: `https://${developmentProjectRef}.supabase.co`,
    DATABASE_URL: `postgres://postgres.${developmentProjectRef}:unused@aws-0.pooler.supabase.com:5432/postgres?sslmode=require`,
  };
  it('defaults off and permits only the explicitly selected Development target', () => {
    expect(allowSyntheticContent({})).toBe(false);
    expect(allowSyntheticContent(dev)).toBe(true);
    for (const override of [
      { NODE_ENV: 'production' },
      { SUPABASE_PROJECT_REF: 'other' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' },
      { DATABASE_URL: dev.DATABASE_URL.replace(developmentProjectRef, 'other') },
      { DATABASE_URL: dev.DATABASE_URL.replace('sslmode=require', 'sslmode=disable') },
    ])
      expect(() => allowSyntheticContent({ ...dev, ...override })).toThrow();
  });
  it('permits explicitly isolated test databases, never arbitrary localhost databases', () => {
    const env = {
      NODE_ENV: 'test',
      ALLOW_SYNTHETIC_CONTENT: 'true',
      TEST_DATABASE_URL: 'postgres://localhost/numora_test_cleanup',
    };
    expect(allowSyntheticContent(env)).toBe(true);
    expect(() =>
      allowSyntheticContent({ ...env, TEST_DATABASE_URL: 'postgres://localhost/postgres' }),
    ).toThrow();
    expect(() => allowSyntheticContent({ ...env, DATABASE_URL: dev.DATABASE_URL })).toThrow();
  });
});
