import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'modules/index': 'src/modules/index.ts',
    'schemas/index': 'src/schemas/index.ts',
    'gateway/index': 'src/gateway/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'runner/index': 'src/runner/index.ts',
    'cli/index': 'cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node20',
  outDir: 'dist',
  external: [
    '@ai-sdk/anthropic',
    '@ai-sdk/google',
    '@ai-sdk/openai',
    'ai',
    'ai-sdk-provider-gemini-cli',
    'zod',
    'zod-to-json-schema',
    'cac',
  ],
});
