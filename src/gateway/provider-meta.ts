// 프로바이더 메타데이터 중앙 레지스트리
// 접근 방식(API/CLI/Local), 필수 필드, 기능 지원 여부를 한 곳에서 관리
// gateway.ts에서 import하지 않음 — 브라우저 번들에 Node.js 전용 코드가 포함되는 것을 방지
export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'gemini-cli'
  | 'claude-cli'
  | 'ollama'
  | 'deepseek'
  | 'xai'
  | 'openrouter'
  | 'custom';

/** 프로바이더 접근 방식 */
export type AccessMethod = 'direct-api' | 'proxy-cli' | 'local';

/** 프로바이더 메타데이터 */
export interface ProviderMeta {
  type: AIProvider;
  displayName: string;
  accessMethod: AccessMethod;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  defaultBaseUrl?: string;
  /** 구조화 출력(structured output) 네이티브 지원 여부 */
  supportsStructuredOutput: boolean;
  /** json mode 필요 여부 (openrouter) */
  requiresJsonMode: boolean;
  color: string;
}

export const PROVIDER_REGISTRY: Record<AIProvider, ProviderMeta> = {
  // --- 직접 API ---
  anthropic: {
    type: 'anthropic',
    displayName: 'Anthropic (Claude)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: 'bg-orange-500',
  },
  openai: {
    type: 'openai',
    displayName: 'OpenAI (ChatGPT)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: 'bg-green-500',
  },
  gemini: {
    type: 'gemini',
    displayName: 'Google (Gemini)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: 'bg-blue-500',
  },
  deepseek: {
    type: 'deepseek',
    displayName: 'DeepSeek',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: 'bg-purple-500',
  },
  xai: {
    type: 'xai',
    displayName: 'xAI (Grok)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.x.ai/v1',
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: 'bg-red-500',
  },
  openrouter: {
    type: 'openrouter',
    displayName: 'OpenRouter',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    supportsStructuredOutput: true, // generateObject + mode:'json' 사용
    requiresJsonMode: true,
    color: 'bg-cyan-500',
  },

  // --- Proxy CLI ---
  'claude-cli': {
    type: 'claude-cli',
    displayName: 'Claude CLI (Proxy)',
    accessMethod: 'proxy-cli',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8317',
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: 'bg-amber-500',
  },
  'gemini-cli': {
    type: 'gemini-cli',
    displayName: 'Gemini CLI (Proxy)',
    accessMethod: 'proxy-cli',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: 'bg-teal-500',
  },

  // --- 로컬 ---
  ollama: {
    type: 'ollama',
    displayName: 'Ollama (Local)',
    accessMethod: 'local',
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: 'http://localhost:11434',
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: 'bg-gray-500',
  },
  custom: {
    type: 'custom',
    displayName: 'Custom (OpenAI Compatible)',
    accessMethod: 'local',
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: 'bg-zinc-500',
  },
};

/** AIProvider 값 배열 (z.enum 등에 사용) */
export const AI_PROVIDER_VALUES = Object.keys(PROVIDER_REGISTRY) as [AIProvider, ...AIProvider[]];

/** 접근 방식별 프로바이더 목록 */
export function getProvidersByAccess(method: AccessMethod): ProviderMeta[] {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.accessMethod === method);
}

/** Proxy CLI 프로바이더인지 판별 */
export function isProxyCli(provider: AIProvider): boolean {
  return PROVIDER_REGISTRY[provider]?.accessMethod === 'proxy-cli';
}

/** generateObject 미지원 → generateText + JSON 파싱 폴백 필요 */
export function needsTextFallback(provider: AIProvider): boolean {
  return !PROVIDER_REGISTRY[provider]?.supportsStructuredOutput;
}

/** json mode 필요 여부 (openrouter) */
export function needsJsonMode(provider: AIProvider): boolean {
  return PROVIDER_REGISTRY[provider]?.requiresJsonMode ?? false;
}
