# @krdn/llm-gateway

> **Note**: This package was previously published as `@krdn/ai-analysis-kit`. v3.0.0 is a rename with no API changes from v2.0.1.

도메인 무관 AI 분석 러너. 다중 프로바이더 게이트웨이, 제네릭 모듈 엔진, 어댑터 인터페이스를 제공합니다. 어떤 도메인이든 자기 입력 타입과 Zod 결과 스키마로 `AnalysisModule`을 정의해 `runModule()`로 실행할 수 있습니다.

## 특징

- **AI 프로바이더 게이트웨이**: Anthropic Claude, Google Gemini, OpenAI, Ollama, OpenRouter, DeepSeek, xAI, Gemini CLI, Claude CLI Proxy 통합
- **Vercel AI SDK v6** 기반 구조화 출력 (`generateText` + `Output.object`) + 미지원 프로바이더용 텍스트 2-call 폴백 (잘린 JSON 자동 복구 포함)
- **제네릭 모듈 엔진**: `AnalysisModule<TInput, TResult>` — 입력/결과 모두 도메인 자유
- **어댑터 패턴**: `ModelConfigAdapter`, `PipelineControlAdapter` — DB·취소·비용 한도 의존성을 인터페이스로 추상화
- **Rate limit / 서버 과부하 자동 재시도** (exponential backoff, retry-after 상한으로 일일 쿼터 폭주 방지)
- **부분 실패 허용** — 실패한 모듈도 throw하지 않고 `failed` 상태 반환 (discriminated union)
- **취소/타임아웃 전파** — `abortSignal`/`timeoutMs`가 진행 중인 LLM 호출까지 중단

## v4.0.0 주요 변경 (BREAKING)

- `AnalysisModuleResult`가 **discriminated union**이 됨 — `status === 'completed'`로 좁히면 `result`/`usage`가 non-null로 보장
- `runModule`의 `configAdapter`/`extractMeta`가 **선택**이 됨 — 없으면 `module.provider`/`module.model` 사용 (어댑터가 있으면 어댑터가 우선)
- 잘못된 설정을 침묵으로 가리던 폴백 제거 — 알 수 없는 provider·기본 모델 없는 provider의 model 미지정·`custom`의 baseUrl 누락·유료 API의 apiKey 누락은 **명시적 에러**
- `analyzeText`의 usage에 정규화 필드(`inputTokens`/`outputTokens`/`totalTokens`) 보장 (원본 필드는 보존)
- 라이브러리가 콘솔에 로그를 찍지 않음 — 진단 정보는 에러 메시지와 `onProgress` 콜백으로 전달
- `gemini-cli` 사용 시 `ai-sdk-provider-gemini-cli`를 소비자가 직접 설치 (선택적 peerDependency)
- `requiresJsonMode`/`needsJsonMode` 제거 (AI SDK v6가 모드를 내부 선택)
- Node **20.3.0 이상** 필요 (`AbortSignal.any`)

자세한 내역은 [CHANGELOG.md](./CHANGELOG.md) 참고.

## 설치

```bash
pnpm add @krdn/llm-gateway zod@^3.24
```

> **zod는 3.x 전용** (`^3.24`) — zod 4는 미지원. 배포 타입 선언이 zod 3의 `z.ZodTypeDef`를 사용하고,
> text2step 폴백이 의존하는 `zod-to-json-schema`가 zod 4 스키마를 지원하지 않는다.
> pnpm은 peer 불일치를 **경고만** 하고 설치를 진행하므로, zod 4를 설치하면 typecheck/런타임 오류로 직행한다.

`gemini-cli` 프로바이더를 쓸 경우에만 추가로:

```bash
pnpm add ai-sdk-provider-gemini-cli
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

### 2. 모듈 실행 (최소 구성)

옵션 없이 실행하면 모듈 자신의 `provider`/`model`을 사용하고,
API 키는 AI SDK의 환경변수 폴백(`ANTHROPIC_API_KEY` 등)을 따릅니다.

```ts
import { runModule } from '@krdn/llm-gateway';

const result = await runModule(summarizerModule, myInput);

if (result.status === 'completed') {
  // discriminated union — result/usage가 non-null로 보장됨
  console.log(result.result.summary);
  console.log(result.usage.totalTokens);
}
```

### 3. ModelConfigAdapter로 모델 설정 오버라이드

어댑터를 지정하면 어댑터의 해석 결과가 모듈 필드보다 우선합니다.

```ts
import { runModule, createInMemoryModelConfig } from '@krdn/llm-gateway';

const configAdapter = createInMemoryModelConfig({
  modules: {
    summarizer: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  },
  // providerDefaults/overrides로 apiKey·baseUrl·timeoutMs 지정 가능
});

const result = await runModule(summarizerModule, myInput, {
  configAdapter,
  extractMeta: (input) => ({
    jobId: input.jobId,
    itemCount: input.records.length, // 0이면 자동 skip
  }),
});
```

DB 기반 커스텀 어댑터:

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

콜백이 throw해도 모듈 실행은 중단되지 않습니다. 분석 성공 후 저장만 실패하면
`status: 'completed'` + `errorMessage`(저장 실패 사유)로 반환됩니다.

### 5. 파이프라인 제어 (취소 / 일시정지 / 비용 한도)

```ts
import type { PipelineControlAdapter } from '@krdn/llm-gateway';

const pipelineControl: PipelineControlAdapter = {
  isCancelled: async (jobId) => false,   // true면 진행 중 호출도 abort
  waitIfPaused: async (jobId) => undefined,
  checkCostLimit: async (jobId) => true, // false면 모듈 실행 전 중단
  appendEvent: async (jobId, level, message) => undefined,
};

await runModule(module, input, { pipelineControl });
```

외부에서 직접 취소하거나 모듈별 타임아웃을 걸 수도 있습니다:

```ts
const controller = new AbortController();
await runModule(module, input, { abortSignal: controller.signal });
// 또는 ResolvedModelConfig.timeoutMs로 모듈별 타임아웃 지정
```

## API

| Symbol | 서브경로 | 용도 |
|---|---|---|
| `runModule` | `runner` | 단일 모듈 실행 (재시도 + persist + progress) |
| `retryWithPolicy`, `RetryPolicyOptions` | `runner` | rate limit/과부하 재시도 정책 |
| `isRateLimitError`, `isServerOverloadError`, `parseRetryAfter` | `runner` | 에러 분류 유틸 |
| `MAX_RATE_LIMIT_RETRIES`, `MAX_RETRY_AFTER_MS`, `sleep` | `runner` | 재시도 상수/유틸 |
| `RunModuleOptions<TInput>` | `runner` | runModule 옵션 |
| `PersistEvent`, `ProgressEvent` | `runner` | 콜백 이벤트 타입 |
| `AnalysisModule<TInput, TResult>` | root | 모듈 인터페이스 (제네릭) |
| `AnalysisModuleResult<TResult>` | root | 실행 결과 discriminated union |
| `ModuleUsage` | root | 모듈 usage 타입 (`NormalizedUsage` + provider/model) |
| `AnalysisInputMeta` | root | extractMeta 반환 타입 (`jobId`, `itemCount`) |
| `ModelConfigAdapter`, `ResolvedModelConfig`, `createInMemoryModelConfig` | `adapters` | 모듈→모델 해석 |
| `PipelineControlAdapter`, `noopPipelineControl` | `adapters` | 취소/일시정지/비용 한도 |
| `analyzeText`, `analyzeStructured` | `gateway` | AI Gateway 저수준 API |
| `AnalyzeTextResult`, `AIGatewayOptions` | `gateway` | 게이트웨이 옵션/결과 타입 |
| `normalizeUsage`, `NormalizedUsage` | `gateway` | usage 정규화 |
| `PROVIDER_REGISTRY`, `AIProvider`, `AI_PROVIDER_VALUES` | `gateway` | 프로바이더 메타데이터 |
| `getProvidersByAccess`, `isProxyCli`, `needsTextFallback` | `gateway` | 메타데이터 헬퍼 |
| `AccessMethod`, `CallMethod`, `ProviderMeta` | `gateway` | 메타데이터 타입 |

### 서브경로

```ts
import { ... } from '@krdn/llm-gateway';            // 전체
import { ... } from '@krdn/llm-gateway/gateway';    // 게이트웨이만
import { ... } from '@krdn/llm-gateway/runner';     // 러너만
import { ... } from '@krdn/llm-gateway/adapters';   // 어댑터만
```

## 구조화 출력 (Anthropic) — v3.4.0

구조화 출력을 네이티브 지원하는 프로바이더는 `analyzeStructured`가 Vercel AI SDK v6의 `generateText` + `Output.object`로 처리한다(미지원 프로바이더는 text2step — `generateText` 2회 + JSON 파싱).

**Anthropic은 `structuredOutputMode: 'jsonTool'`(classic tool_use)로 강제한다.** `@ai-sdk/anthropic`의 기본값 `auto`는 신형 `output_config.format`(Anthropic structured outputs)을 선택하는데, 이 경로는 JSON Schema 부분집합만 허용해 다음을 거부한다:

- `number`의 `minimum` / `maximum`
- `array`의 `minItems`(0 또는 1 외의 값)

classic tool_use는 표준 JSON Schema를 그대로 받으므로 스키마 제약(`z.number().min().max()`, `z.array().min(2)` 등)이 보존되고, **`cli-proxy-api`(Claude Max 플랜 프록시) 경유 시에도** 구조화 출력이 정상 동작한다. anthropic 외 프로바이더는 provider-namespaced 옵션이라 영향 없음.

> 소비 측(ai-signalcraft)에서 `provider: 'anthropic'` + `baseUrl`을 프록시로 지정하면 별도 설정 없이 이 동작이 적용된다.

## 라이선스

MIT
