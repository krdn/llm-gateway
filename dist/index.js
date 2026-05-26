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
    callMethod: "direct",
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
    requiresJsonMode: false,
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
    requiresJsonMode: false,
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
    requiresJsonMode: false,
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
    requiresJsonMode: true,
    callMethod: "chat",
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
    callMethod: "chat",
    defaultApiKey: "cli-proxy",
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
    requiresJsonMode: false,
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
    requiresJsonMode: false,
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
var SDK_MAP = {
  anthropic: (opts) => createAnthropic(opts),
  gemini: (opts) => createGoogleGenerativeAI(opts),
  openai: (opts) => createOpenAI(opts)
};
function resolveBaseUrlForChat(provider, baseUrl) {
  if (baseUrl) {
    const cleaned = baseUrl.replace(/\/+$/, "");
    return cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`;
  }
  const defaultUrl = PROVIDER_REGISTRY[provider].defaultBaseUrl ?? "http://localhost:11434";
  return defaultUrl.endsWith("/v1") ? defaultUrl : `${defaultUrl}/v1`;
}
async function getModel(provider, model, baseUrl, apiKey) {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? "gpt-4.1-nano";
  console.log(
    `[llm-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? "none"}, hasApiKey=${!!apiKey}`
  );
  if (provider === "gemini-cli") {
    const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
    return createGeminiProvider({ authType: "oauth-personal" })(modelName);
  }
  const meta = PROVIDER_REGISTRY[provider];
  const sdkFactory = SDK_MAP[provider] ?? ((opts) => createOpenAI(opts));
  const sdkOpts = {};
  if (meta.callMethod === "chat") {
    sdkOpts.baseURL = resolveBaseUrlForChat(provider, baseUrl);
    sdkOpts.apiKey = apiKey || meta.defaultApiKey || "ollama";
  } else {
    if (apiKey) sdkOpts.apiKey = apiKey;
    if (baseUrl) sdkOpts.baseURL = baseUrl;
  }
  const client = sdkFactory(sdkOpts);
  return meta.callMethod === "chat" ? client.chat(modelName) : client(modelName);
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

// src/adapters/model-config.ts
function createInMemoryModelConfig(options) {
  const { modules, overrides = {}, providerDefaults = {} } = options;
  return {
    async resolve(moduleName) {
      const base = modules[moduleName];
      if (!base) {
        throw new Error(
          `[model-config] Unknown module: ${moduleName}. Pass it via createInMemoryModelConfig({ modules: { ... } }).`
        );
      }
      const providerDefault = providerDefaults[base.provider] ?? {};
      const override = overrides[moduleName] ?? {};
      const provider = override.provider ?? base.provider;
      const model = override.model ?? providerDefault.model ?? base.model;
      const apiKey = override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;
      return {
        provider,
        model,
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...maxOutputTokens ? { maxOutputTokens } : {}
      };
    }
  };
}
function resolveApiKeyFromEnv(provider) {
  const env = (typeof process !== "undefined" ? process.env : {}) ?? {};
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "gemini":
      return env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
    case "deepseek":
      return env.DEEPSEEK_API_KEY;
    case "xai":
      return env.XAI_API_KEY;
    case "openrouter":
      return env.OPENROUTER_API_KEY;
    default:
      return void 0;
  }
}

// src/adapters/pipeline-control.ts
var noopPipelineControl = {
  async isCancelled() {
    return false;
  },
  async waitIfPaused() {
  },
  async checkCostLimit() {
    return true;
  },
  async appendEvent() {
  }
};

// src/adapters/concurrency.ts
var DEFAULT_LIMITS = {
  gemini: 2,
  anthropic: 3,
  openai: 2,
  "gemini-cli": 1,
  "claude-cli": 1,
  ollama: 1,
  deepseek: 2,
  xai: 2,
  openrouter: 2,
  custom: 1
};
function createStaticConcurrency(limits = {}) {
  return {
    async getLimit(provider) {
      return limits[provider] ?? DEFAULT_LIMITS[provider] ?? 1;
    }
  };
}

// src/runner/retry-utils.ts
function isRateLimitError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /rate\s*limit|429|quota\s*exceeded|RESOURCE_EXHAUSTED|[TR]PM/i.test(msg) || // Gemini 서버 용량 부족 (구체적 문구만 매칭)
  msg.includes("No capacity available") || // 프로바이더가 명시한 재시도 안내
  /please\s+retry\s+in|try\s+again\s+in/i.test(msg);
}
function isServerOverloadError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("503") || msg.includes("overloaded") || msg.includes("temporarily unavailable");
}
function parseRetryAfter(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/(?:try again|retry) in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var MAX_RATE_LIMIT_RETRIES = 5;

// src/runner/run-module.ts
async function runModule(module, input, options, priorResults) {
  const pipelineControl = options.pipelineControl ?? noopPipelineControl;
  const onPersist = options.onPersist ?? (async () => void 0);
  const onProgress = options.onProgress ?? (() => void 0);
  const meta = options.extractMeta(input);
  const { jobId, itemCount } = meta;
  if (itemCount === 0) {
    onProgress({ module: module.name, phase: "skip", message: "\uC785\uB825 \uB370\uC774\uD130 0\uAC74" });
    await onPersist({
      jobId,
      module: module.name,
      status: "skipped",
      errorMessage: "\uC785\uB825 \uB370\uC774\uD130 \uC5C6\uC74C \u2014 \uBD84\uC11D \uC2A4\uD0B5"
    });
    return { module: module.name, status: "skipped", errorMessage: "\uC785\uB825 \uB370\uC774\uD130 \uC5C6\uC74C" };
  }
  try {
    await onPersist({ jobId, module: module.name, status: "running" });
    onProgress({ module: module.name, phase: "start" });
    const config = await options.configAdapter.resolve(module.name);
    const prompt = priorResults && module.buildPromptWithContext ? module.buildPromptWithContext(input, priorResults) : module.buildPrompt(input);
    const gatewayOptions = {
      provider: config.provider,
      model: config.model,
      ...config.baseUrl ? { baseUrl: config.baseUrl } : {},
      ...config.apiKey ? { apiKey: config.apiKey } : {},
      systemPrompt: module.buildSystemPrompt(),
      maxOutputTokens: config.maxOutputTokens ?? 8192
    };
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      if (await pipelineControl.isCancelled(jobId)) {
        onProgress({
          module: module.name,
          phase: "fail",
          message: "\uCDE8\uC18C\uB428"
        });
        return {
          module: module.name,
          status: "failed",
          errorMessage: "\uC0AC\uC6A9\uC790\uC5D0 \uC758\uD574 \uC911\uC9C0\uB428"
        };
      }
      await pipelineControl.waitIfPaused(jobId);
      try {
        const result = await analyzeStructured(prompt, module.schema, gatewayOptions);
        const moduleResult = {
          module: module.name,
          status: "completed",
          result: result.object,
          usage: {
            ...normalizeUsage(result.usage),
            provider: config.provider,
            model: config.model
          }
        };
        await onPersist({
          jobId,
          module: module.name,
          status: "completed",
          result: moduleResult.result,
          usage: moduleResult.usage
        });
        onProgress({ module: module.name, phase: "complete" });
        return moduleResult;
      } catch (error) {
        if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
          const retryAfterSec = parseRetryAfter(error);
          const backoffMs = Math.max(retryAfterSec * 1e3, (attempt + 1) * 3e3);
          const msg = `${module.name}: Rate limit, ${Math.round(backoffMs / 1e3)}\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4 (${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`;
          onProgress({
            module: module.name,
            phase: "retry",
            message: msg,
            attempt: attempt + 1
          });
          await pipelineControl.appendEvent(jobId, "warn", msg).catch(() => void 0);
          await sleep(backoffMs);
          continue;
        }
        if (isServerOverloadError(error) && attempt < 1) {
          const msg = `${module.name}: \uC11C\uBC84 \uACFC\uBD80\uD558, 15\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4`;
          onProgress({ module: module.name, phase: "retry", message: msg, attempt: 1 });
          await pipelineControl.appendEvent(jobId, "warn", msg).catch(() => void 0);
          await sleep(15e3);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`${module.name}: \uC7AC\uC2DC\uB3C4 \uD55C\uB3C4 \uCD08\uACFC`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : void 0;
    onProgress({ module: module.name, phase: "fail", message: errorMessage });
    if (errorStack) {
      console.error(`[run-module] ${module.name}: ${errorMessage}
${errorStack}`);
    }
    await onPersist({
      jobId,
      module: module.name,
      status: "failed",
      errorMessage
    });
    await pipelineControl.appendEvent(jobId, "error", `${module.name} \uBD84\uC11D \uC2E4\uD328: ${errorMessage}`).catch(() => void 0);
    return { module: module.name, status: "failed", errorMessage };
  }
}

// src/runner/concurrency.ts
async function runWithProviderGrouping(modules, runner, concurrency) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of modules) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }
  const groupPromises = Array.from(groups.entries()).map(async ([provider, mods]) => {
    const limit = await concurrency.getLimit(provider);
    const results = [];
    for (let i = 0; i < mods.length; i += limit) {
      const batch = mods.slice(i, i + limit);
      const batchResults = await Promise.allSettled(batch.map((m) => runner(m)));
      results.push(...batchResults);
    }
    return { provider, results };
  });
  const allResults = await Promise.all(groupPromises);
  const moduleNameToResult = /* @__PURE__ */ new Map();
  for (const { provider, results } of allResults) {
    const groupModules = groups.get(provider);
    groupModules.forEach((m, idx) => {
      moduleNameToResult.set(m.name, results[idx]);
    });
  }
  return modules.map(
    (m) => moduleNameToResult.get(m.name) ?? {
      status: "rejected",
      reason: new Error(`module ${m.name} produced no result`)
    }
  );
}

export { AI_PROVIDER_VALUES, MAX_RATE_LIMIT_RETRIES, PROVIDER_REGISTRY, analyzeStructured, analyzeText, createInMemoryModelConfig, createStaticConcurrency, getProvidersByAccess, isProxyCli, isRateLimitError, isServerOverloadError, needsJsonMode, needsTextFallback, noopPipelineControl, normalizeUsage, parseRetryAfter, runModule, runWithProviderGrouping, sleep };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map