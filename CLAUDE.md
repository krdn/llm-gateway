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
- **`gateway.ts`** — Three public functions: `analyzeText()` (free text), `analyzeStructured()` (Zod-validated structured output), `normalizeUsage()` (token count normalization). Uses `SDK_MAP` + registry-driven dispatcher for provider client creation. `gemini-cli` is the only special case (dynamic import for OAuth).
- Providers that don't support `generateObject` (CLI proxies, Ollama, custom) automatically fall back to a 2-step text→JSON pipeline with truncated JSON repair.

### Runner (`src/runner/`)

Domain-agnostic module execution engine.

- **`run-module.ts`** — `runModule()` executes a single `AnalysisModule<TInput, TResult>` through the gateway with retry logic (rate limit exponential backoff, server overload fixed delay). Partial failure policy: never throws, always returns `AnalysisModuleResult`.
- **`concurrency.ts`** — `runWithProviderGrouping()` batches modules by provider concurrency limits.
- **`retry-utils.ts`** — Error classification (`isRateLimitError`, `isServerOverloadError`) and `parseRetryAfter`.

### Adapters (`src/adapters/`)

Dependency injection interfaces for external concerns:

- **`ModelConfigAdapter`** — Resolves module name → provider/model/apiKey/baseUrl. In-memory implementation provided (`createInMemoryModelConfig`).
- **`PipelineControlAdapter`** — Cancel/pause/cost-limit checks. Noop implementation provided.
- **`ConcurrencyAdapter`** — Per-provider concurrency limits. Static implementation provided.

### Types (`src/types.ts`)

- `AnalysisModule<TInput, TResult>` — Generic module interface. Consumers define their own input/result types.
- `AnalysisModuleResult<TResult>` — Execution result with status, usage, and optional error.

## Key Design Decisions

- **Registry-driven provider dispatch**: `PROVIDER_REGISTRY` in `provider-meta.ts` holds all per-provider configuration. `getModel()` in `gateway.ts` is a thin dispatcher that reads the registry + `SDK_MAP`. To add a new OpenAI-compatible provider, add an entry to the registry — no switch cases to modify.
- **`provider-meta.ts` has no SDK imports**: Keeps it safe for browser-side code that only needs provider metadata (display names, colors, capabilities).
- **`callMethod: 'direct' | 'chat'`**: Distinguishes `client(model)` (native SDKs) from `client.chat(model)` (OpenAI-compatible Chat Completions API). This prevents 405 errors from providers that don't support the Responses API.
- **Partial failure**: `runModule()` catches errors and returns `{ status: 'failed' }` instead of throwing, so one module's failure doesn't crash the pipeline.

## Package Exports

```
@krdn/llm-gateway           # Everything
@krdn/llm-gateway/gateway   # Gateway only
@krdn/llm-gateway/adapters  # Adapter interfaces + in-memory implementations
@krdn/llm-gateway/runner    # runModule + concurrency + retry utils
```
