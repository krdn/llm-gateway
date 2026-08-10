import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      // 재export만 하는 barrel과 런타임 코드가 없는 타입 파일은 계측에서 뺀다.
      // 남겨두면 0%로 잡혀 실제 로직의 커버리지를 가린다.
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/types.ts', 'src/**/index.ts'],
    },
  },
});
