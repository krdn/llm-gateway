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

- **`provider-meta.ts`** — Central registry (`PROVIDER_REGISTRY`, readonly) of all provider metadata: access method, structured output support, SDK call method (`direct` vs `chat`), default API keys (keyless **local** servers only — ollama/custom; `claude-cli` is NOT keyless: cli-proxy-api validates `config.yaml` api-keys, so apiKey is required), base URLs. Pure data — no SDK imports. Safe for browser bundles. `requiresApiKey`/`requiresBaseUrl` are consumer-facing metadata (UI form validation 등) — the runtime check in `getModel` is mechanically driven by `defaultApiKey`/`defaultBaseUrl` presence; the alignment between the two is enforced by `provider-meta.test.ts` invariant tests.
- **`model-factory.ts`** — `getModel()` factory + `SDK_MAP` + `DEFAULT_MODELS`. Registry-driven dispatcher for provider client creation that **enforces registry invariants**: unknown provider, missing model (no default), missing apiKey (chat providers without a `defaultApiKey`), and missing baseUrl all throw descriptive errors instead of falling back silently. `gemini-cli` is the only special case (dynamic import of the optional peer dependency `ai-sdk-provider-gemini-cli`; **local `~/.gemini` OAuth 전용 — baseUrl/apiKey 인자는 무시되며 cli-proxy-api와 무관한 별도 크레덴셜/쿼터 경로**).
- **`strategies.ts`** — `executeStructured(provider, model, schema, opts)`: branches on provider capability. Native path uses `generateText` + `Output.object` (AI SDK v6; `generateObject` is deprecated). Fallback path (`executeText2Step`) is a 2-call text→JSON pipeline for CLI proxies/Ollama/custom. Both return `{ object, usage: NormalizedUsage, finishReason }`. On double failure, the thrown error carries each step's parse/validation reason and finishReason.
- **`json-repair.ts`** — `extractJson()` (LLM 텍스트에서 JSON 추출), `repairTruncatedJson()` (escape-aware 단일 스캔으로 토큰 초과 절단 복구 — 문자열 중간 절단 포함), `tryParseAndValidate()` (추출→파싱→Zod 검증, `{ ok, data | reason }` 반환).
- **`normalize-usage.ts`** — `normalizeUsage(usage: unknown)`: provider별 usage 필드명 차이 정규화. gateway.ts와 strategies.ts가 공유 (순환 의존 방지용 분리).
- **`gateway.ts`** — Two public entrypoints: `analyzeText()` (free text; usage = provider raw fields merged with normalized fields) and `analyzeStructured()` (Zod-validated structured output; usage = `NormalizedUsage`). Merges external abort signals with the timeout via `AbortSignal.any`. No console output anywhere in the library — diagnostics travel in error messages and runner callbacks.

### Runner (`src/runner/`)

Domain-agnostic module execution engine.

- **`run-module.ts`** — `runModule()` executes a single `AnalysisModule<TInput, TResult>` through the gateway. All options are optional: without `configAdapter` the module's own `provider`/`model` are used (adapter wins when present); without `extractMeta`, jobId=0/itemCount=1. Honors `pipelineControl.checkCostLimit` pre-flight, polls `isCancelled` during in-flight calls (aborts via `AbortSignal`), and accepts an external `abortSignal`. Partial failure policy: **never throws** — callback failures (`extractMeta`/`onPersist`/`onProgress`) are guarded; a persist failure after successful analysis returns `completed` + `errorMessage`.
- **`retry-utils.ts`** — `retryWithPolicy()` (independent budgets: rate limit exponential backoff + server overload retry; exhaustion rethrows the original error). Error classification prefers AI SDK structured errors (`APICallError.statusCode`, `RetryError` unwrapping, retry-after header) and falls back to message regexes for CLI proxies. `MAX_RETRY_AFTER_MS` caps provider-supplied waits (daily-quota errors fail fast instead of sleeping hours).

### Adapters (`src/adapters/`)

Dependency injection interfaces for external concerns:

- **`ModelConfigAdapter`** — Resolves module name → provider/model/apiKey/baseUrl/timeoutMs. In-memory implementation provided (`createInMemoryModelConfig`); when an override switches providers, the switched provider's `providerDefaults` apply.
- **`PipelineControlAdapter`** — Cancel/pause/cost-limit checks. Noop implementation provided.

### Types (`src/types.ts`)

- `AnalysisModule<TInput, TResult>` — Generic module interface with `buildPrompt()` and `buildSystemPrompt()`, plus default `provider`/`model` (used when no configAdapter is given).
- `AnalysisModuleResult<TResult>` — **Discriminated union** on `status`: `completed` guarantees `result`/`usage` (`ModuleUsage`); `failed`/`skipped` guarantee `errorMessage`.

## Key Design Decisions

- **Registry-driven provider dispatch**: `PROVIDER_REGISTRY` in `provider-meta.ts` holds all per-provider configuration. `getModel()` in `model-factory.ts` is a thin dispatcher that reads the registry + `SDK_MAP`. To add a new OpenAI-compatible provider, add an entry to the registry — no switch cases to modify.
- **Registry invariants are enforced at `getModel`** (the single funnel point): misconfiguration surfaces as a descriptive error immediately, never as a silent fallback (wrong model name, fake API key, localhost base URL) that fails later with an opaque provider error. Direct providers (anthropic/openai/gemini) intentionally allow a missing apiKey so the AI SDK's env-var fallback works.
- **`provider-meta.ts` has no SDK imports**: Keeps it safe for browser-side code that only needs provider metadata (display names, colors, capabilities). `sideEffects: false` in package.json lets consumer bundlers tree-shake accordingly.
- **`callMethod: 'direct' | 'chat'`**: Distinguishes `client(model)` (native SDKs) from `client.chat(model)` (OpenAI-compatible Chat Completions API). This prevents 405 errors from providers that don't support the Responses API.
- **Retry policy separation**: `retryWithPolicy()` in `retry-utils.ts` owns retry timing/decision. `runModule()` owns orchestration (callbacks, persist, progress, cancellation plumbing). Seam is clean — cancel/pause checks live in `runModule`'s `shouldAbort`/`onRetry` hooks plus an in-flight cancellation poll.
- **Partial failure**: `runModule()` catches errors and returns `{ status: 'failed' }` instead of throwing, so one module's failure doesn't crash the pipeline. Parse/validation failures are NOT retried (only rate limit / overload are) — a failed parse costs money, so it propagates immediately.
- **No console output in library code**: diagnostics belong to thrown errors and the `onProgress` seam; a published library must not pollute consumer stdout/stderr.

## Package Exports

```
@krdn/llm-gateway           # Everything
@krdn/llm-gateway/gateway   # Gateway only
@krdn/llm-gateway/adapters  # Adapter interfaces + in-memory implementations
@krdn/llm-gateway/runner    # runModule + retryWithPolicy + retry utils
```

## Release / CI

- `ci.yml`: typecheck → lint (`--max-warnings 0`) → test → build. pnpm version comes from `packageManager` in package.json (single source of truth).
- `publish.yml`: GitHub release → npm publish (with provenance) → consumer repository-dispatch (`notify` job runs only after publish succeeds).
- `zod` is a peerDependency (+devDependency); `ai-sdk-provider-gemini-cli` is an **optional** peerDependency (dynamic import).
