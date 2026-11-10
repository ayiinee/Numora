import { mergeConfig } from 'vitest/config';
import base from '../../apps/web/vitest.config.mts';
import { fileURLToPath } from 'node:url';
export default mergeConfig(base, {
  resolve: {
    alias: Object.fromEntries(
      ['react', 'next', '@testing-library/react', '@tanstack/react-query'].map((name) => [
        name,
        fileURLToPath(new URL('../../apps/web/node_modules/' + name, import.meta.url)),
      ]),
    ),
  },
  test: {
    maxWorkers: 1,
    passWithNoTests: false,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../../qa/scenarios/**/component/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
