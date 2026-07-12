// 프로바이더 메타데이터 중앙 레지스트리
// 접근 방식(API/CLI/Local), 필수 필드, 기능 지원 여부를 한 곳에서 관리
// SDK를 import하지 않음 — 브라우저 번들에 Node.js 전용 코드가 포함되는 것을 방지
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

/** SDK 클라이언트 호출 방식 */
export type CallMethod = 'direct' | 'chat';

/** 프로바이더 메타데이터 */
export interface ProviderMeta {
  readonly type: AIProvider;
  readonly displayName: string;
  readonly accessMethod: AccessMethod;
  readonly requiresApiKey: boolean;
  readonly requiresBaseUrl: boolean;
  readonly defaultBaseUrl?: string;
  /** 구조화 출력(structured output) 네이티브 지원 여부 */
  readonly supportsStructuredOutput: boolean;
  /** SDK 클라이언트 호출 방식: 'direct' = client(model), 'chat' = client.chat(model) */
  readonly callMethod: CallMethod;
  /**
   * API 키 미전달 시 기본값 — 키를 검사하지 않는 로컬 서버 전용
   * (ollama/custom → 'ollama'). requiresApiKey: true인 프로바이더에는
   * 두지 않는다 (가짜 키를 유료 API에 보내는 사고 방지).
   * 주의: cli-proxy-api는 config.yaml의 api-keys로 Bearer 토큰을 항상
   * 검증하므로 claude-cli는 defaultApiKey 대상이 아니다 (apiKey 필수).
   */
  readonly defaultApiKey?: string;
  readonly color: string;
}

export const PROVIDER_REGISTRY: Readonly<Record<AIProvider, ProviderMeta>> = {
  // --- 직접 API ---
  anthropic: {
    type: 'anthropic',
    displayName: 'Anthropic (Claude)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: 'direct',
    color: 'bg-orange-500',
  },
  openai: {
    type: 'openai',
    displayName: 'OpenAI (ChatGPT)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: 'direct',
    color: 'bg-green-500',
  },
  gemini: {
    type: 'gemini',
    displayName: 'Google (Gemini)',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: 'direct',
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
    callMethod: 'chat',
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
    callMethod: 'chat',
    color: 'bg-red-500',
  },
  openrouter: {
    type: 'openrouter',
    displayName: 'OpenRouter',
    accessMethod: 'direct-api',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    supportsStructuredOutput: true,
    callMethod: 'chat',
    color: 'bg-cyan-500',
  },

  // --- Proxy CLI ---
  'claude-cli': {
    type: 'claude-cli',
    displayName: 'Claude CLI (Proxy)',
    accessMethod: 'proxy-cli',
    // cli-proxy-api는 config.yaml의 api-keys로 Bearer 토큰을 항상 검증한다.
    // 프록시 config에 등록된 키를 options.apiKey로 전달해야 한다 (미전달 시 명시 에러).
    requiresApiKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8317',
    supportsStructuredOutput: false,
    callMethod: 'chat',
    color: 'bg-amber-500',
  },
  // ai-sdk-provider-gemini-cli 경유 — 로컬 ~/.gemini OAuth를 직접 사용한다.
  // baseUrl/apiKey는 무시되며 cli-proxy-api와 무관한 별도 크레덴셜/쿼터 경로.
  'gemini-cli': {
    type: 'gemini-cli',
    displayName: 'Gemini CLI (Local OAuth)',
    accessMethod: 'local',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    callMethod: 'direct',
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
    callMethod: 'chat',
    defaultApiKey: 'ollama',
    color: 'bg-gray-500',
  },
  custom: {
    type: 'custom',
    displayName: 'Custom (OpenAI Compatible)',
    accessMethod: 'local',
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    callMethod: 'chat',
    defaultApiKey: 'ollama',
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
  return PROVIDER_REGISTRY[provider].accessMethod === 'proxy-cli';
}

/** generateObject 미지원 → generateText + JSON 파싱 폴백 필요 */
export function needsTextFallback(provider: AIProvider): boolean {
  return !PROVIDER_REGISTRY[provider].supportsStructuredOutput;
}
