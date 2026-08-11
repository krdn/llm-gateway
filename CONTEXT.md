# @krdn/llm-gateway

A domain-agnostic, multi-provider LLM gateway library built on Vercel AI SDK v7. This file records the project's ubiquitous language so that architecture reviews and grilling sessions use one consistent vocabulary.

## Language

**Provider**:
A configured LLM backend the gateway can talk to (anthropic, openai, gemini, openrouter, ollama, claude-cli, …), described by a pure-data entry in `PROVIDER_REGISTRY`.
_Avoid_: vendor, backend, model (a Provider serves many Models)

**Provider capability**:
A pure-data fact about what a **Provider** can do — `supportsStructuredOutput`, `callMethod`, `accessMethod` — held in `provider-meta.ts` and kept SDK-import-free so it is safe in a browser bundle.
_Avoid_: feature flag, provider option

**Structured-output strategy**:
The technique used to obtain a Zod-validated object from a **Provider** — one of `native` (`generateText` + `Output.object`) or `text2step` (two `generateText` calls + JSON extraction). The strategy *identifier* is selected from **Provider capability** data; the strategy *execution* (call sequence, prompt shaping, usage normalization) lives in the SDK layer.
_Avoid_: mode, path, branch, fallback (text2step is one strategy, not a fallback-as-afterthought)

**Gateway**:
The provider-abstraction layer (`analyzeText`, `analyzeStructured`, `normalizeUsage`). Propagates failure by throwing; it does not convert failure to a status.
_Avoid_: client, service, SDK wrapper

**Runner**:
The module-execution engine (`runModule`). Owns retry timing, persistence, progress, and the **partial-failure** policy — it converts a thrown failure into `{ status: 'failed' }` so one module's failure never crashes a pipeline.
_Avoid_: orchestrator, executor, pipeline

**Module**:
A consumer-defined unit of analysis (`AnalysisModule<TInput, TResult>`) carrying a name, a target **Provider**/Model, a Zod schema, and prompt builders. The domain input shape is the consumer's, not the library's.
_Avoid_: task, job, analyzer

**Adapter**:
A dependency-injection seam the consumer fills — `ModelConfigAdapter` (module name → Provider/Model/key/URL) and `PipelineControlAdapter` (cancel/pause/cost-limit/event).
_Avoid_: plugin, provider (overloaded — reserve Provider for the LLM backend)

**Normalized usage**:
The single canonical token-count shape (`inputTokens`, `outputTokens`, `totalTokens`) that the gateway reports regardless of which **Structured-output strategy** ran, produced by `normalizeUsage()`.
_Avoid_: token count, usage stats

## Relationships

- A **Module** names exactly one **Provider** (resolved through a `ModelConfigAdapter`).
- A **Provider** has **Provider capabilities** that select one **Structured-output strategy**.
- The **Gateway** executes the selected **Structured-output strategy** and reports **Normalized usage**.
- The **Runner** invokes the **Gateway** per **Module** and owns **partial failure**; the **Gateway** only propagates.

## Example dialogue

> **Dev:** "anthropic is forced to `structuredOutputMode: 'jsonTool'` — does that make it its own **Structured-output strategy**?"
> **Maintainer:** "No. That's a provider-namespaced option *inside* the `native` strategy — anthropic's default `auto` picks a JSON Schema subset that rejects `minimum`/`maxItems`, so we pin classic tool_use to keep schema constraints. The call sequence is unchanged: one `generateText` with `Output.object`. A **Structured-output strategy** is distinguished by its *shape*, not its options — which is why only `text2step` is a separate one: it's a two-call sequence that pays a second LLM call by design."

## Flagged ambiguities

- "fallback" was used to mean both *the text2step strategy* and *retry-after-failure*. Resolved: **text2step** is a first-class **Structured-output strategy** (it pays a second LLM call by design); retry-after-failure belongs to the **Runner**, never the **Gateway**.
- "provider" was used for both the LLM backend and the DI adapters. Resolved: **Provider** = LLM backend only; the DI seams are **Adapters**.
- A `nativeJsonMode` strategy (native + `mode:'json'`) was considered, but AI SDK v6 dropped the `mode` option from `generateObject` — the flag was a silent no-op, so it was collapsed into `native`.
