import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'qa/.local/**',
      'qa/**/reports/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-*/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.tmp/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/drizzle/**',
      'packages/contracts/openapi/openapi.json',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
