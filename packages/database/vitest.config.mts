import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Each migration fixture creates a complete isolated database.
  test: { maxWorkers: 2 },
});
