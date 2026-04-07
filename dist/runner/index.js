import { generateObject, generateText } from 'ai';
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
    `[ai-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? "none"}, hasApiKey=${!!apiKey}`
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
    schemaBlock = `

\uC751\uB2F5 JSON Schema:
${JSON.stringify(jsonSchema, null, 2)}`;
  } catch {
  }
  const jsonInstruction = `${schemaBlock}

\uBC18\uB4DC\uC2DC \uC704 JSON Schema \uAD6C\uC870\uC5D0 \uC815\uD655\uD788 \uB9DE\uB294 \uC720\uD6A8\uD55C JSON\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694. \uB9C8\uD06C\uB2E4\uC6B4 \uCF54\uB4DC\uBE14\uB85D, \uC124\uBA85 \uD14D\uC2A4\uD2B8, \uC8FC\uC11D \uC5C6\uC774 \uC21C\uC218 JSON \uAC1D\uCCB4\uB9CC \uCD9C\uB825\uD558\uC138\uC694. \uBAA8\uB4E0 \uD544\uC218 \uD544\uB4DC\uB97C \uBE60\uC9D0\uC5C6\uC774 \uD3EC\uD568\uD558\uB418, \uAC01 \uD14D\uC2A4\uD2B8 \uD544\uB4DC\uB294 2~3\uBB38\uC7A5 \uC774\uB0B4\uB85C \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD558\uC138\uC694. JSON\uC774 \uC798\uB9AC\uC9C0 \uC54A\uB3C4\uB85D \uC804\uCCB4 \uC751\uB2F5\uC744 \uC644\uACB0\uB41C \uD615\uD0DC\uB85C \uCD9C\uB825\uD558\uC138\uC694.`;
  const systemWithJson = (options.systemPrompt ?? "") + jsonInstruction;
  const result = await generateText({
    model,
    system: systemWithJson,
    prompt,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal
  });
  console.log(
    `[ai-gateway] analyzeStructuredViaText: \uC751\uB2F5 \uC218\uC2E0 (finishReason=${result.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length})`
  );
  if (result.finishReason === "length") {
    console.warn(
      `[ai-gateway] \uC751\uB2F5\uC774 \uD1A0\uD070 \uC81C\uD55C\uC73C\uB85C \uC798\uB9BC (finishReason=length, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length}) \u2014 JSON \uBCF5\uAD6C \uC2DC\uB3C4`
    );
  }
  const jsonStr = extractJson(result.text);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    const truncatedHint = result.finishReason === "length" ? " [\uC6D0\uC778: \uC751\uB2F5\uC774 \uD1A0\uD070 \uC81C\uD55C(maxOutputTokens)\uC73C\uB85C \uC798\uB9BC \u2014 maxOutputTokens \uC99D\uAC00 \uAD8C\uC7A5]" : "";
    console.error(
      `[ai-gateway] JSON \uD30C\uC2F1 \uC2E4\uD328 \u2014 finishReason=${result.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length}${truncatedHint}`
    );
    console.error(`[ai-gateway] \uCD94\uCD9C\uB41C JSON (\uCC98\uC74C 500\uC790): ${jsonStr.substring(0, 500)}`);
    console.error(`[ai-gateway] \uC6D0\uBCF8 \uC751\uB2F5 (\uCC98\uC74C 500\uC790): ${result.text.substring(0, 500)}`);
    throw new Error(
      `JSON \uD30C\uC2F1 \uC2E4\uD328${truncatedHint}: ${e instanceof Error ? e.message : String(e)}
\uC751\uB2F5 \uD14D\uC2A4\uD2B8 (\uCC98\uC74C 500\uC790): ${result.text.substring(0, 500)}`,
      { cause: e }
    );
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    console.error(`[ai-gateway] Zod \uAC80\uC99D \uC2E4\uD328 \u2014 ${issues}`);
    console.error(
      `[ai-gateway] \uD30C\uC2F1\uB41C JSON \uD0A4: ${typeof parsed === "object" && parsed ? Object.keys(parsed).join(", ") : "N/A"}`
    );
    throw new Error(`JSON \uC2A4\uD0A4\uB9C8 \uAC80\uC99D \uC2E4\uD328: ${issues}`);
  }
  return {
    object: validated.data,
    usage: result.usage,
    finishReason: result.finishReason
  };
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

export { MAX_RATE_LIMIT_RETRIES, isRateLimitError, isServerOverloadError, parseRetryAfter, runModule, runWithProviderGrouping, sleep };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map