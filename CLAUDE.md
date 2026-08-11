# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsup (ESM, dts, sourcemaps)
pnpm test             # Run all tests (vitest)
pnpm test -- src/gateway/get-model.test.ts  # Run a single test file
pnpm test:coverage    # Coverage (v8). barrel/types.ts는 계측 제외 — vitest.config.ts
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint src
```

## Architecture

**@krdn/llm-gateway** is a domain-agnostic multi-provider LLM gateway library built on Vercel AI SDK v7. It has three modules, each with its own subpath export:

### Gateway (`src/gateway/`)

The AI provider abstraction layer.

- **`provider-meta.ts`** — Central registry (`PROVIDER_REGISTRY`, readonly) of all provider metadata: access method, structured output support, SDK call method (`direct` vs `chat`), default API keys (keyless **local** servers only — ollama/custom; `claude-cli` is NOT keyless: cli-proxy-api validates `config.yaml` api-keys, so apiKey is required), base URLs. Pure data — no SDK imports. Safe for browser bundles. `requiresApiKey`/`requiresBaseUrl` are consumer-facing metadata (UI form validation 등) — the runtime check in `getModel` is mechanically driven by `defaultApiKey`/`defaultBaseUrl` presence; the alignment between the two is enforced by `provider-meta.test.ts` invariant tests.
- **`model-factory.ts`** — `getModel()` factory + `SDK_MAP` + `DEFAULT_MODELS`. Registry-driven dispatcher for provider client creation that **enforces registry invariants**: unknown provider, missing model (no default), missing apiKey (chat providers without a `defaultApiKey`), and missing baseUrl all throw descriptive errors instead of falling back silently. `gemini-cli` is the only special case (dynamic import of the optional peer dependency `ai-sdk-provider-gemini-cli`; **local `~/.gemini` OAuth 전용 — baseUrl/apiKey 인자는 무시되며 cli-proxy-api와 무관한 별도 크레덴셜/쿼터 경로**).
- **`strategies.ts`** — `executeStructured(provider, model, schema, opts)`: branches on provider capability. Native path uses `generateText` + `Output.object` (AI SDK v7; `generateObject` is deprecated). Fallback path (`executeText2Step`) is a 2-call text→JSON pipeline for CLI proxies/Ollama/custom. Its prompt schema hint is built by `buildSchemaBlock()`, which **branches at runtime**: zod v3 keeps the legacy `zodToJsonSchema(target:'openApi3')` output (prompt bytes unchanged for existing consumers), everything else (zod v4, `Schema`, StandardSchema) goes through `asSchema().jsonSchema` — `zod-to-json-schema` 3.25.x returns `{}` for v4 schemas **without throwing**, so try/catch cannot detect it. An empty conversion omits the schema section entirely rather than embedding `{}`. Both return `{ object, usage: NormalizedUsage, finishReason }`. On double failure, the thrown error carries each step's parse/validation reason and finishReason.
- **`json-repair.ts`** — `extractJson()` (LLM 텍스트에서 JSON 추출), `repairTruncatedJson()` (escape-aware 단일 스캔으로 토큰 초과 절단 복구 — 문자열 중간 절단 포함), `tryParseAndValidate()` (추출→파싱→검증, `{ ok, data | reason }` 반환; **async** — 검증은 `asSchema().validate`를 거쳐 zod v3·v4를 한 경로로 다룬다).
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

## Testing

Most suites mock `ai` wholesale (`vi.mock('ai')` replacing `generateText`), which pins *how we call* the SDK but not *what the SDK does* with those arguments.

**`src/gateway/sdk-contract.test.ts` is the exception and must stay that way**: it does NOT mock `ai`. Only the `@ai-sdk/*` factories are mocked, returning a `MockLanguageModelV4` from `ai/test`, so real `generateText` / `Output.object` / `asSchema` execute. It is a canary for SDK upgrades, not a second coverage layer — it pins the layers a major bump moves: `Output.object` → `responseFormat` JSON Schema (including constraints like `minimum`/`maxLength`), provider's nested usage → flat `NormalizedUsage`, the output-resolve condition, and which error type surfaces. Keep the mock's spec version aligned with what real providers use (`createAnthropic({apiKey:'x'})('m').specificationVersion` — `v4` on `ai@7`); a mismatched mock silently tests a path consumers never take. Do not mix it into a file that mocks `ai` — `vi.mock` hoists per module.

**Which layer a regression belongs in.** If the behavior depends on what the SDK returns or raises — response shape, error type, `responseFormat`, usage normalization, `finishReason` handling — it goes in `sdk-contract.test.ts`. If it only concerns our own orchestration (argument assembly, callbacks, retry/cancel plumbing, adapter wiring), the `vi.mock('ai')` suites are the right place and are worth keeping for their speed and determinism. Adding an SDK-shape regression to a `vi.mock('ai')` suite produces a test that passes no matter what the SDK does — that is exactly how the native-truncation usage loss stayed invisible until 4.1.2.

**What the contract layer does NOT cover** (do not over-read a green run): the real `@ai-sdk/*` packages' own translation (providerOptions → HTTP body, headers, per-provider raw usage shapes), network behavior, and changes to `ai/test`'s mock classes themselves. A major bump where core is stable but a provider package breaks will not show up here — verify SDK majors additionally by typechecking consumer usage against the built `dist/*.d.ts` and, where possible, one real-provider smoke run.

## Release / CI

- `ci.yml`: typecheck → lint (`--max-warnings 0`) → test → build, on Node **22 and 24** (matrix). pnpm version comes from `packageManager` in package.json (single source of truth).
- `dist-freshness` job (tags only): rebuilds and `git diff`s `dist/`. This repo commits `dist` per release to support Git-URL installs (`github:krdn/llm-gateway#vX.Y.Z`) and a real consumer uses that path — v4.1.1 shipped a stale `dist` before this guard existed. It runs on tags only so the existing "commit at release" convention isn't silently turned into "commit always". Valid because tsup output is deterministic and sourcemap `sources` are relative.
- `publish.yml`: GitHub release → npm publish (with provenance) → consumer repository-dispatch (`notify` job runs only after publish succeeds). `notify` currently fails on an expired `CONSUMER_DISPATCH_PAT`; `publish` itself is unaffected.
- `zod` is a peerDependency (+devDependency), **v3 and v4 both supported** (`^3.25.76 || ^4.1.8`, mirroring `ai@7`); `ai-sdk-provider-gemini-cli` is an **optional** peerDependency (dynamic import).
- Node floor is `>=22.0.0` — Node 20 hit EOL 2026-04-30 and `ai@7` itself requires `>=22`.
- `.npmrc` sets `auto-install-peers=false` **on purpose**. pnpm 10 otherwise installs even *optional* peers, which pulled the whole `@google/gemini-cli-core` tree (hono, protobufjs, simple-git, shell-quote — the source of nearly every development-scope Dependabot alert) into every dev install. With it off, `ai-sdk-provider-gemini-cli` stays uninstalled and its types come from the ambient declaration in `src/types/`; `zod` still resolves because it is also a devDependency. Removing this line silently restores ~500 packages and those alerts. Consumers are unaffected — `.npmrc` is repo-local (never read from a dependency) and `peerDependencies` still advertises the optional package. Note that `auto-install-peers` is a pnpm-only key, so `npm` prints `Unknown project config` when run inside this repo; harmless here since pnpm is the pinned package manager and npm is only used for read-only queries.

Note when inspecting build output: tsup escapes non-ASCII string literals — Korean text becomes `\uXXXX` sequences in `dist/*.js`. Grepping `dist/` for a Korean literal silently finds nothing even when the code is there; match on ASCII fragments (e.g. `finishReason=`) or decode the file first.
