import { generateText, generateObject, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
// gemini-cli: 네이티브/WASM 의존성이 많아 동적 import (워커에서만 사용, 웹 빌드 제외)
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  PROVIDER_REGISTRY,
  needsTextFallback as checkNeedsTextFallback,
  needsJsonMode as checkNeedsJsonMode,
  type AIProvider,
} from './provider-meta';

export type { AIProvider };

/** AI SDK 프로바이더별 usage 필드명 차이를 정규화 */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function normalizeUsage(usage: Record<string, unknown> | undefined | null): NormalizedUsage {
  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const inputTokens =
    (typeof usage.promptTokens === 'number' ? usage.promptTokens : 0) ||
    (typeof usage.inputTokens === 'number' ? usage.inputTokens : 0);
  const outputTokens =
    (typeof usage.completionTokens === 'number' ? usage.completionTokens : 0) ||
    (typeof usage.outputTokens === 'number' ? usage.outputTokens : 0);
  const totalTokens =
    typeof usage.totalTokens === 'number' ? usage.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

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

const DEFAULT_MODELS: Partial<Record<AIProvider, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1-nano',
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
};

type SdkFactory = (opts: { apiKey?: string; baseURL?: string }) => unknown;

/** 네이티브 SDK가 있는 프로바이더만 매핑. 나머지는 createOpenAI 폴백. */
const SDK_MAP: Partial<Record<AIProvider, SdkFactory>> = {
  anthropic: (opts) => createAnthropic(opts),
  gemini: (opts) => createGoogleGenerativeAI(opts),
  openai: (opts) => createOpenAI(opts),
};

/** chat 방식 프로바이더의 baseUrl에 /v1 suffix를 보장한다. */
function resolveBaseUrlForChat(provider: AIProvider, baseUrl?: string): string {
  if (baseUrl) {
    const cleaned = baseUrl.replace(/\/+$/, '');
    return cleaned.endsWith('/v1') ? cleaned : `${cleaned}/v1`;
  }
  const defaultUrl = PROVIDER_REGISTRY[provider].defaultBaseUrl ?? 'http://localhost:11434';
  return defaultUrl.endsWith('/v1') ? defaultUrl : `${defaultUrl}/v1`;
}

export async function getModel(
  provider: AIProvider,
  model?: string,
  baseUrl?: string,
  apiKey?: string,
) {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? 'gpt-4.1-nano';
  console.log(
    `[llm-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? 'none'}, hasApiKey=${!!apiKey}`,
  );

  // gemini-cli: 동적 import (OAuth 인증, API 키 불필요)
  if (provider === 'gemini-cli') {
    const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
    return createGeminiProvider({ authType: 'oauth-personal' })(modelName) as LanguageModel;
  }

  const meta = PROVIDER_REGISTRY[provider];
  const sdkFactory: SdkFactory = SDK_MAP[provider] ?? ((opts) => createOpenAI(opts));

  const sdkOpts: { apiKey?: string; baseURL?: string } = {};

  if (meta.callMethod === 'chat') {
    sdkOpts.baseURL = resolveBaseUrlForChat(provider, baseUrl);
    sdkOpts.apiKey = apiKey || meta.defaultApiKey;
  } else {
    if (apiKey) sdkOpts.apiKey = apiKey;
    if (baseUrl) sdkOpts.baseURL = baseUrl;
  }

  const client = sdkFactory(sdkOpts) as ReturnType<typeof createOpenAI>;

  return (meta.callMethod === 'chat'
    ? client.chat(modelName)
    : (client as unknown as (m: string) => LanguageModel)(modelName)) as LanguageModel;
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
 * @returns `{ object, usage, finishReason }`
 */
export async function analyzeStructured<T>(
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  options: AIGatewayOptions = {},
) {
  const provider = options.provider ?? 'anthropic';
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);
  const abortSignal = mergeAbortSignals(options.abortSignal, options.timeoutMs);

  // 구조화 출력 미지원 프로바이더(CLI 프록시/Custom/Ollama 등)는
  // generateText + 프롬프트 기반 JSON 추출 + Zod 파싱으로 처리
  if (checkNeedsTextFallback(provider)) {
    return analyzeStructuredViaText(prompt, schema, model, options, abortSignal);
  }

  // 네이티브 프로바이더 (anthropic, openai, gemini 등) — generateObject 사용
  const needsJsonMode = checkNeedsJsonMode(provider);

  const result = await generateObject({
    model,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    prompt,
    schema,
    ...(needsJsonMode ? { mode: 'json' as const } : {}),
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal,
  });
  return {
    object: result.object,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

/**
 * LLM 텍스트 응답에서 JSON 문자열을 추출한다.
 *
 * 추출 우선순위:
 *   1. ```json ... ``` 또는 ``` ... ``` 코드블록 내부
 *   2. 최외곽 `{...}` 또는 `[...]`
 *   3. 위 둘 다 실패 시 입력 문자열 전체 (trim)
 *
 * 추출 후 `JSON.parse`로 유효성을 검사하고, 실패 시
 * `repairTruncatedJson()`으로 토큰 초과로 잘린 응답을 복구한다.
 *
 * @internal export 안 함 — analyzeStructuredViaText에서만 사용
 */
function extractJson(text: string): string {
  let json: string;
  // ```json ... ``` 코드블록 추출
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    // { ... } 또는 [ ... ] 최외곽 추출
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    json = jsonMatch ? jsonMatch[1].trim() : text.trim();
  }

  // 잘린 JSON 복구 시도 (토큰 초과로 중간에 끊긴 경우)
  try {
    JSON.parse(json);
    return json; // 이미 유효한 JSON
  } catch {
    return repairTruncatedJson(json);
  }
}

/**
 * 토큰 초과로 잘린 JSON 문자열을 복구한다.
 *
 * 알고리즘:
 *   1. 홀수 개의 `"` (열린 문자열)이 있으면 마지막 미완성 키-값을 잘라냄
 *   2. 마지막 `}`/`]` 뒤에 남은 부분 문자열에 `,`만 있으면 잘라냄
 *   3. 트레일링 쉼표 제거
 *   4. 스택 기반으로 열린 `{`/`[`를 역순으로 닫아 균형 맞춤
 *
 * 모든 에지 케이스를 100% 복구하지는 못하지만,
 * Anthropic/OpenAI 등의 일반적인 토큰 절단 케이스 다수를 처리한다.
 *
 * @internal export 안 함 — extractJson에서만 사용
 */
function repairTruncatedJson(json: string): string {
  // 마지막 불완전한 속성/원소를 잘라내고 괄호를 닫음
  // 1) 마지막 완전한 원소 이후를 찾아서 자르기
  let trimmed = json;

  // 열린 문자열 닫기 (홀수 개의 이스케이프되지 않은 따옴표)
  const quoteCount = (trimmed.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // 마지막 불완전한 문자열 값의 시작 따옴표 이전까지 자르기
    const lastQuote = trimmed.lastIndexOf('"');
    const beforeLastQuote = trimmed.lastIndexOf('"', lastQuote - 1);
    if (beforeLastQuote > 0) {
      // 마지막 완전한 키-값 쌍 이후의 쉼표까지 포함하여 자르기
      trimmed = trimmed.substring(0, beforeLastQuote);
    }
  }

  // 마지막 불완전한 원소 제거 (쉼표 뒤 불완전한 객체)
  // 마지막 완전한 }  또는 ] 이후의 쓰레기 제거
  const lastCloseBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(',')) {
      trimmed = trimmed.substring(0, lastCloseBrace + 1);
    }
  }

  // 트레일링 쉼표 제거
  trimmed = trimmed.replace(/,\s*$/, '');

  // 열린 괄호를 역순으로 닫기
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  // 스택에 남은 열린 괄호를 역순으로 닫기
  while (stack.length > 0) {
    const open = stack.pop();
    trimmed += open === '{' ? '}' : ']';
  }

  return trimmed;
}

/**
 * generateText + Zod 파싱으로 structured output 대체.
 *
 * 2단계 파이프라인:
 *   1단계: 원래 프롬프트로 분석 (JSON 출력 요청)
 *   2단계: 1단계 응답이 JSON이 아니면, 텍스트를 JSON으로 변환하는 전용 호출
 */
async function analyzeStructuredViaText<T>(
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  model: Awaited<ReturnType<typeof getModel>>,
  options: AIGatewayOptions,
  abortSignal: AbortSignal,
) {
  let schemaBlock = '';
  try {
    const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });
    schemaBlock = JSON.stringify(jsonSchema, null, 2);
  } catch {
    /* 변환 실패 시 스키마 힌트 없이 진행 */
  }

  // ── 1단계: 분석 수행 (JSON 출력 시도) ──
  const systemWithJsonHint = (options.systemPrompt ?? '') + `

IMPORTANT: Respond in valid JSON format only. Start with { and end with }.`;

  const promptWithSchema = `${prompt}

---
Respond as a JSON object matching this schema:
${schemaBlock}

Output JSON only. Start with {.`;

  const result = await generateText({
    model,
    system: systemWithJsonHint,
    prompt: promptWithSchema,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal,
  });

  console.log(
    `[llm-gateway] analyzeStructuredViaText [step 1]: 응답 수신 (finishReason=${result.finishReason}, 텍스트 길이=${result.text.length})`,
  );

  if (result.finishReason === 'length') {
    console.warn(
      `[llm-gateway] 응답이 토큰 제한으로 잘림 (finishReason=length) — JSON 복구 시도`,
    );
  }

  // 1단계 결과에서 JSON 추출 시도
  const step1Result = tryParseAndValidate(result.text, schema);
  if (step1Result) {
    return { object: step1Result, usage: result.usage, finishReason: result.finishReason };
  }

  // ── 2단계: 텍스트 → JSON 변환 전용 호출 ──
  console.log(`[llm-gateway] 1단계 JSON 파싱 실패 → 2단계 변환 호출`);

  // 변환 전용 시스템 프롬프트 (분석 역할 제거, 순수 변환기)
  const converterSystem = `You are a text-to-JSON converter.
Your ONLY job is to convert the given analysis text into a JSON object.
Rules:
- Output ONLY valid JSON. Nothing else.
- First character: {  Last character: }
- No markdown, no explanations, no code blocks.
- Extract information from the text and map it to the schema fields.
- If information is missing, use reasonable defaults ("" for strings, 0 for numbers, [] for arrays).`;

  const analysisSnippet = result.text.substring(0, 2000);
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
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal,
  });

  console.log(
    `[llm-gateway] analyzeStructuredViaText [step 2]: 응답 수신 (finishReason=${step2.finishReason}, 텍스트 길이=${step2.text.length})`,
  );

  // 2단계 결과에서 JSON 추출
  const step2Result = tryParseAndValidate(step2.text, schema);
  if (step2Result) {
    console.log(`[llm-gateway] 2단계 변환 성공`);
    // usage는 두 호출 합산
    const u1 = result.usage as unknown as Record<string, number> | undefined;
    const u2 = step2.usage as unknown as Record<string, number> | undefined;
    const totalUsage = {
      promptTokens: (u1?.promptTokens ?? 0) + (u2?.promptTokens ?? 0),
      completionTokens: (u1?.completionTokens ?? 0) + (u2?.completionTokens ?? 0),
    };
    return { object: step2Result, usage: totalUsage, finishReason: step2.finishReason };
  }

  // 모두 실패
  console.error(`[llm-gateway] 2단계 변환도 실패 — 원본 (처음 500자): ${step2.text.substring(0, 500)}`);
  throw new Error(
    `JSON 파싱 실패: 2단계 변환 후에도 유효한 JSON을 생성하지 못함\n응답 텍스트 (처음 500자): ${step2.text.substring(0, 500)}`,
  );
}

/** JSON 추출 → 파싱 → Zod 검증. 실패 시 null 반환. */
function tryParseAndValidate<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  if (!text || text.trim().length === 0) return null;

  const jsonStr = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    console.warn(`[llm-gateway] Zod 검증 실패: ${issues}`);
    return null;
  }
  return validated.data;
}
