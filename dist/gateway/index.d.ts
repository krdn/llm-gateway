import { FinishReason, LanguageModelUsage } from 'ai';
import { N as NormalizedUsage } from '../normalize-usage-DYEF9hAT.js';
export { n as normalizeUsage } from '../normalize-usage-DYEF9hAT.js';
import { z } from 'zod';
import { A as AIProvider } from '../provider-meta-DzMZPC6j.js';
export { a as AI_PROVIDER_VALUES, b as AccessMethod, C as CallMethod, P as PROVIDER_REGISTRY, c as ProviderMeta, g as getProvidersByAccess, i as isProxyCli, n as needsTextFallback } from '../provider-meta-DzMZPC6j.js';

interface StrategyResult<T> {
    object: T;
    usage: NormalizedUsage;
    finishReason: FinishReason;
}

interface AIGatewayOptions {
    provider?: AIProvider;
    model?: string;
    maxOutputTokens?: number;
    systemPrompt?: string;
    baseUrl?: string;
    apiKey?: string;
    /** API 호출 타임아웃 (ms). 기본값 300,000 (5분) */
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
 * (claude-cli, gemini-cli, ollama, custom 등)는 자동으로
 * `generateText` + JSON 추출 + Zod 파싱 폴백 경로를 사용한다.
 *
 * 파싱/검증 실패 시 즉시 에러를 전파하며 재시도하지 않는다
 * (`runModule`의 `retryWithPolicy`도 rate limit/서버 과부하만 재시도한다).
 *
 * @template T Zod 스키마가 검증하는 결과 타입
 * @param prompt 사용자 프롬프트
 * @param schema 응답을 검증할 Zod 스키마
 * @param options 게이트웨이 옵션
 * @returns `{ object, usage, finishReason }` — usage는 전략(native/text2step)에
 *          무관하게 항상 정규화된 `NormalizedUsage` 형태다.
 */
declare function analyzeStructured<T>(prompt: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, options?: AIGatewayOptions): Promise<StrategyResult<T>>;

export { type AIGatewayOptions, AIProvider, type AnalyzeTextResult, NormalizedUsage, analyzeStructured, analyzeText };
