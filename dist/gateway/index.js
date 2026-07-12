import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { zodToJsonSchema } from 'zod-to-json-schema';

// src/gateway/gateway.ts

// src/gateway/provider-meta.ts
var PROVIDER_REGISTRY = {
  // --- 직접 API ---
  anthropic: {
    type: "anthropic",
    displayName: "Anthropic (Claude)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-orange-500"
  },
  openai: {
    type: "openai",
    displayName: "OpenAI (ChatGPT)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-green-500"
  },
  gemini: {
    type: "gemini",
    displayName: "Google (Gemini)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    callMethod: "direct",
    color: "bg-blue-500"
  },
  deepseek: {
    type: "deepseek",
    displayName: "DeepSeek",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    supportsStructuredOutput: true,
    callMethod: "chat",
    color: "bg-purple-500"
  },
  xai: {
    type: "xai",
    displayName: "xAI (Grok)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    supportsStructuredOutput: true,
    callMethod: "chat",
    color: "bg-red-500"
  },
  openrouter: {
    type: "openrouter",
    displayName: "OpenRouter",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsStructuredOutput: true,
    callMethod: "chat",
    color: "bg-cyan-500"
  },
  // --- Proxy CLI ---
  "claude-cli": {
    type: "claude-cli",
    displayName: "Claude CLI (Proxy)",
    accessMethod: "proxy-cli",
    // cli-proxy-api는 config.yaml의 api-keys로 Bearer 토큰을 항상 검증한다.
    // 프록시 config에 등록된 키를 options.apiKey로 전달해야 한다 (미전달 시 명시 에러).
    requiresApiKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: "http://localhost:8317",
    supportsStructuredOutput: false,
    callMethod: "chat",
    color: "bg-amber-500"
  },
  // ai-sdk-provider-gemini-cli 경유 — 로컬 ~/.gemini OAuth를 직접 사용한다.
  // baseUrl/apiKey는 무시되며 cli-proxy-api와 무관한 별도 크레덴셜/쿼터 경로.
  "gemini-cli": {
    type: "gemini-cli",
    displayName: "Gemini CLI (Local OAuth)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    callMethod: "direct",
    color: "bg-teal-500"
  },
  // --- 로컬 ---
  ollama: {
    type: "ollama",
    displayName: "Ollama (Local)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: "http://localhost:11434",
    supportsStructuredOutput: false,
    callMethod: "chat",
    defaultApiKey: "ollama",
    color: "bg-gray-500"
  },
  custom: {
    type: "custom",
    displayName: "Custom (OpenAI Compatible)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    callMethod: "chat",
    defaultApiKey: "ollama",
    color: "bg-zinc-500"
  }
};
var AI_PROVIDER_VALUES = Object.keys(PROVIDER_REGISTRY);
function getProvidersByAccess(method) {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.accessMethod === method);
}
function isProxyCli(provider) {
  return PROVIDER_REGISTRY[provider].accessMethod === "proxy-cli";
}
function needsTextFallback(provider) {
  return !PROVIDER_REGISTRY[provider].supportsStructuredOutput;
}

// src/gateway/model-factory.ts
var DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-nano",
  gemini: "gemini-2.5-flash",
  deepseek: "deepseek-chat"
};
var SDK_MAP = {
  anthropic: (opts) => createAnthropic(opts),
  gemini: (opts) => createGoogleGenerativeAI(opts),
  openai: (opts) => createOpenAI(opts)
};
function ensureV1Suffix(baseUrl) {
  const cleaned = baseUrl.replace(/\/+$/, "");
  return cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`;
}
async function getModel(provider, model, baseUrl, apiKey) {
  const meta = PROVIDER_REGISTRY[provider];
  if (!meta) {
    throw new Error(
      `[llm-gateway] \uC54C \uC218 \uC5C6\uB294 provider: '${provider}'. \uC0AC\uC6A9 \uAC00\uB2A5: ${AI_PROVIDER_VALUES.join(", ")}`
    );
  }
  const modelName = model ?? DEFAULT_MODELS[provider];
  if (!modelName) {
    throw new Error(
      `[llm-gateway] provider '${provider}'\uB294 \uAE30\uBCF8 \uBAA8\uB378\uC774 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 options.model\uC744 \uC9C0\uC815\uD558\uC138\uC694`
    );
  }
  if (provider === "gemini-cli") {
    const mod = await import('ai-sdk-provider-gemini-cli').catch((err) => {
      throw new Error(
        `[llm-gateway] provider 'gemini-cli'\uB294 \uC120\uD0DD\uC801 peer dependency\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 \u2014 \uC18C\uBE44\uC790 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC124\uCE58\uD558\uC138\uC694: pnpm add ai-sdk-provider-gemini-cli`,
        { cause: err }
      );
    });
    return mod.createGeminiProvider({ authType: "oauth-personal" })(modelName);
  }
  const sdkFactory = SDK_MAP[provider] ?? ((opts) => createOpenAI(opts));
  const sdkOpts = {};
  if (meta.callMethod === "chat") {
    const resolvedBaseUrl = baseUrl ?? meta.defaultBaseUrl;
    if (!resolvedBaseUrl) {
      throw new Error(
        `[llm-gateway] provider '${provider}'\uB294 baseUrl\uC774 \uD544\uC694\uD569\uB2C8\uB2E4 \u2014 options.baseUrl\uC744 \uC9C0\uC815\uD558\uC138\uC694`
      );
    }
    sdkOpts.baseURL = ensureV1Suffix(resolvedBaseUrl);
    const resolvedApiKey = apiKey || meta.defaultApiKey;
    if (!resolvedApiKey) {
      throw new Error(
        `[llm-gateway] provider '${provider}'\uB294 apiKey\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 \u2014 options.apiKey\uB97C \uC9C0\uC815\uD558\uC138\uC694`
      );
    }
    sdkOpts.apiKey = resolvedApiKey;
  } else {
    if (apiKey) sdkOpts.apiKey = apiKey;
    if (baseUrl) sdkOpts.baseURL = baseUrl;
  }
  const client = sdkFactory(sdkOpts);
  return meta.callMethod === "chat" ? client.chat(modelName) : client(modelName);
}

// src/gateway/normalize-usage.ts
function normalizeUsage(usage) {
  if (typeof usage !== "object" || usage === null) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const u = usage;
  const inputTokens = (typeof u.promptTokens === "number" ? u.promptTokens : 0) || (typeof u.inputTokens === "number" ? u.inputTokens : 0);
  const outputTokens = (typeof u.completionTokens === "number" ? u.completionTokens : 0) || (typeof u.outputTokens === "number" ? u.outputTokens : 0);
  const totalTokens = typeof u.totalTokens === "number" ? u.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

// src/gateway/json-repair.ts
function extractJson(text) {
  let json;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    json = extractBalancedSlice(text);
  }
  try {
    JSON.parse(json);
    return json;
  } catch {
    return repairTruncatedJson(json);
  }
}
function extractBalancedSlice(text) {
  const start = text.search(/[{[]/);
  if (start === -1) return text.trim();
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}
function scanJson(text) {
  const openStack = [];
  let inString = false;
  let escape = false;
  let lastSafeCut = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      openStack.push(ch);
      lastSafeCut = i;
      continue;
    }
    if (ch === "}" || ch === "]") {
      openStack.pop();
      continue;
    }
    if (ch === ",") lastSafeCut = i;
  }
  return { inString, lastSafeCut, openStack };
}
function repairTruncatedJson(json) {
  let trimmed = json;
  const scan = scanJson(trimmed);
  if (scan.inString && scan.lastSafeCut >= 0) {
    const cutCh = trimmed[scan.lastSafeCut];
    trimmed = cutCh === "," ? trimmed.slice(0, scan.lastSafeCut) : trimmed.slice(0, scan.lastSafeCut + 1);
  }
  const lastCloseBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(",")) {
      const candidate = trimmed.substring(0, lastCloseBrace + 1);
      if (scanJson(candidate).openStack.length === 0) {
        trimmed = candidate;
      }
    }
  }
  trimmed = stripIncompleteTail(trimmed);
  trimmed = trimmed.replace(/,\s*$/, "");
  const { openStack } = scanJson(trimmed);
  while (openStack.length > 0) {
    const open = openStack.pop();
    trimmed += open === "{" ? "}" : "]";
  }
  return trimmed;
}
function isCompleteValueToken(token) {
  if (token.length === 0) return false;
  try {
    JSON.parse(token);
    return true;
  } catch {
    return false;
  }
}
function stripIncompleteTail(input) {
  let s = input;
  for (; ; ) {
    const pair = s.match(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*([^,{}[\]\s"]*)\s*$/);
    if (pair && pair.index !== void 0 && !isCompleteValueToken(pair[1])) {
      s = s.slice(0, pair.index);
      continue;
    }
    const bareKey = s.match(/([:{[,])\s*"(?:[^"\\]|\\.)*"\s*$/);
    if (bareKey && bareKey.index !== void 0) {
      const prevCh = bareKey[1];
      const container = scanJson(s.slice(0, bareKey.index + 1)).openStack.at(-1);
      const isObjectKey = prevCh === "{" || prevCh === "," && container === "{";
      if (isObjectKey) {
        s = s.slice(0, bareKey.index + (prevCh === "{" ? 1 : 0)).replace(/,\s*$/, "");
        continue;
      }
    }
    const elem = s.match(/([[,])\s*([^,{}[\]\s"]+)\s*$/);
    if (elem && elem.index !== void 0 && !isCompleteValueToken(elem[2])) {
      s = s.slice(0, elem.index + elem[1].length);
      continue;
    }
    return s;
  }
}
function tryParseAndValidate(text, schema) {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: "\uBE48 \uC751\uB2F5" };
  }
  const jsonStr = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      ok: false,
      reason: `JSON.parse \uC2E4\uD328: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return { ok: false, reason: `Zod \uAC80\uC99D \uC2E4\uD328: ${issues}` };
  }
  return { ok: true, data: validated.data };
}

// src/gateway/strategies.ts
var CONVERTER_INPUT_MAX_CHARS = 32e3;
var StructuredOutputError = class extends Error {
  usage;
  constructor(message, usage) {
    super(message);
    this.name = "StructuredOutputError";
    this.usage = usage;
  }
};
async function executeStructured(provider, model, schema, opts) {
  return needsTextFallback(provider) ? executeText2Step(model, schema, opts) : executeNative(provider, model, schema, opts);
}
async function executeNative(provider, model, schema, opts) {
  const result = await generateText({
    model,
    ...opts.systemPrompt ? { system: opts.systemPrompt } : {},
    prompt: opts.prompt,
    output: Output.object({ schema }),
    // Anthropic은 classic tool_use(jsonTool)로 강제한다. 기본 'auto'는 신형
    // output_config.format을 선택하는데, 이 경로는 JSON Schema 부분집합만 허용해
    // number의 minimum/maximum, array의 minItems(>1) 등을 거부한다.
    // classic tool_use는 표준 JSON Schema를 그대로 받으므로 스키마 제약이 보존되고,
    // cli-proxy-api(Claude Max 플랜) 경유 시에도 구조화 출력이 정상 동작한다. (v3.4.0)
    ...provider === "anthropic" ? { providerOptions: { anthropic: { structuredOutputMode: "jsonTool" } } } : {},
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal
  });
  return {
    object: result.output,
    usage: normalizeUsage(result.usage),
    finishReason: result.finishReason
  };
}
async function executeText2Step(model, schema, opts) {
  let schemaBlock = "";
  try {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
    schemaBlock = JSON.stringify(jsonSchema, null, 2);
  } catch {
  }
  const systemWithJsonHint = (opts.systemPrompt ?? "") + `

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
    abortSignal: opts.abortSignal
  });
  const step1Result = tryParseAndValidate(step1.text, schema);
  if (step1Result.ok) {
    return {
      object: step1Result.data,
      usage: normalizeUsage(step1.usage),
      finishReason: step1.finishReason
    };
  }
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
    abortSignal: opts.abortSignal
  });
  const step2Result = tryParseAndValidate(step2.text, schema);
  if (step2Result.ok) {
    return {
      object: step2Result.data,
      usage: sumUsage(step1.usage, step2.usage),
      finishReason: step2.finishReason
    };
  }
  const step1Hint = step1.finishReason === "length" ? ", \uD1A0\uD070 \uC81C\uD55C \uC808\uB2E8" : "";
  throw new StructuredOutputError(
    `[llm-gateway] \uAD6C\uC870\uD654 \uCD9C\uB825 \uC2E4\uD328 \u2014 step1(finishReason=${step1.finishReason}${step1Hint}): ${step1Result.reason} / step2(finishReason=${step2.finishReason}): ${step2Result.reason}
step2 \uC751\uB2F5 (\uCC98\uC74C 500\uC790): ${step2.text.slice(0, 500)}`,
    sumUsage(step1.usage, step2.usage)
  );
}
function sumUsage(u1, u2) {
  const a = normalizeUsage(u1);
  const b = normalizeUsage(u2);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

// src/gateway/gateway.ts
function mergeAbortSignals(external, timeoutMs) {
  const ms = timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3e5;
  const timeoutSignal = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeoutSignal]) : timeoutSignal;
}
async function analyzeText(prompt, options = {}) {
  const provider = options.provider ?? "anthropic";
  const result = await generateText({
    model: await getModel(provider, options.model, options.baseUrl, options.apiKey),
    ...options.systemPrompt ? { system: options.systemPrompt } : {},
    prompt,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs)
  });
  return {
    text: result.text,
    usage: { ...result.usage, ...normalizeUsage(result.usage) },
    finishReason: result.finishReason
  };
}
async function analyzeStructured(prompt, schema, options = {}) {
  const provider = options.provider ?? "anthropic";
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);
  return executeStructured(provider, model, schema, {
    prompt,
    ...options.systemPrompt ? { systemPrompt: options.systemPrompt } : {},
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs)
  });
}

export { AI_PROVIDER_VALUES, PROVIDER_REGISTRY, StructuredOutputError, analyzeStructured, analyzeText, getProvidersByAccess, isProxyCli, needsTextFallback, normalizeUsage };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map