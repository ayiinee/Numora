import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: {
    environment: 'node',
    maxWorkers: 1,
    include: ['qa/scenarios/**/*.test.ts', 'packages/assessment-engine/src/rewards.spec.ts'],
  },
});
