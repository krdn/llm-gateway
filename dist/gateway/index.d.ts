import * as ai from 'ai';
import { z } from 'zod';
import { A as AIProvider } from '../provider-meta-Bo9sv1xo.js';
export { a as AI_PROVIDER_VALUES, b as AccessMethod, P as PROVIDER_REGISTRY, c as ProviderMeta, g as getProvidersByAccess, i as isProxyCli, n as needsJsonMode, d as needsTextFallback } from '../provider-meta-Bo9sv1xo.js';

/** AI SDK 프로바이더별 usage 필드명 차이를 정규화 */
interface NormalizedUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
declare function normalizeUsage(usage: Record<string, unknown> | undefined | null): NormalizedUsage;
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
declare function analyzeText(prompt: string, options?: AIGatewayOptions): Promise<{
    text: string;
    usage: ai.LanguageModelUsage;
    finishReason: ai.FinishReason;
}>;
declare function analyzeStructured<T>(prompt: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, options?: AIGatewayOptions): Promise<{
    object: T;
    usage: ai.LanguageModelUsage;
    finishReason: ai.FinishReason;
}>;

export { type AIGatewayOptions, AIProvider, type NormalizedUsage, analyzeStructured, analyzeText, normalizeUsage };
