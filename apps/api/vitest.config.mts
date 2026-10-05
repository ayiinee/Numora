import { configDefaults, defineConfig } from 'vitest/config';
import ts from 'typescript';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'scripts/**/*.test.mjs'],
    include: ['src/**/*.{test,spec}.ts'],
    maxWorkers: 2,
    env: { TEACHER_TOKEN_PEPPER: 'fixture-only-teacher-token-pepper-not-for-deployment' },
  },
  plugins: [
    {
      name: 'nestjs-test-metadata',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.ts') || id.includes('node_modules')) return;
        // Nest's ValidationPipe must see the same DTO/DI metadata as the production tsc build.
        // Otherwise HTTP tests can pass while silently skipping body validation.
        return ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            esModuleInterop: true,
            sourceMap: true,
          },
          fileName: id,
        }).outputText;
      },
    },
  ],
});
