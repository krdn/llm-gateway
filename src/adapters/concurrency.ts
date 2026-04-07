import type { AIProvider } from '../gateway/provider-meta';

export interface ConcurrencyAdapter {
  /** 동시 실행 가능한 모듈 수 (프로바이더별) */
  getLimit(provider: AIProvider): Promise<number>;
}

const DEFAULT_LIMITS: Partial<Record<AIProvider, number>> = {
  gemini: 2,
  anthropic: 3,
  openai: 2,
  'gemini-cli': 1,
  'claude-cli': 1,
  ollama: 1,
  deepseek: 2,
  xai: 2,
  openrouter: 2,
  custom: 1,
};

export function createStaticConcurrency(
  limits: Partial<Record<AIProvider, number>> = {},
): ConcurrencyAdapter {
  return {
    async getLimit(provider: AIProvider): Promise<number> {
      return limits[provider] ?? DEFAULT_LIMITS[provider] ?? 1;
    },
  };
}
