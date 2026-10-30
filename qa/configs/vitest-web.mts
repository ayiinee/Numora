import { mergeConfig } from 'vitest/config';
import base from '../../apps/web/vitest.config.mts';
export default mergeConfig(base, {
  test: {
    maxWorkers: 1,
    passWithNoTests: false,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../../qa/scenarios/**/component/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
