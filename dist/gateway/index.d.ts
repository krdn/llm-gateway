import { N as NormalizedUsage } from '../normalize-usage-fi30gwXT.js';
export { n as normalizeUsage } from '../normalize-usage-fi30gwXT.js';
import * as ai from 'ai';
import { z } from 'zod';
import { A as AIProvider } from '../provider-meta-BGU1PhSI.js';
export { a as AI_PROVIDER_VALUES, b as AccessMethod, C as CallMethod, P as PROVIDER_REGISTRY, c as ProviderMeta, g as getProvidersByAccess, i as isProxyCli, n as needsJsonMode, d as needsTextFallback } from '../provider-meta-BGU1PhSI.js';

interface StrategyResult<T> {
    object: T;
    usage: NormalizedUsage;
    finishReason: string;
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
/**
 * 자유 텍스트 응답을 생성한다.
 *
 * @param prompt 사용자 프롬프트
 * @param options 프로바이더/모델/타임아웃 등 게이트웨이 옵션
 * @returns `{ text, usage, finishReason }` — usage는 프로바이더 원본 형식이므로
 *          소비자는 `normalizeUsage()`로 정규화하는 것을 권장
 */
declare function analyzeText(prompt: string, options?: AIGatewayOptions): Promise<{
    text: string;
    usage: ai.LanguageModelUsage;
    finishReason: ai.FinishReason;
}>;
/**
 * Zod 스키마로 검증된 구조화 객체를 반환한다.
 *
 * 네이티브 구조화 출력(`generateObject`)을 지원하지 않는 프로바이더
 * (claude-cli, gemini-cli, ollama, custom 등)는 자동으로
 * `generateText` + JSON 추출 + Zod 파싱 폴백 경로를 사용한다.
 *
 * 파싱/검증 실패 시 즉시 에러를 전파한다 (재시도/재호출 없음 — 비용 낭비 방지).
 * 재시도가 필요하면 호출자(`runModule`)에서 처리한다.
 *
 * @template T Zod 스키마가 검증하는 결과 타입
 * @param prompt 사용자 프롬프트
 * @param schema 응답을 검증할 Zod 스키마
 * @param options 게이트웨이 옵션
 * @returns `{ object, usage, finishReason }` — usage는 전략(native/text2step)에
 *          무관하게 항상 정규화된 `NormalizedUsage`({ inputTokens, outputTokens,
 *          totalTokens }) 형태다. (자유 텍스트용 `analyzeText`는 프로바이더 원본
 *          usage를 반환하므로 소비자가 `normalizeUsage()`를 호출해야 하는 점과 다름.)
 */
declare function analyzeStructured<T>(prompt: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, options?: AIGatewayOptions): Promise<StrategyResult<T>>;

export { type AIGatewayOptions, AIProvider, NormalizedUsage, analyzeStructured, analyzeText };
