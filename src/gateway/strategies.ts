// 구조화 출력 전략 — SDK 레이어.
// provider capability(supportsStructuredOutput)에 따라 native 구조화 출력 또는
// text2step(generateText 2-call 폴백)을 실행한다.
// 모든 전략은 { object, usage: NormalizedUsage, finishReason } 단일 형태를 반환한다.
import { generateText, Output, type FinishReason, type LanguageModel } from 'ai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { normalizeUsage, type NormalizedUsage } from './normalize-usage';
import { tryParseAndValidate } from './json-repair';
import { needsTextFallback, type AIProvider } from './provider-meta';

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
  finishReason: FinishReason;
}

/** step2 변환기에 전달하는 step1 분석 텍스트 길이 상한 (maxOutputTokens 8192 기준 여유폭) */
const CONVERTER_INPUT_MAX_CHARS = 32_000;

/**
 * provider capability에 따라 구조화 출력을 실행한다.
 *
 * - 네이티브 지원 → `generateText` + `Output.object` (AI SDK v6가 provider별
 *   structured-output 모드를 내부에서 선택)
 * - 미지원 (CLI 프록시, Ollama, custom) → 텍스트 2-call 폴백
 *
 * @param provider capability 판정에 사용할 프로바이더
 * @param model getModel()이 생성한 LanguageModel
 * @param schema 응답을 검증할 Zod 스키마
 * @param opts 호출 파라미터
 */
export async function executeStructured<T>(
  provider: AIProvider,
  model: LanguageModel,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  return needsTextFallback(provider)
    ? executeText2Step(model, schema, opts)
    : executeNative(provider, model, schema, opts);
}

/** 네이티브 구조화 출력 (generateText + Output.object) */
async function executeNative<T>(
  provider: AIProvider,
  model: LanguageModel,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  const result = await generateText({
    model,
    ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
    prompt: opts.prompt,
    output: Output.object({ schema }),
    // Anthropic은 classic tool_use(jsonTool)로 강제한다. 기본 'auto'는 신형
    // output_config.format을 선택하는데, 이 경로는 JSON Schema 부분집합만 허용해
    // number의 minimum/maximum, array의 minItems(>1) 등을 거부한다.
    // classic tool_use는 표준 JSON Schema를 그대로 받으므로 스키마 제약이 보존되고,
    // cli-proxy-api(Claude Max 플랜) 경유 시에도 구조화 출력이 정상 동작한다. (v3.4.0)
    ...(provider === 'anthropic'
      ? { providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' as const } } }
      : {}),
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });
  return {
    object: result.output,
    usage: normalizeUsage(result.usage),
    finishReason: result.finishReason,
  };
}

/**
 * 2-call 텍스트 폴백 (네이티브 구조화 출력 미지원 프로바이더용).
 *
 *   1단계: 원래 프롬프트로 분석 (JSON 출력 요청)
 *   2단계: 1단계 응답이 JSON이 아니면, 텍스트를 JSON으로 변환하는 전용 호출
 *
 * 두 호출의 usage는 NormalizedUsage로 정규화하여 합산한다.
 * 두 단계 모두 실패하면 각 단계의 실패 원인(finishReason + 파싱/검증 사유)을
 * 담은 에러를 던진다.
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

  const step1Result = tryParseAndValidate(step1.text, schema);
  if (step1Result.ok) {
    return {
      object: step1Result.data,
      usage: normalizeUsage(step1.usage),
      finishReason: step1.finishReason,
    };
  }

  // ── 2단계: 텍스트 → JSON 변환 전용 호출 ──
  const converterSystem = `You are a text-to-JSON converter.
Your ONLY job is to convert the given analysis text into a JSON object.
Rules:
- Output ONLY valid JSON. Nothing else.
- First character: {  Last character: }
- No markdown, no explanations, no code blocks.
- Extract information from the text and map it to the schema fields.
- If information is missing, use reasonable defaults ("" for strings, 0 for numbers, [] for arrays).`;

  const analysisText = step1.text.slice(0, CONVERTER_INPUT_MAX_CHARS);
  const converterPrompt = `Convert this analysis into JSON:

"""
${analysisText}
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

  const step2Result = tryParseAndValidate(step2.text, schema);
  if (step2Result.ok) {
    return {
      object: step2Result.data,
      usage: sumUsage(step1.usage, step2.usage),
      finishReason: step2.finishReason,
    };
  }

  const step1Hint = step1.finishReason === 'length' ? ', 토큰 제한 절단' : '';
  throw new Error(
    `[llm-gateway] 구조화 출력 실패 — ` +
      `step1(finishReason=${step1.finishReason}${step1Hint}): ${step1Result.reason} / ` +
      `step2(finishReason=${step2.finishReason}): ${step2Result.reason}\n` +
      `step2 응답 (처음 500자): ${step2.text.slice(0, 500)}`,
  );
}

/** 두 호출의 usage를 각각 정규화한 뒤 합산하여 단일 NormalizedUsage로 반환 */
function sumUsage(u1: unknown, u2: unknown): NormalizedUsage {
  const a = normalizeUsage(u1);
  const b = normalizeUsage(u2);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
