// src/adapters/model-config.ts
function createInMemoryModelConfig(options) {
  const { modules, overrides = {}, providerDefaults = {} } = options;
  return {
    async resolve(moduleName) {
      const base = modules[moduleName];
      if (!base) {
        throw new Error(
          `[model-config] Unknown module: ${moduleName}. Pass it via createInMemoryModelConfig({ modules: { ... } }).`
        );
      }
      const override = overrides[moduleName] ?? {};
      const provider = override.provider ?? base.provider;
      const providerDefault = providerDefaults[provider] ?? {};
      const model = override.model ?? (provider !== base.provider ? providerDefault.model : void 0) ?? base.model;
      const apiKey = override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;
      const timeoutMs = override.timeoutMs;
      return {
        provider,
        model,
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...maxOutputTokens ? { maxOutputTokens } : {},
        ...timeoutMs ? { timeoutMs } : {}
      };
    }
  };
}
function resolveApiKeyFromEnv(provider) {
  const env = (typeof process !== "undefined" ? process.env : {}) ?? {};
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "claude-cli":
      return env.CLI_PROXY_API_KEY;
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

export { createInMemoryModelConfig, noopPipelineControl };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map