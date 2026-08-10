<!-- Generated: 2026-07-18 | Files scanned: 7 (src/runner/, src/adapters/, src/types.ts) | Token estimate: ~600 -->

# Runner & Adapters

## Runner (`src/runner/`)

### run-module.ts (308줄) — 오케스트레이션

```
runModule<TInput, TResult>(module, input, opts?) → AnalysisModuleResult<TResult>
```

- 모든 옵션 선택적: configAdapter 없으면 module 자체의 provider/model 사용 (adapter 우선)
- `pipelineControl.checkCostLimit` pre-flight → `isCancelled` in-flight 폴링 (AbortSignal로 중단) → 외부 `abortSignal` 병합
- **절대 throw하지 않음**: 콜백 실패(extractMeta/onPersist/onProgress)는 가드; 분석 성공 후 persist 실패 → `completed` + `errorMessage`
- 이벤트 타입: `PersistEvent`, `ProgressEvent`

### retry-utils.ts (154줄) — 재시도 정책

```
retryWithPolicy(fn, opts) — 독립 예산 2개: rate-limit 지수 백오프 + server-overload
```

- 에러 분류: AI SDK 구조화 에러 우선 (`APICallError.statusCode`, `RetryError` unwrap, retry-after 헤더) → CLI 프록시는 메시지 정규식 폴백
- `MAX_RETRY_AFTER_MS`(5분): 일일 쿼터 에러가 수 시간 sleep하는 것 방지 — 즉시 실패
- `MAX_RATE_LIMIT_RETRIES = 5`; 예산 소진 시 원본 에러 rethrow
- 유틸: `isRateLimitError`, `isServerOverloadError`, `parseRetryAfter`, `sleep(ms, signal?)`

## Adapters (`src/adapters/`) — DI 인터페이스

| 파일 | 인터페이스 | 기본 구현 |
|------|-----------|----------|
| model-config.ts (112줄) | `ModelConfigAdapter` — 모듈명 → provider/model/apiKey/baseUrl/timeoutMs | `createInMemoryModelConfig` (override가 provider 전환 시 전환된 provider의 `providerDefaults` 적용) |
| pipeline-control.ts (34줄) | `PipelineControlAdapter` — cancel/pause/cost-limit | `noopPipelineControl` |

## Types (`src/types.ts`, 68줄)

- `AnalysisModule<TInput, TResult>`: `buildPrompt()` + `buildSystemPrompt()` + 기본 provider/model
- `AnalysisModuleResult<TResult>`: **discriminated union** on `status`
  - `completed` → `result`/`usage`(`ModuleUsage`) 보장
  - `failed`/`skipped` → `errorMessage` 보장
- `ModuleUsage = NormalizedUsage & { provider, model }`

## 책임 분리 (seam)

```
retryWithPolicy = 재시도 타이밍/판정  |  runModule = 오케스트레이션 (콜백·persist·취소 배관)
접점: runModule의 shouldAbort/onRetry 훅 + in-flight 취소 폴링
```
