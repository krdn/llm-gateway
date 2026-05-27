# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsup (ESM, dts, sourcemaps)
pnpm test             # Run all tests (vitest)
pnpm test -- src/gateway/get-model.test.ts  # Run a single test file
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint src
```

## Architecture

**@krdn/llm-gateway** is a domain-agnostic multi-provider LLM gateway library built on Vercel AI SDK v6. It has three modules, each with its own subpath export:

### Gateway (`src/gateway/`)

The AI provider abstraction layer.

- **`provider-meta.ts`** — Central registry (`PROVIDER_REGISTRY`) of all provider metadata: access method, structured output support, SDK call method (`direct` vs `chat`), default API keys, base URLs. Pure data — no SDK imports. Safe for browser bundles.
- **`model-factory.ts`** — `getModel()` factory + `SDK_MAP` + `DEFAULT_MODELS`. Registry-driven dispatcher for provider client creation. `gemini-cli` is the only special case (dynamic import for OAuth).
- **`json-repair.ts`** — `extractJson()` (LLM 텍스트에서 JSON 추출), `repairTruncatedJson()` (토큰 초과로 잘린 JSON 복구), `tryParseAndValidate()` (추출→파싱→Zod 검증).
- **`gateway.ts`** — Three public functions: `analyzeText()` (free text), `analyzeStructured()` (Zod-validated structured output), `normalizeUsage()` (token count normalization). Delegates model creation to `model-factory.ts` and JSON recovery to `json-repair.ts`.
- Providers that don't support `generateObject` (CLI proxies, Ollama, custom) automatically fall back to a 2-step text→JSON pipeline with truncated JSON repair.

### Runner (`src/runner/`)

Domain-agnostic module execution engine.

- **`run-module.ts`** — `runModule()` executes a single `AnalysisModule<TInput, TResult>` through the gateway. Delegates retry to `retryWithPolicy()`. Partial failure policy: never throws, always returns `AnalysisModuleResult`.
- **`retry-utils.ts`** — `retryWithPolicy()` (rate limit exponential backoff + server overload retry), error classification (`isRateLimitError`, `isServerOverloadError`), `parseRetryAfter`.

### Adapters (`src/adapters/`)

Dependency injection interfaces for external concerns:

- **`ModelConfigAdapter`** — Resolves module name → provider/model/apiKey/baseUrl. In-memory implementation provided (`createInMemoryModelConfig`).
- **`PipelineControlAdapter`** — Cancel/pause/cost-limit checks. Noop implementation provided.

### Types (`src/types.ts`)

- `AnalysisModule<TInput, TResult>` — Generic module interface with `buildPrompt()` and `buildSystemPrompt()`.
- `AnalysisModuleResult<TResult>` — Execution result with status, usage, and optional error.

## Key Design Decisions

- **Registry-driven provider dispatch**: `PROVIDER_REGISTRY` in `provider-meta.ts` holds all per-provider configuration. `getModel()` in `model-factory.ts` is a thin dispatcher that reads the registry + `SDK_MAP`. To add a new OpenAI-compatible provider, add an entry to the registry — no switch cases to modify.
- **`provider-meta.ts` has no SDK imports**: Keeps it safe for browser-side code that only needs provider metadata (display names, colors, capabilities).
- **`callMethod: 'direct' | 'chat'`**: Distinguishes `client(model)` (native SDKs) from `client.chat(model)` (OpenAI-compatible Chat Completions API). This prevents 405 errors from providers that don't support the Responses API.
- **Retry policy separation**: `retryWithPolicy()` in `retry-utils.ts` owns retry timing/decision. `runModule()` owns orchestration (callbacks, persist, progress). Seam is clean — cancel/pause checks live in `runModule`'s `shouldAbort`/`onRetry` hooks.
- **Partial failure**: `runModule()` catches errors and returns `{ status: 'failed' }` instead of throwing, so one module's failure doesn't crash the pipeline.

## Package Exports

```
@krdn/llm-gateway           # Everything
@krdn/llm-gateway/gateway   # Gateway only
@krdn/llm-gateway/adapters  # Adapter interfaces + in-memory implementations
@krdn/llm-gateway/runner    # runModule + retryWithPolicy + retry utils
```
