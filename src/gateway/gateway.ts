import { generateText } from 'ai';
import type { z } from 'zod';
import type { AIProvider } from './provider-meta';
import { getModel } from './model-factory';
import { selectStrategy } from './select-strategy';
import { executeStrategy } from './strategies';

export { getModel } from './model-factory';
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
  /** API 호출 타임아웃 (ms). 기본값 300,000 (5분) */
  timeoutMs?: number;
  /** 외부에서 전달하는 AbortSignal (타임아웃과 병합됨) */
  abortSignal?: AbortSignal;
}

/**
 * 외부 `AbortSignal`과 타임아웃 타이머를 하나의 signal로 병합한다.
 * 외부 signal이 abort되거나 타임아웃이 만료되면 결과 signal도 abort 된다.
 * 외부 signal이 없으면 단순 `AbortSignal.timeout()` 반환.
 *
 * @param external 호출자가 전달한 abort signal (선택)
 * @param timeoutMs 타임아웃 ms (기본 300,000 = 5분)
 */
function mergeAbortSignals(external?: AbortSignal, timeoutMs?: number): AbortSignal {
  const timeout = timeoutMs ?? 300_000;
  if (!external) return AbortSignal.timeout(timeout);

  // 외부 signal만 있고 타임아웃은 기본 적용
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeout);

  external.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      controller.abort(external.reason);
    },
    { once: true },
  );

  // controller가 abort되면 타이머 정리
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  return controller.signal;
}

/**
 * 자유 텍스트 응답을 생성한다.
 *
 * @param prompt 사용자 프롬프트
 * @param options 프로바이더/모델/타임아웃 등 게이트웨이 옵션
 * @returns `{ text, usage, finishReason }` — usage는 프로바이더 원본 형식이므로
 *          소비자는 `normalizeUsage()`로 정규화하는 것을 권장
 */
export async function analyzeText(prompt: string, options: AIGatewayOptions = {}) {
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
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

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
export async function analyzeStructured<T>(
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  options: AIGatewayOptions = {},
) {
  const provider = options.provider ?? 'anthropic';
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);

  // 전략 선택(순수 데이터) → 전략 실행(SDK). provider별 분기는 전략 seam 뒤에 숨는다.
  return executeStrategy(selectStrategy(provider), model, schema, {
    prompt,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs),
  });
}

// re-export for backwards compatibility (테스트에서 './gateway'로 import)
export { extractJson, repairTruncatedJson } from './json-repair';

