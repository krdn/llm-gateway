import type { AIProvider } from '../gateway/provider-meta';
import { MODULE_MODEL_MAP } from '../types';

/**
 * 모듈 실행 시 사용할 모델/프로바이더/엔드포인트 정보.
 * ai-signalcraft는 DB에서 조회한 값으로 채우고,
 * 다른 프로젝트는 in-memory 어댑터로 환경변수/하드코드 값을 사용한다.
 */
export interface ResolvedModelConfig {
  provider: AIProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

export interface ModelConfigAdapter {
  resolve(moduleName: string): Promise<ResolvedModelConfig>;
}

export interface InMemoryModelConfigOptions {
  /** 모듈별 부분 오버라이드 */
  overrides?: Partial<Record<string, Partial<ResolvedModelConfig>>>;
  /** 프로바이더별 공통 apiKey/baseUrl */
  providerDefaults?: Partial<
    Record<AIProvider, { apiKey?: string; baseUrl?: string; model?: string }>
  >;
}

/**
 * 기본 in-memory 어댑터 — MODULE_MODEL_MAP을 기반으로 동작.
 * apiKey는 providerDefaults 또는 환경변수에서 자동 추론.
 */
export function createInMemoryModelConfig(
  options: InMemoryModelConfigOptions = {},
): ModelConfigAdapter {
  const { overrides = {}, providerDefaults = {} } = options;

  return {
    async resolve(moduleName: string): Promise<ResolvedModelConfig> {
      const base = MODULE_MODEL_MAP[moduleName];
      if (!base) {
        throw new Error(`[model-config] Unknown module: ${moduleName}`);
      }
      const providerDefault = providerDefaults[base.provider] ?? {};
      const override = overrides[moduleName] ?? {};

      const provider = (override.provider as AIProvider | undefined) ?? base.provider;
      const model = override.model ?? providerDefault.model ?? base.model;
      const apiKey =
        override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;

      return {
        provider,
        model,
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      };
    },
  };
}

function resolveApiKeyFromEnv(provider: AIProvider): string | undefined {
  const env = (typeof process !== 'undefined' ? process.env : {}) ?? {};
  switch (provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY;
    case 'openai':
      return env.OPENAI_API_KEY;
    case 'gemini':
      return env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
    case 'deepseek':
      return env.DEEPSEEK_API_KEY;
    case 'xai':
      return env.XAI_API_KEY;
    case 'openrouter':
      return env.OPENROUTER_API_KEY;
    default:
      return undefined;
  }
}
