import { generateText, generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
// gemini-cli: 네이티브/WASM 의존성이 많아 동적 import (워커에서만 사용, 웹 빌드 제외)
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
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
  // Anthropic/Gemini: inputTokens/outputTokens, OpenAI: promptTokens/completionTokens
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

/** 프로바이더별 기본 Base URL */
const DEFAULT_BASE_URLS: Partial<Record<AIProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

export async function getModel(
  provider: AIProvider,
  model?: string,
  baseUrl?: string,
  apiKey?: string,
) {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? 'gpt-4.1-nano';
  console.log(
    `[ai-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? 'none'}, hasApiKey=${!!apiKey}`,
  );
  switch (provider) {
    case 'anthropic': {
      const client = createAnthropic({
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return client(modelName);
    }
    case 'gemini': {
      const client = createGoogleGenerativeAI({
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return client(modelName);
    }
    case 'gemini-cli': {
      // Gemini CLI OAuth 인증 — API 키 불필요 (무료 쿼터 사용)
      const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
      const client = createGeminiProvider({
        authType: 'oauth-personal',
      });
      return client(modelName);
    }
    case 'claude-cli': {
      // Claude CLI Proxy — OpenAI 호환 Chat Completions API 사용 (/v1/chat/completions)
      // cli-proxy-api는 /v1/messages가 아닌 /v1/chat/completions 엔드포인트만 지원
      const proxyBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'http://localhost:8317';
      const resolvedUrl = proxyBaseUrl.endsWith('/v1') ? proxyBaseUrl : `${proxyBaseUrl}/v1`;
      const client = createOpenAI({
        baseURL: resolvedUrl,
        apiKey: apiKey || 'cli-proxy',
      });
      return client.chat(modelName);
    }
    case 'ollama':
    case 'deepseek':
    case 'xai':
    case 'openrouter':
    case 'custom': {
      // OpenAI 호환 프로바이더 — Chat Completions API 사용 (/v1/chat/completions)
      // 중요: client(modelName)은 Responses API(/v1/responses)를 사용하므로 Ollama에서 405 발생
      // client.chat(modelName)을 사용해야 Chat Completions API로 요청됨
      let resolvedBaseUrl: string;
      if (baseUrl) {
        const cleaned = baseUrl.replace(/\/+$/, '');
        resolvedBaseUrl = cleaned.endsWith('/v1') ? cleaned : `${cleaned}/v1`;
      } else {
        resolvedBaseUrl = DEFAULT_BASE_URLS[provider] ?? 'http://localhost:11434/v1';
      }
      const client = createOpenAI({
        baseURL: resolvedBaseUrl,
        apiKey: apiKey || 'ollama',
      });
      return client.chat(modelName);
    }
    case 'openai':
    default: {
      const client = createOpenAI({
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return client(modelName);
    }
  }
}

/** 외부 AbortSignal과 타임아웃을 병합 — 둘 중 하나라도 발동하면 abort */
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

// 텍스트 분석 -- systemPrompt + usage 반환 지원
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

// 구조화 분석 -- systemPrompt + usage 반환 지원
// 파싱 실패 시 즉시 에러 전파 (재시도/폴백 없음 — 비용 낭비 방지)
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

// LLM 응답 텍스트에서 JSON을 추출 (마크다운 코드블록 처리 + 잘린 JSON 복구)
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

// 토큰 초과로 잘린 JSON을 복구 — 열린 괄호/따옴표를 닫아줌
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

// generateText + Zod 파싱으로 structured output 대체
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
    schemaBlock = `\n\n응답 JSON Schema:\n${JSON.stringify(jsonSchema, null, 2)}`;
  } catch {
    /* 변환 실패 시 스키마 힌트 없이 진행 */
  }
  const jsonInstruction = `${schemaBlock}\n\n반드시 위 JSON Schema 구조에 정확히 맞는 유효한 JSON으로만 응답하세요. 마크다운 코드블록, 설명 텍스트, 주석 없이 순수 JSON 객체만 출력하세요. 모든 필수 필드를 빠짐없이 포함하되, 각 텍스트 필드는 2~3문장 이내로 간결하게 작성하세요. JSON이 잘리지 않도록 전체 응답을 완결된 형태로 출력하세요.`;
  const systemWithJson = (options.systemPrompt ?? '') + jsonInstruction;

  let result;
  try {
    result = await generateText({
      model,
      system: systemWithJson,
      prompt,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      abortSignal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ai-gateway] analyzeStructuredViaText: generateText 호출 실패 — ${msg}`);
    throw e;
  }

  console.log(
    `[ai-gateway] analyzeStructuredViaText: 응답 수신 (finishReason=${result.finishReason}, 텍스트 길이=${result.text.length})`,
  );

  // 토큰 초과로 응답이 잘린 경우 경고
  if (result.finishReason === 'length') {
    console.warn(
      `[ai-gateway] 응답이 토큰 제한으로 잘림 (finishReason=length, 텍스트 길이=${result.text.length}) — JSON 복구 시도`,
    );
  }

  const jsonStr = extractJson(result.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    const truncatedHint =
      result.finishReason === 'length'
        ? ' [원인: 응답이 토큰 제한(maxOutputTokens)으로 잘림 — maxOutputTokens 증가 권장]'
        : '';
    console.error(
      `[ai-gateway] JSON 파싱 실패 — finishReason=${result.finishReason}, 텍스트 길이=${result.text.length}${truncatedHint}`,
    );
    console.error(`[ai-gateway] 추출된 JSON (처음 500자): ${jsonStr.substring(0, 500)}`);
    console.error(`[ai-gateway] 원본 응답 (처음 500자): ${result.text.substring(0, 500)}`);
    throw new Error(
      `JSON 파싱 실패${truncatedHint}: ${e instanceof Error ? e.message : String(e)}\n응답 텍스트 (처음 500자): ${result.text.substring(0, 500)}`,
      { cause: e },
    );
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    console.error(`[ai-gateway] Zod 검증 실패 — ${issues}`);
    console.error(
      `[ai-gateway] 파싱된 JSON 키: ${typeof parsed === 'object' && parsed ? Object.keys(parsed).join(', ') : 'N/A'}`,
    );
    throw new Error(`JSON 스키마 검증 실패: ${issues}`);
  }

  return {
    object: validated.data,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}
