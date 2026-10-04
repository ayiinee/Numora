import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['./src/test-database.setup.ts'], maxWorkers: 2 },
});
