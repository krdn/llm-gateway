// src/types.ts
var MODULE_MODEL_MAP = {
  // Stage 1: 대량 텍스트 요약/분류 — 속도·비용 우선
  "macro-view": { provider: "gemini", model: "gemini-2.5-flash" },
  segmentation: { provider: "gemini", model: "gemini-2.5-flash" },
  "sentiment-framing": { provider: "gemini", model: "gemini-2.5-flash" },
  "message-impact": { provider: "gemini", model: "gemini-2.5-flash" },
  // Stage 2: 복합 추론/전략 — 품질 우선
  "risk-map": { provider: "anthropic", model: "claude-sonnet-4-6" },
  opportunity: { provider: "anthropic", model: "claude-sonnet-4-6" },
  strategy: { provider: "anthropic", model: "claude-sonnet-4-6" },
  "final-summary": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "integrated-report": { provider: "anthropic", model: "claude-sonnet-4-6" },
  // Stage 4: ADVN 고급 분석 모듈
  "approval-rating": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "frame-war": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "crisis-scenario": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "win-simulation": { provider: "anthropic", model: "claude-sonnet-4-6" }
};

// src/adapters/model-config.ts
function createInMemoryModelConfig(options = {}) {
  const { overrides = {}, providerDefaults = {} } = options;
  return {
    async resolve(moduleName) {
      const base = MODULE_MODEL_MAP[moduleName];
      if (!base) {
        throw new Error(`[model-config] Unknown module: ${moduleName}`);
      }
      const providerDefault = providerDefaults[base.provider] ?? {};
      const override = overrides[moduleName] ?? {};
      const provider = override.provider ?? base.provider;
      const model = override.model ?? providerDefault.model ?? base.model;
      const apiKey = override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;
      return {
        provider,
        model,
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...maxOutputTokens ? { maxOutputTokens } : {}
      };
    }
  };
}
function resolveApiKeyFromEnv(provider) {
  const env = (typeof process !== "undefined" ? process.env : {}) ?? {};
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "gemini":
      return env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
    case "deepseek":
      return env.DEEPSEEK_API_KEY;
    case "xai":
      return env.XAI_API_KEY;
    case "openrouter":
      return env.OPENROUTER_API_KEY;
    default:
      return void 0;
  }
}

// src/adapters/pipeline-control.ts
var noopPipelineControl = {
  async isCancelled() {
    return false;
  },
  async waitIfPaused() {
  },
  async checkCostLimit() {
    return true;
  },
  async appendEvent() {
  }
};

// src/adapters/concurrency.ts
var DEFAULT_LIMITS = {
  gemini: 2,
  anthropic: 3,
  openai: 2,
  "gemini-cli": 1,
  "claude-cli": 1,
  ollama: 1,
  deepseek: 2,
  xai: 2,
  openrouter: 2,
  custom: 1
};
function createStaticConcurrency(limits = {}) {
  return {
    async getLimit(provider) {
      return limits[provider] ?? DEFAULT_LIMITS[provider] ?? 1;
    }
  };
}

export { createInMemoryModelConfig, createStaticConcurrency, noopPipelineControl };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map