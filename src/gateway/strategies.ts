// 구조화 출력 전략 — SDK 레이어.
// provider capability(supportsStructuredOutput)에 따라 native 구조화 출력 또는
// text2step(generateText 2-call 폴백)을 실행한다.
// 모든 전략은 { object, usage: NormalizedUsage, finishReason } 단일 형태를 반환한다.
import {
  asSchema,
  generateText,
  Output,
  type FinishReason,
  type FlexibleSchema,
  type LanguageModel,
} from 'ai';
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
 * 구조화 출력이 실패했지만 토큰은 이미 과금된 경우에 던지는 에러.
 *
 * 두 경로에서 나온다 — text2step 이중 실패, 그리고 native 경로에서 프로바이더가
 * 완결된 출력을 내지 않은 경우(토큰 절단 등). 어느 쪽이든 호출은 HTTP 레벨로
 * 성공해 토큰이 실제 과금된 상태이므로, 소비한 usage를 에러에 실어 실패한
 * 분석도 비용 집계(checkCostLimit/onPersist)에 포함될 수 있게 한다.
 * runModule이 이를 감지해 failed 결과에 usage를 싣는다.
 */
export class StructuredOutputError extends Error {
  readonly usage: NormalizedUsage;

  constructor(message: string, usage: NormalizedUsage, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StructuredOutputError';
    this.usage = usage;
  }
}

/**
 * provider capability에 따라 구조화 출력을 실행한다.
 *
 * - 네이티브 지원 → `generateText` + `Output.object` (AI SDK v7이 provider별
 *   structured-output 모드를 내부에서 선택)
 * - 미지원 (DeepSeek, CLI 프록시, Ollama, custom) → 텍스트 2-call 폴백
 *
 * @param provider capability 판정에 사용할 프로바이더
 * @param model getModel()이 생성한 LanguageModel
 * @param schema 응답을 검증할 Zod 스키마
 * @param opts 호출 파라미터
 */
export async function executeStructured<T>(
  provider: AIProvider,
  model: LanguageModel,
  schema: FlexibleSchema<T>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  // 검증기 없는 스키마는 프로바이더 호출 **전에** 막는다. `FlexibleSchema`는
  // `jsonSchema()`로 만든 검증기 없는 `Schema`도 받는데, 그대로 두면
  // native 경로는 `Output.object`가 검증을 건너뛰어 스키마에 맞지 않는 출력을
  // 그대로 통과시키고(검증된 출력이라는 계약 위반), 폴백 경로는 두 번의 유료
  // 호출을 태운 뒤에야 실패한다. getModel이 레지스트리 불변식을 지키는 것과
  // 같은 이유로, 여기가 단일 깔때기다.
  if (!asSchema(schema).validate) {
    throw new Error(
      '[llm-gateway] 스키마에 validate가 없어 응답을 검증할 수 없다 — ' +
        'zod 스키마를 넘기거나 `jsonSchema(schema, { validate })`로 검증기를 지정할 것.',
    );
  }

  return needsTextFallback(provider)
    ? executeText2Step(model, schema, opts)
    : executeNative(provider, model, schema, opts);
}

/** 네이티브 구조화 출력 (generateText + Output.object) */
async function executeNative<T>(
  provider: AIProvider,
  model: LanguageModel,
  schema: FlexibleSchema<T>,
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

  // SDK는 finishReason이 'stop'일 때만 output을 resolve한다. 그 외 모든 값
  // (length·tool-calls·content-filter·error·other — 실측으로 전부 확인)에서
  // `result.output` 접근은 NoOutputGeneratedError를 던지는데, 그 에러는 usage를
  // 싣지 않아 **이미 과금된 토큰이 집계에서 사라진다** (runModule의 실패-usage
  // 보존은 StructuredOutputError·NoObjectGeneratedError만 인식한다). 폴백 경로가
  // 이중 실패를 StructuredOutputError로 감싸는 것과 같은 이유로, native 경로도
  // 사유와 usage를 실어 던진다.
  //
  // 선검사(`finishReason !== 'stop'`)가 아니라 접근을 try로 감싸는 이유: 동작은
  // 같지만(위 실측), SDK가 나중에 resolve 조건을 넓히면 이쪽만 자동으로 따라간다.
  // 원본 에러는 cause로 남긴다 — 여기서 걸리는 것이 NoOutputGeneratedError가
  // 아닐 가능성(그 자체가 계약 변화의 신호다)을 뭉개지 않기 위해서다.
  let object: T;
  try {
    object = result.output;
  } catch (cause) {
    const hint =
      result.finishReason === 'length'
        ? ' — 토큰 제한 절단, maxOutputTokens를 늘릴 것'
        : '';
    throw new StructuredOutputError(
      `[llm-gateway] 구조화 출력 실패 — 프로바이더가 완결된 출력을 내지 않았다 ` +
        `(finishReason=${result.finishReason})${hint}`,
      normalizeUsage(result.usage),
      { cause },
    );
  }

  return {
    object,
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
  schema: FlexibleSchema<T>,
  opts: StrategyExecuteOptions,
): Promise<StrategyResult<T>> {
  const schemaBlock = await buildSchemaBlock(schema);

  // ── 1단계: 분석 수행 (JSON 출력 시도) ──
  const systemWithJsonHint = (opts.systemPrompt ?? '') + `

IMPORTANT: Respond in valid JSON format only. Start with { and end with }.`;

  // 힌트가 있을 때의 프롬프트는 기존과 바이트 단위로 동일하다. 없을 때만 섹션을 통째로 뺀다.
  const promptWithSchema =
    `${opts.prompt}

---
` +
    (schemaBlock
      ? `Respond as a JSON object matching this schema:
${schemaBlock}

`
      : '') +
    `Output JSON only. Start with {.`;

  const step1 = await generateText({
    model,
    system: systemWithJsonHint,
    prompt: promptWithSchema,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  const step1Result = await tryParseAndValidate(step1.text, schema);
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
  const converterPrompt =
    `Convert this analysis into JSON:

"""
${analysisText}
"""

` +
    (schemaBlock
      ? `Target JSON schema:
${schemaBlock}

`
      : '') +
    `Output the JSON object now:`;

  const step2 = await generateText({
    model,
    system: converterSystem,
    prompt: converterPrompt,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  const step2Result = await tryParseAndValidate(step2.text, schema);
  if (step2Result.ok) {
    return {
      object: step2Result.data,
      usage: sumUsage(step1.usage, step2.usage),
      finishReason: step2.finishReason,
    };
  }

  const step1Hint = step1.finishReason === 'length' ? ', 토큰 제한 절단' : '';
  // 스키마 힌트 없이 돈 실행은 성공률이 크게 떨어진다. 원인 추적이 가능하도록 남긴다.
  const schemaHint = schemaBlock ? '' : ' (스키마 힌트 없이 실행됨 — JSON Schema 변환 실패)';
  throw new StructuredOutputError(
    `[llm-gateway] 구조화 출력 실패${schemaHint} — ` +
      `step1(finishReason=${step1.finishReason}${step1Hint}): ${step1Result.reason} / ` +
      `step2(finishReason=${step2.finishReason}): ${step2Result.reason}\n` +
      `step2 응답 (처음 500자): ${step2.text.slice(0, 500)}`,
    sumUsage(step1.usage, step2.usage),
  );
}

/**
 * zod v3 스키마 판별. v3 인스턴스는 `_def`를 갖고 v4의 내부 마커 `_zod`가 없다.
 * (v4 인스턴스는 `_def`와 `_zod`를 모두 갖는다.)
 */
function isZodV3Schema(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && '_def' in schema && !('_zod' in schema);
}

/**
 * 폴백 프롬프트에 실을 JSON Schema 블록을 만든다. 실패하면 빈 문자열.
 *
 * zod v3만 기존 `zodToJsonSchema(target:'openApi3')` 출력을 유지한다 — 이 문자열은
 * 그대로 프롬프트에 들어가므로 경로를 바꾸면 기존 소비자의 폴백 동작이 (라이브
 * 프로바이더 없이는 검증할 수 없는 채로) 변한다.
 *
 * 그 외(zod v4, AI SDK `Schema`, StandardSchema)는 `asSchema().jsonSchema`를 쓴다.
 * zod-to-json-schema 3.25.x는 v4 스키마를 받으면 **예외 없이 `{}`를 반환**하므로
 * try/catch로는 이 실패를 잡을 수 없다 — 분기가 필요한 이유가 이것이다.
 */
async function buildSchemaBlock(schema: FlexibleSchema<unknown>): Promise<string> {
  try {
    const jsonSchema = isZodV3Schema(schema)
      ? // 런타임에 zod v3임을 확인한 뒤의 캐스팅. zod-to-json-schema의 파라미터 타입은
        // 자신이 해석한 zod에 묶여 있어 zod v4 설치 환경에서 구조적으로 맞지 않는다.
        zodToJsonSchema(schema as unknown as Parameters<typeof zodToJsonSchema>[0], {
          target: 'openApi3',
        })
      : await asSchema(schema).jsonSchema;

    // 빈 객체는 힌트가 없는 것보다 나쁘다 — 모델에게 "필드 없는 객체"를 지시하는 꼴이다.
    const keys = Object.keys(jsonSchema ?? {}).filter((k) => k !== '$schema');
    if (keys.length === 0) return '';

    return JSON.stringify(jsonSchema, null, 2);
  } catch {
    /* 변환 실패 시 스키마 힌트 없이 진행 */
    return '';
  }
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
