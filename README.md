# @krdn/llm-gateway

> **Note**: This package was previously published as `@krdn/ai-analysis-kit`. v3.0.0 is a rename with no API changes from v2.0.1.

도메인 무관 AI 분석 러너. 다중 프로바이더 게이트웨이, 제네릭 모듈 엔진, 어댑터 인터페이스를 제공합니다. 어떤 도메인이든 자기 입력 타입과 Zod 결과 스키마로 `AnalysisModule`을 정의해 `runModule()`로 실행할 수 있습니다.

## 특징

- **AI 프로바이더 게이트웨이**: Anthropic Claude, Google Gemini, OpenAI, Ollama, OpenRouter, DeepSeek, xAI, Gemini CLI, Claude CLI Proxy 통합
- **Vercel AI SDK v6** 기반 구조화 출력 (`generateObject`) + JSON 폴백
- **제네릭 모듈 엔진**: `AnalysisModule<TInput, TResult>` — 입력/결과 모두 도메인 자유
- **어댑터 패턴**: `ModelConfigAdapter`, `PipelineControlAdapter`, `ConcurrencyAdapter` — DB·취소·동시성 의존성을 인터페이스로 추상화
- **Rate limit / 서버 과부하 자동 재시도** (exponential backoff)
- **부분 실패 허용** — 실패한 모듈도 throw하지 않고 `failed` 상태 반환

## v1.x → v2.0.0 BREAKING CHANGES

본 패키지는 원래 `ai-signalcraft`(정치 여론 분석)에서 분리되었으며 v1.x는 12개 도메인 모듈을 함께 포함했습니다. v2.0.0부터는 **도메인 코드를 모두 제거**하고 순수한 인프라 라이브러리로 재정비되었습니다.

### 제거된 항목

- `./modules`, `./schemas` 서브경로 export
- 12개 정치 여론 분석 모듈 (`macroViewModule`, `riskMapModule`, …)
- 12개 Zod 스키마 (`MacroViewSchema`, …)
- `STAGE1_MODULES`, `STAGE2_MODULES`, `STAGE3_MODULES`, `STAGE4_PARALLEL`, `STAGE4_SEQUENTIAL`, `ALL_MODULES`
- `MODULE_MODEL_MAP`, `MODULE_NAMES`, `getModuleByName()`
- `AnalysisInput` 인터페이스 (articles/videos/comments 강제)
- CLI 도구 (`ai-analysis` bin) — 도메인 모듈 레지스트리에 의존했음

### 변경된 시그니처

```ts
// v1.x
interface AnalysisModule<T = unknown> {
  buildPrompt(data: AnalysisInput): string;  // ← 입력 형태 강제
}
function runModule<T>(module, input: AnalysisInput, options): ...

// v2.0.0
interface AnalysisModule<TInput = unknown, TResult = unknown> {
  buildPrompt(data: TInput): string;  // ← 도메인 자유
}
function runModule<TInput, TResult>(
  module: AnalysisModule<TInput, TResult>,
  input: TInput,
  options: RunModuleOptions<TInput>,  // ← extractMeta 콜백 필수
): Promise<AnalysisModuleResult<TResult>>
```

### 마이그레이션

v1.x에서 12개 모듈을 사용하던 프로젝트는 모듈/스키마 정의를 자체 저장소로 이전하고, `runModule` 호출 시 `extractMeta`를 추가하면 됩니다. 참고 구현: ai-signalcraft `packages/core/src/analysis/`.

## 설치

```json
{
  "dependencies": {
    "@krdn/llm-gateway": "github:krdn/ai-analysis-kit#v3.0.0"
  }
}
```

## 사용법

### 1. 모듈 정의

```ts
import { z } from 'zod';
import type { AnalysisModule } from '@krdn/llm-gateway';

interface MyInput {
  jobId: number;
  records: Array<{ text: string }>;
}

const ResultSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()),
});
type MyResult = z.infer<typeof ResultSchema>;

const summarizerModule: AnalysisModule<MyInput, MyResult> = {
  name: 'summarizer',
  displayName: '요약',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  schema: ResultSchema,
  buildSystemPrompt: () => '당신은 요약 전문가입니다.',
  buildPrompt: (data) =>
    `다음 ${data.records.length}건의 텍스트를 요약하세요:\n` +
    data.records.map((r, i) => `${i + 1}. ${r.text}`).join('\n'),
};
```

### 2. 모듈 실행

```ts
import { runModule, createInMemoryModelConfig } from '@krdn/llm-gateway';

const configAdapter = createInMemoryModelConfig({
  // 환경변수 ANTHROPIC_API_KEY 자동 사용
});

const result = await runModule(summarizerModule, myInput, {
  configAdapter,
  extractMeta: (input) => ({
    jobId: input.jobId,
    itemCount: input.records.length,
  }),
});

if (result.status === 'completed') {
  console.log(result.result?.summary);
}
```

### 3. 커스텀 ModelConfigAdapter (DB 기반)

```ts
import type { ModelConfigAdapter } from '@krdn/llm-gateway';

const dbAdapter: ModelConfigAdapter = {
  async resolve(moduleName) {
    const row = await db.query.modelConfigs.findFirst(/* ... */);
    return {
      provider: row.provider,
      model: row.model,
      apiKey: row.apiKey,
      baseUrl: row.baseUrl,
    };
  },
};
```

### 4. onPersist 콜백으로 결과 저장

```ts
await runModule(summarizerModule, input, {
  configAdapter,
  extractMeta: (i) => ({ jobId: i.jobId, itemCount: i.records.length }),
  onPersist: async (event) => {
    if (event.status === 'completed') {
      await db.insert(results).values({
        jobId: event.jobId,
        module: event.module,
        result: event.result,
        usage: event.usage,
      });
    }
  },
});
```

### 5. 파이프라인 제어 (취소 / 일시정지)

```ts
import type { PipelineControlAdapter } from '@krdn/llm-gateway';

const pipelineControl: PipelineControlAdapter = {
  isCancelled: async (jobId) => false,
  waitIfPaused: async (jobId) => undefined,
  checkCostLimit: async () => true,
  appendEvent: async (jobId, level, message) => undefined,
};

await runModule(module, input, { configAdapter, pipelineControl, extractMeta });
```

### 6. 프로바이더별 동시성 제어

```ts
import { runWithProviderGrouping, createStaticConcurrency } from '@krdn/llm-gateway';

const concurrency = createStaticConcurrency({ anthropic: 2, gemini: 4 });

const results = await runWithProviderGrouping(
  modules,
  (m) => runModule(m, input, { configAdapter, extractMeta }),
  concurrency,
);
```

## API

| Symbol | 서브경로 | 용도 |
|---|---|---|
| `runModule` | `runner` | 단일 모듈 실행 (재시도 + persist + progress) |
| `runWithProviderGrouping` | `runner` | 프로바이더별 동시성 제한 실행 |
| `AnalysisModule<TInput, TResult>` | root | 모듈 인터페이스 (제네릭) |
| `AnalysisModuleResult<TResult>` | root | 실행 결과 타입 |
| `AnalysisInputMeta` | root | extractMeta 반환 타입 (`jobId`, `itemCount`) |
| `RunModuleOptions<TInput>` | `runner` | runModule 옵션 |
| `PersistEvent`, `ProgressEvent` | `runner` | 콜백 이벤트 타입 |
| `ModelConfigAdapter`, `createInMemoryModelConfig` | `adapters` | 모듈→모델 해석 |
| `PipelineControlAdapter`, `noopPipelineControl` | `adapters` | 취소/일시정지 |
| `ConcurrencyAdapter`, `createStaticConcurrency` | `adapters` | 동시성 제한 |
| `analyzeText`, `analyzeStructured`, `normalizeUsage` | `gateway` | AI Gateway 저수준 API |
| `PROVIDER_REGISTRY`, `AIProvider`, `getProvidersByAccess` | `gateway` | 프로바이더 메타데이터 |
| `isRateLimitError`, `parseRetryAfter`, `MAX_RATE_LIMIT_RETRIES` | `runner` | 재시도 유틸 |

### 서브경로

```ts
import { ... } from '@krdn/llm-gateway';            // 전체
import { ... } from '@krdn/llm-gateway/gateway';    // 게이트웨이만
import { ... } from '@krdn/llm-gateway/runner';     // 러너만
import { ... } from '@krdn/llm-gateway/adapters';   // 어댑터만
```

## 라이선스

MIT
