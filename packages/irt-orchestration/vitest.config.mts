import { defineConfig } from 'vitest/config';

// node:test .mjs checks run through root test:checks; never collect emitted dist tests.
export default defineConfig({ test: { include: ['src/**/*.{spec,test}.ts'] } });
