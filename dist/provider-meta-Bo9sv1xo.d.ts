type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'gemini-cli' | 'claude-cli' | 'ollama' | 'deepseek' | 'xai' | 'openrouter' | 'custom';
/** 프로바이더 접근 방식 */
type AccessMethod = 'direct-api' | 'proxy-cli' | 'local';
/** 프로바이더 메타데이터 */
interface ProviderMeta {
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
declare const PROVIDER_REGISTRY: Record<AIProvider, ProviderMeta>;
/** AIProvider 값 배열 (z.enum 등에 사용) */
declare const AI_PROVIDER_VALUES: [AIProvider, ...AIProvider[]];
/** 접근 방식별 프로바이더 목록 */
declare function getProvidersByAccess(method: AccessMethod): ProviderMeta[];
/** Proxy CLI 프로바이더인지 판별 */
declare function isProxyCli(provider: AIProvider): boolean;
/** generateObject 미지원 → generateText + JSON 파싱 폴백 필요 */
declare function needsTextFallback(provider: AIProvider): boolean;
/** json mode 필요 여부 (openrouter) */
declare function needsJsonMode(provider: AIProvider): boolean;

export { type AIProvider as A, PROVIDER_REGISTRY as P, AI_PROVIDER_VALUES as a, type AccessMethod as b, type ProviderMeta as c, needsTextFallback as d, getProvidersByAccess as g, isProxyCli as i, needsJsonMode as n };
