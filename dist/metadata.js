// src/gateway/provider-meta.ts
var PROVIDER_REGISTRY = {
  // --- 직접 API ---
  anthropic: {
    type: "anthropic",
    displayName: "Anthropic (Claude)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-orange-500"
  },
  openai: {
    type: "openai",
    displayName: "OpenAI (ChatGPT)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-green-500"
  },
  gemini: {
    type: "gemini",
    displayName: "Google (Gemini)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-blue-500"
  },
  deepseek: {
    type: "deepseek",
    displayName: "DeepSeek",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    // DeepSeek API는 response_format 'json_object'만 받고 AI SDK Output.object가
    // 보내는 'json_schema'는 400("This response_format type is unavailable now")으로
    // 거부한다 (2026-08-20 v4-flash/v4-pro/deepseek-chat 전부 실측) → text2step 폴백.
    supportsStructuredOutput: false,
    callMethod: "chat",
    color: "bg-purple-500"
  },
  xai: {
    type: "xai",
    displayName: "xAI (Grok)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    supportsStructuredOutput: true,
    callMethod: "chat",
    color: "bg-red-500"
  },
  openrouter: {
    type: "openrouter",
    displayName: "OpenRouter",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsStructuredOutput: true,
    callMethod: "chat",
    color: "bg-cyan-500"
  },
  // --- Proxy CLI ---
  "claude-cli": {
    type: "claude-cli",
    displayName: "Claude CLI (Proxy)",
    accessMethod: "proxy-cli",
    // cli-proxy-api는 config.yaml의 api-keys로 Bearer 토큰을 항상 검증한다.
    // 프록시 config에 등록된 키를 options.apiKey로 전달해야 한다 (미전달 시 명시 에러).
    requiresApiKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: "http://localhost:8317",
    supportsStructuredOutput: false,
    callMethod: "chat",
    color: "bg-amber-500"
  },
  // ai-sdk-provider-gemini-cli 경유 — 로컬 ~/.gemini OAuth를 직접 사용한다.
  // baseUrl/apiKey는 무시되며 cli-proxy-api와 무관한 별도 크레덴셜/쿼터 경로.
  "gemini-cli": {
    type: "gemini-cli",
    displayName: "Gemini CLI (Local OAuth)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    callMethod: "direct",
    color: "bg-teal-500"
  },
  // --- 로컬 ---
  ollama: {
    type: "ollama",
    displayName: "Ollama (Local)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: "http://localhost:11434",
    supportsStructuredOutput: false,
    callMethod: "chat",
    defaultApiKey: "ollama",
    color: "bg-gray-500"
  },
  custom: {
    type: "custom",
    displayName: "Custom (OpenAI Compatible)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    callMethod: "chat",
    defaultApiKey: "ollama",
    color: "bg-zinc-500"
  }
};
var AI_PROVIDER_VALUES = Object.keys(PROVIDER_REGISTRY);
function getProvidersByAccess(method) {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.accessMethod === method);
}
function isProxyCli(provider) {
  return PROVIDER_REGISTRY[provider].accessMethod === "proxy-cli";
}
function needsTextFallback(provider) {
  return !PROVIDER_REGISTRY[provider].supportsStructuredOutput;
}

export { AI_PROVIDER_VALUES, PROVIDER_REGISTRY, getProvidersByAccess, isProxyCli, needsTextFallback };
//# sourceMappingURL=metadata.js.map
//# sourceMappingURL=metadata.js.map