import { generateText, generateObject } from 'ai';
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
    requiresJsonMode: false,
    color: "bg-orange-500"
  },
  openai: {
    type: "openai",
    displayName: "OpenAI (ChatGPT)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-green-500"
  },
  gemini: {
    type: "gemini",
    displayName: "Google (Gemini)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    requiresJsonMode: false,
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
    requiresJsonMode: false,
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
    requiresJsonMode: false,
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
    // generateObject + mode:'json' 사용
    requiresJsonMode: true,
    color: "bg-cyan-500"
  },
  // --- Proxy CLI ---
  "claude-cli": {
    type: "claude-cli",
    displayName: "Claude CLI (Proxy)",
    accessMethod: "proxy-cli",
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: "http://localhost:8317",
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-amber-500"
  },
  "gemini-cli": {
    type: "gemini-cli",
    displayName: "Gemini CLI (Proxy)",
    accessMethod: "proxy-cli",
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
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
    // Open WebUI 프록시가 response_format을 Ollama에 전달 안 함 → text fallback 필수
    requiresJsonMode: false,
    color: "bg-gray-500"
  },
  custom: {
    type: "custom",
    displayName: "Custom (OpenAI Compatible)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-zinc-500"
  }
};
var AI_PROVIDER_VALUES = Object.keys(PROVIDER_REGISTRY);
function getProvidersByAccess(method) {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.accessMethod === method);
}
function isProxyCli(provider) {
  return PROVIDER_REGISTRY[provider]?.accessMethod === "proxy-cli";
}
function needsTextFallback(provider) {
  return !PROVIDER_REGISTRY[provider]?.supportsStructuredOutput;
}
function needsJsonMode(provider) {
  return PROVIDER_REGISTRY[provider]?.requiresJsonMode ?? false;
}

// src/gateway/gateway.ts
function normalizeUsage(usage) {
  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const inputTokens = (typeof usage.promptTokens === "number" ? usage.promptTokens : 0) || (typeof usage.inputTokens === "number" ? usage.inputTokens : 0);
  const outputTokens = (typeof usage.completionTokens === "number" ? usage.completionTokens : 0) || (typeof usage.outputTokens === "number" ? usage.outputTokens : 0);
  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
var DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-nano",
  gemini: "gemini-2.5-flash",
  deepseek: "deepseek-chat"
};
var DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1"
};
async function getModel(provider, model, baseUrl, apiKey) {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? "gpt-4.1-nano";
  console.log(
    `[llm-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? "none"}, hasApiKey=${!!apiKey}`
  );
  switch (provider) {
    case "anthropic": {
      const client = createAnthropic({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
    case "gemini": {
      const client = createGoogleGenerativeAI({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
    case "gemini-cli": {
      const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
      const client = createGeminiProvider({
        authType: "oauth-personal"
      });
      return client(modelName);
    }
    case "claude-cli": {
      const proxyBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : "http://localhost:8317";
      const resolvedUrl = proxyBaseUrl.endsWith("/v1") ? proxyBaseUrl : `${proxyBaseUrl}/v1`;
      const client = createOpenAI({
        baseURL: resolvedUrl,
        apiKey: apiKey || "cli-proxy"
      });
      return client.chat(modelName);
    }
    case "ollama":
    case "deepseek":
    case "xai":
    case "openrouter":
    case "custom": {
      let resolvedBaseUrl;
      if (baseUrl) {
        const cleaned = baseUrl.replace(/\/+$/, "");
        resolvedBaseUrl = cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`;
      } else {
        resolvedBaseUrl = DEFAULT_BASE_URLS[provider] ?? "http://localhost:11434/v1";
      }
      const client = createOpenAI({
        baseURL: resolvedBaseUrl,
        apiKey: apiKey || "ollama"
      });
      return client.chat(modelName);
    }
    case "openai":
    default: {
      const client = createOpenAI({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
  }
}
function mergeAbortSignals(external, timeoutMs) {
  const timeout = timeoutMs ?? 3e5;
  if (!external) return AbortSignal.timeout(timeout);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeout);
  external.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      controller.abort(external.reason);
    },
    { once: true }
  );
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
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
    usage: result.usage,
    finishReason: result.finishReason
  };
}
async function analyzeStructured(prompt, schema, options = {}) {
  const provider = options.provider ?? "anthropic";
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);
  const abortSignal = mergeAbortSignals(options.abortSignal, options.timeoutMs);
  if (needsTextFallback(provider)) {
    return analyzeStructuredViaText(prompt, schema, model, options, abortSignal);
  }
  const needsJsonMode2 = needsJsonMode(provider);
  const result = await generateObject({
    model,
    ...options.systemPrompt ? { system: options.systemPrompt } : {},
    prompt,
    schema,
    ...needsJsonMode2 ? { mode: "json" } : {},
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal
  });
  return {
    object: result.object,
    usage: result.usage,
    finishReason: result.finishReason
  };
}
function extractJson(text) {
  let json;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    json = jsonMatch ? jsonMatch[1].trim() : text.trim();
  }
  try {
    JSON.parse(json);
    return json;
  } catch {
    return repairTruncatedJson(json);
  }
}
function repairTruncatedJson(json) {
  let trimmed = json;
  const quoteCount = (trimmed.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    const lastQuote = trimmed.lastIndexOf('"');
    const beforeLastQuote = trimmed.lastIndexOf('"', lastQuote - 1);
    if (beforeLastQuote > 0) {
      trimmed = trimmed.substring(0, beforeLastQuote);
    }
  }
  const lastCloseBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(",")) {
      trimmed = trimmed.substring(0, lastCloseBrace + 1);
    }
  }
  trimmed = trimmed.replace(/,\s*$/, "");
  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  while (stack.length > 0) {
    const open = stack.pop();
    trimmed += open === "{" ? "}" : "]";
  }
  return trimmed;
}
async function analyzeStructuredViaText(prompt, schema, model, options, abortSignal) {
  let schemaBlock = "";
  try {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
    schemaBlock = JSON.stringify(jsonSchema, null, 2);
  } catch {
  }
  const systemWithJsonHint = (options.systemPrompt ?? "") + `

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
    abortSignal
  });
  console.log(
    `[llm-gateway] analyzeStructuredViaText [step 1]: \uC751\uB2F5 \uC218\uC2E0 (finishReason=${result.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length})`
  );
  if (result.finishReason === "length") {
    console.warn(
      `[llm-gateway] \uC751\uB2F5\uC774 \uD1A0\uD070 \uC81C\uD55C\uC73C\uB85C \uC798\uB9BC (finishReason=length) \u2014 JSON \uBCF5\uAD6C \uC2DC\uB3C4`
    );
  }
  const step1Result = tryParseAndValidate(result.text, schema);
  if (step1Result) {
    return { object: step1Result, usage: result.usage, finishReason: result.finishReason };
  }
  console.log(`[llm-gateway] 1\uB2E8\uACC4 JSON \uD30C\uC2F1 \uC2E4\uD328 \u2192 2\uB2E8\uACC4 \uBCC0\uD658 \uD638\uCD9C`);
  const converterSystem = `You are a text-to-JSON converter.
Your ONLY job is to convert the given analysis text into a JSON object.
Rules:
- Output ONLY valid JSON. Nothing else.
- First character: {  Last character: }
- No markdown, no explanations, no code blocks.
- Extract information from the text and map it to the schema fields.
- If information is missing, use reasonable defaults ("" for strings, 0 for numbers, [] for arrays).`;
  const analysisSnippet = result.text.substring(0, 2e3);
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
    abortSignal
  });
  console.log(
    `[llm-gateway] analyzeStructuredViaText [step 2]: \uC751\uB2F5 \uC218\uC2E0 (finishReason=${step2.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${step2.text.length})`
  );
  const step2Result = tryParseAndValidate(step2.text, schema);
  if (step2Result) {
    console.log(`[llm-gateway] 2\uB2E8\uACC4 \uBCC0\uD658 \uC131\uACF5`);
    const u1 = result.usage;
    const u2 = step2.usage;
    const totalUsage = {
      promptTokens: (u1?.promptTokens ?? 0) + (u2?.promptTokens ?? 0),
      completionTokens: (u1?.completionTokens ?? 0) + (u2?.completionTokens ?? 0)
    };
    return { object: step2Result, usage: totalUsage, finishReason: step2.finishReason };
  }
  console.error(`[llm-gateway] 2\uB2E8\uACC4 \uBCC0\uD658\uB3C4 \uC2E4\uD328 \u2014 \uC6D0\uBCF8 (\uCC98\uC74C 500\uC790): ${step2.text.substring(0, 500)}`);
  throw new Error(
    `JSON \uD30C\uC2F1 \uC2E4\uD328: 2\uB2E8\uACC4 \uBCC0\uD658 \uD6C4\uC5D0\uB3C4 \uC720\uD6A8\uD55C JSON\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD568
\uC751\uB2F5 \uD14D\uC2A4\uD2B8 (\uCC98\uC74C 500\uC790): ${step2.text.substring(0, 500)}`
  );
}
function tryParseAndValidate(text, schema) {
  if (!text || text.trim().length === 0) return null;
  const jsonStr = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    console.warn(`[llm-gateway] Zod \uAC80\uC99D \uC2E4\uD328: ${issues}`);
    return null;
  }
  return validated.data;
}

export { AI_PROVIDER_VALUES, PROVIDER_REGISTRY, analyzeStructured, analyzeText, getProvidersByAccess, isProxyCli, needsJsonMode, needsTextFallback, normalizeUsage };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map