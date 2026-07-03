// 구조화 출력 전략 실행기 (executor) — SDK 레이어.
// selectStrategy()가 고른 identifier를 받아 실제 SDK 호출을 수행한다.
// 모든 전략은 { object, usage: NormalizedUsage, finishReason } 단일 형태를 반환한다.
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { normalizeUsage, type NormalizedUsage } from './normalize-usage';
import { tryParseAndValidate } from './json-repair';
import type { StructuredStrategy } from './select-strategy';

/** 전략 실행에 필요한 공통 옵션 (provider/model 결정 이후의 호출 파라미터) */
export interface StrategyExecuteOptions {
  prompt: string;
  systemPrompt?: string;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
}

export interface StrategyResult<T> {
  object: T;
  usage: NormalizedUsage;
  finishReason: string;
}

/**
 * 선택된 전략을 실행한다.
 *
 * @param strategy selectStrategy()가 유도한 전략 identifier
 * @param model getModel()이 생성한 LanguageModel
 * @param schema 응답을 검증할 Zod 스키마
 * @param opts 호출 파라미터
 */
export async function executeStrategy<T>(
  strategy: StructuredStrategy,
  model: LanguageModel,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  switch (strategy) {
    case 'native':
      return executeNative(model, schema, opts);
    case 'text2step':
      return executeText2Step(model, schema, opts);
  }
}

/**
 * 네이티브 구조화 출력 (generateObject).
 * AI SDK v6는 provider별 structured-output 모드를 내부에서 선택하므로
 * 호출자는 mode 플래그를 지정하지 않는다.
 */
async function executeNative<T>(
  model: LanguageModel,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  const result = await generateObject({
    model,
    ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
    prompt: opts.prompt,
    schema,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });
  return {
    object: result.object,
    usage: normalizeUsage(result.usage as Record<string, unknown>),
    finishReason: result.finishReason,
  };
}

/**
 * 2-call 텍스트 폴백 (generateObject 미지원 프로바이더용).
 *
 *   1단계: 원래 프롬프트로 분석 (JSON 출력 요청)
 *   2단계: 1단계 응답이 JSON이 아니면, 텍스트를 JSON으로 변환하는 전용 호출
 *
 * 두 호출의 usage는 NormalizedUsage로 정규화하여 합산한다.
 */
async function executeText2Step<T>(
  model: LanguageModel,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  let schemaBlock = '';
  try {
    const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });
    schemaBlock = JSON.stringify(jsonSchema, null, 2);
  } catch {
    /* 변환 실패 시 스키마 힌트 없이 진행 */
  }

  // ── 1단계: 분석 수행 (JSON 출력 시도) ──
  const systemWithJsonHint = (opts.systemPrompt ?? '') + `

IMPORTANT: Respond in valid JSON format only. Start with { and end with }.`;

  const promptWithSchema = `${opts.prompt}

---
Respond as a JSON object matching this schema:
${schemaBlock}

Output JSON only. Start with {.`;

  const step1 = await generateText({
    model,
    system: systemWithJsonHint,
    prompt: promptWithSchema,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  console.log(
    `[llm-gateway] text2step [step 1]: 응답 수신 (finishReason=${step1.finishReason}, 텍스트 길이=${step1.text.length})`,
  );

  if (step1.finishReason === 'length') {
    console.warn(
      `[llm-gateway] 응답이 토큰 제한으로 잘림 (finishReason=length) — JSON 복구 시도`,
    );
  }

  const step1Result = tryParseAndValidate(step1.text, schema);
  if (step1Result) {
    return {
      object: step1Result,
      usage: normalizeUsage(step1.usage as Record<string, unknown>),
      finishReason: step1.finishReason,
    };
  }

  // ── 2단계: 텍스트 → JSON 변환 전용 호출 ──
  console.log(`[llm-gateway] 1단계 JSON 파싱 실패 → 2단계 변환 호출`);

  const converterSystem = `You are a text-to-JSON converter.
Your ONLY job is to convert the given analysis text into a JSON object.
Rules:
- Output ONLY valid JSON. Nothing else.
- First character: {  Last character: }
- No markdown, no explanations, no code blocks.
- Extract information from the text and map it to the schema fields.
- If information is missing, use reasonable defaults ("" for strings, 0 for numbers, [] for arrays).`;

  const analysisSnippet = step1.text.substring(0, 2000);
  const converterPrompt = `Convert this analysis into JSON:

"""
${analysisSnippet}
"""

Target JSON schema:
${schemaBlock}

Output the JSON object now:`;

  const step2 = await generateText({
    model,
    system: converterSystem,
    prompt: converterPrompt,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  console.log(
    `[llm-gateway] text2step [step 2]: 응답 수신 (finishReason=${step2.finishReason}, 텍스트 길이=${step2.text.length})`,
  );

  const step2Result = tryParseAndValidate(step2.text, schema);
  if (step2Result) {
    console.log(`[llm-gateway] 2단계 변환 성공`);
    return {
      object: step2Result,
      usage: sumUsage(step1.usage, step2.usage),
      finishReason: step2.finishReason,
    };
  }

  console.error(
    `[llm-gateway] 2단계 변환도 실패 — 원본 (처음 500자): ${step2.text.substring(0, 500)}`,
  );
  throw new Error(
    `JSON 파싱 실패: 2단계 변환 후에도 유효한 JSON을 생성하지 못함\n응답 텍스트 (처음 500자): ${step2.text.substring(0, 500)}`,
  );
}

/** 두 호출의 usage를 각각 정규화한 뒤 합산하여 단일 NormalizedUsage로 반환 */
function sumUsage(u1: unknown, u2: unknown): NormalizedUsage {
  const a = normalizeUsage(u1 as Record<string, unknown>);
  const b = normalizeUsage(u2 as Record<string, unknown>);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
