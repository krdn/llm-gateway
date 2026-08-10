import { generateText, type FinishReason, type FlexibleSchema, type LanguageModelUsage } from 'ai';
import type { AIProvider } from './provider-meta';
import { getModel } from './model-factory';
import { executeStructured } from './strategies';
import { normalizeUsage, type NormalizedUsage } from './normalize-usage';

export type { AIProvider };

// usage 정규화는 별도 모듈로 분리 (strategies.ts와 공유, 순환 의존 방지)
export { normalizeUsage, type NormalizedUsage } from './normalize-usage';

export interface AIGatewayOptions {
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

/**
 * 외부 `AbortSignal`과 타임아웃을 하나의 signal로 병합한다.
 * 이미 abort된 외부 signal은 즉시 반영되며, 타임아웃 타이머는
 * Node가 unref하므로 이벤트 루프를 붙잡지 않는다.
 */
function mergeAbortSignals(external?: AbortSignal, timeoutMs?: number): AbortSignal {
  // 0(즉시 abort)·음수/Infinity(AbortSignal.timeout이 RangeError) 방어 —
  // 유효하지 않은 값은 기본 5분으로 대체해 직접 호출 경로와
  // runner/config 경로(falsy → 기본값)의 의미를 일치시킨다.
  const ms =
    timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300_000;
  const timeoutSignal = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeoutSignal]) : timeoutSignal;
}

/** analyzeText 결과 — usage는 프로바이더 원본 필드 + 정규화 필드 병합 */
export interface AnalyzeTextResult {
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
export async function analyzeText(
  prompt: string,
  options: AIGatewayOptions = {},
): Promise<AnalyzeTextResult> {
  const provider = options.provider ?? 'anthropic';
  const result = await generateText({
    model: await getModel(provider, options.model, options.baseUrl, options.apiKey),
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    prompt,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs),
  });
  return {
    text: result.text,
    usage: { ...result.usage, ...normalizeUsage(result.usage) },
    finishReason: result.finishReason,
  };
}

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
 * @template T 스키마가 검증하는 결과 타입
 * @param prompt 사용자 프롬프트
 * @param schema 응답을 검증할 스키마 (zod v3·v4 모두 지원)
 * @param options 게이트웨이 옵션
 * @returns `{ object, usage, finishReason }` — usage는 전략(native/text2step)에
 *          무관하게 항상 정규화된 `NormalizedUsage` 형태다.
 */
export async function analyzeStructured<T>(
  prompt: string,
  schema: FlexibleSchema<T>,
  options: AIGatewayOptions = {},
) {
  const provider = options.provider ?? 'anthropic';
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);

  // provider별 분기는 전략 seam 뒤에 숨는다 (strategies.executeStructured)
  return executeStructured(provider, model, schema, {
    prompt,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs),
  });
}
