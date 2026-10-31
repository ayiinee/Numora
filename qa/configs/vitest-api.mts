import { mergeConfig } from 'vitest/config';
import base from '../../apps/api/vitest.config.mts';
// Retain Nest's DTO/DI metadata transformer from the canonical API configuration.
export default mergeConfig(base, {
  test: {
    maxWorkers: 1,
    passWithNoTests: false,
    include: ['src/**/*.{test,spec}.ts', '../../qa/scenarios/**/integration/**/*.{test,spec}.ts'],
  },
});
