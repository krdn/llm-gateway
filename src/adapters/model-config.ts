import type { AIProvider } from '../gateway/provider-meta';

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
  /** 모듈별 API 호출 타임아웃 (ms) — 미지정 시 게이트웨이 기본값(5분) */
  timeoutMs?: number;
}

export interface ModelConfigAdapter {
  resolve(moduleName: string): Promise<ResolvedModelConfig>;
}

export interface InMemoryModelConfigOptions {
  /**
   * 모듈명 → 기본 provider/model 매핑.
   * v1.x에서 도메인 하드코딩(MODULE_MODEL_MAP)이던 부분이 v2.0.0부터 명시적 입력으로 변경됨.
   */
  modules: Record<string, { provider: AIProvider; model: string }>;
  /** 모듈별 부분 오버라이드 */
  overrides?: Partial<Record<string, Partial<ResolvedModelConfig>>>;
  /**
   * 프로바이더별 공통 apiKey/baseUrl/model.
   * `model`은 override로 provider를 전환해 base.model이 새 프로바이더에서
   * 무효해진 경우에만 구제용으로 적용된다 — provider를 바꾸지 않은 평상시엔
   * base.model이 유지되고 providerDefaults.model은 무시된다.
   */
  providerDefaults?: Partial<
    Record<AIProvider, { apiKey?: string; baseUrl?: string; model?: string }>
  >;
}

/**
 * 기본 in-memory 어댑터 — `options.modules` 매핑을 기반으로 동작.
 * apiKey는 providerDefaults 또는 환경변수에서 자동 추론.
 *
 * v2.0.0 BREAKING: `modules` 옵션이 필수. v1.x는 MODULE_MODEL_MAP에서 자동 추론했지만
 * v2부터는 도메인 매핑을 모르므로 호출자가 명시해야 한다.
 */
export function createInMemoryModelConfig(
  options: InMemoryModelConfigOptions,
): ModelConfigAdapter {
  const { modules, overrides = {}, providerDefaults = {} } = options;

  return {
    async resolve(moduleName: string): Promise<ResolvedModelConfig> {
      const base = modules[moduleName];
      if (!base) {
        throw new Error(
          `[model-config] Unknown module: ${moduleName}. ` +
            `Pass it via createInMemoryModelConfig({ modules: { ... } }).`,
        );
      }
      const override = overrides[moduleName] ?? {};
      // 유효 provider를 먼저 확정한 뒤 그 provider의 defaults를 적용한다
      // (override로 provider를 바꾸면 바뀐 provider의 defaults가 쓰여야 함)
      const provider = override.provider ?? base.provider;
      const providerDefault = providerDefaults[provider] ?? {};

      // providerDefault.model은 provider를 전환한 경우에만 구제용으로 적용한다
      // (동일 provider에서 base.model을 조용히 덮어쓰지 않도록)
      const model =
        override.model ??
        (provider !== base.provider ? providerDefault.model : undefined) ??
        base.model;
      const apiKey =
        override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;
      const timeoutMs = override.timeoutMs;

      return {
        provider,
        model,
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
      };
    },
  };
}

function resolveApiKeyFromEnv(provider: AIProvider): string | undefined {
  const env = (typeof process !== 'undefined' ? process.env : {}) ?? {};
  switch (provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY;
    case 'claude-cli':
      return env.CLI_PROXY_API_KEY;
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
