type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'gemini-cli' | 'claude-cli' | 'ollama' | 'deepseek' | 'xai' | 'openrouter' | 'custom';
/** 프로바이더 접근 방식 */
type AccessMethod = 'direct-api' | 'proxy-cli' | 'local';
/** SDK 클라이언트 호출 방식 */
type CallMethod = 'direct' | 'chat';
/** 프로바이더 메타데이터 */
interface ProviderMeta {
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
     * API 키 미전달 시 기본값 — 키를 검사하지 않는 로컬/프록시 서버 전용
     * (ollama → 'ollama', claude-cli → 'cli-proxy'). requiresApiKey: true인
     * 프로바이더에는 두지 않는다 (가짜 키를 유료 API에 보내는 사고 방지).
     */
    readonly defaultApiKey?: string;
    readonly color: string;
}
declare const PROVIDER_REGISTRY: Readonly<Record<AIProvider, ProviderMeta>>;
/** AIProvider 값 배열 (z.enum 등에 사용) */
declare const AI_PROVIDER_VALUES: [AIProvider, ...AIProvider[]];
/** 접근 방식별 프로바이더 목록 */
declare function getProvidersByAccess(method: AccessMethod): ProviderMeta[];
/** Proxy CLI 프로바이더인지 판별 */
declare function isProxyCli(provider: AIProvider): boolean;
/** generateObject 미지원 → generateText + JSON 파싱 폴백 필요 */
declare function needsTextFallback(provider: AIProvider): boolean;

export { type AIProvider as A, type CallMethod as C, PROVIDER_REGISTRY as P, AI_PROVIDER_VALUES as a, type AccessMethod as b, type ProviderMeta as c, getProvidersByAccess as g, isProxyCli as i, needsTextFallback as n };
