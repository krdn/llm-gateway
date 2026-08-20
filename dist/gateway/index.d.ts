import { FinishReason, LanguageModelUsage, FlexibleSchema } from 'ai';
import { N as NormalizedUsage } from '../normalize-usage-sTTPLOZv.js';
export { n as normalizeUsage } from '../normalize-usage-sTTPLOZv.js';
import { A as AIProvider } from '../provider-meta-BkGweTb-.js';
export { a as AI_PROVIDER_VALUES, b as AccessMethod, C as CallMethod, P as PROVIDER_REGISTRY, c as ProviderMeta, g as getProvidersByAccess, i as isProxyCli, n as needsTextFallback } from '../provider-meta-BkGweTb-.js';

interface StrategyResult<T> {
    object: T;
    usage: NormalizedUsage;
    finishReason: FinishReason;
}
/**
 * 구조화 출력이 실패했지만 토큰은 이미 과금된 경우에 던지는 에러.
 *
 * 두 경로에서 나온다 — text2step 이중 실패, 그리고 native 경로에서 프로바이더가
 * 완결된 출력을 내지 않은 경우(토큰 절단 등). 어느 쪽이든 호출은 HTTP 레벨로
 * 성공해 토큰이 실제 과금된 상태이므로, 소비한 usage를 에러에 실어 실패한
 * 분석도 비용 집계(checkCostLimit/onPersist)에 포함될 수 있게 한다.
 * runModule이 이를 감지해 failed 결과에 usage를 싣는다.
 */
declare class StructuredOutputError extends Error {
    readonly usage: NormalizedUsage;
    constructor(message: string, usage: NormalizedUsage, options?: {
        cause?: unknown;
    });
}

interface AIGatewayOptions {
    provider?: AIProvider;
    model?: string;
    maxOutputTokens?: number;
    systemPrompt?: string;
    baseUrl?: string;
    apiKey?: string;
    /**
     * API 호출 타임아웃 (ms). 기본값 300,000 (5분).
     * 0·음수·비유한값(Infinity/NaN)은 기본값으로 대체된다 — 타임아웃 비활성화는
     * 지원하지 않는다 (runner/config 경로의 falsy 필터와 동일한 의미론).
     */
    timeoutMs?: number;
    /** 외부에서 전달하는 AbortSignal (타임아웃과 병합됨) */
    abortSignal?: AbortSignal;
}
/** analyzeText 결과 — usage는 프로바이더 원본 필드 + 정규화 필드 병합 */
interface AnalyzeTextResult {
    text: string;
    usage: LanguageModelUsage & NormalizedUsage;
    finishReason: FinishReason;
}
/**
 * 자유 텍스트 응답을 생성한다.
 *
 * @param prompt 사용자 프롬프트
 * @param options 프로바이더/모델/타임아웃 등 게이트웨이 옵션
 * @returns `{ text, usage, finishReason }` — usage는 프로바이더 원본 필드에
 *          정규화 필드(`inputTokens`/`outputTokens`/`totalTokens`)를 보장해 병합한
 *          형태로, `analyzeStructured`와 동일하게 세 필드를 항상 숫자로 제공한다.
 */
declare function analyzeText(prompt: string, options?: AIGatewayOptions): Promise<AnalyzeTextResult>;
/**
 * Zod 스키마로 검증된 구조화 객체를 반환한다.
 *
 * 네이티브 구조화 출력을 지원하지 않는 프로바이더
 * (deepseek, claude-cli, gemini-cli, ollama, custom 등)는 자동으로
 * `generateText` + JSON 추출 + Zod 파싱 폴백 경로를 사용한다.
 *
 * 파싱/검증 실패 시 즉시 에러를 전파하며 재시도하지 않는다
 * (`runModule`의 `retryWithPolicy`도 rate limit/서버 과부하만 재시도한다).
 *
 * @template T 스키마가 검증하는 결과 타입
 * @param prompt 사용자 프롬프트
 * @param schema 응답을 검증할 스키마 (zod v3·v4 모두 지원)
 * @param options 게이트웨이 옵션
 * @returns `{ object, usage, finishReason }` — usage는 전략(native/text2step)에
 *          무관하게 항상 정규화된 `NormalizedUsage` 형태다.
 */
declare function analyzeStructured<T>(prompt: string, schema: FlexibleSchema<T>, options?: AIGatewayOptions): Promise<StrategyResult<T>>;

export { type AIGatewayOptions, AIProvider, type AnalyzeTextResult, NormalizedUsage, StructuredOutputError, analyzeStructured, analyzeText };
