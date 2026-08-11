# @krdn/llm-gateway

도메인 무관 멀티 프로바이더 LLM 게이트웨이. Anthropic·OpenAI·Gemini·DeepSeek·xAI·OpenRouter·Ollama와
CLI 프록시를 하나의 인터페이스로 다루고, 구조화 출력·재시도·토큰 집계·취소를 라이브러리가 맡습니다.

어떤 도메인이든 자기 입력 타입과 Zod 결과 스키마로 `AnalysisModule`을 정의해 `runModule()`로 실행합니다.

```bash
pnpm add @krdn/llm-gateway zod
```

Node **22.0.0 이상**. `zod`는 peer dependency이며 **v3·v4를 모두 지원**합니다
(`^3.25.76 || ^4.1.8` — 의존하는 `ai@7`의 범위와 동일. 하한이 3.25.76인 이유는 그 미만에서
`ai`의 peer가 깨지기 때문입니다). `zod/v3`·`zod/v4` 서브패스로 만든 스키마도 그대로 받습니다.

`gemini-cli` 프로바이더를 쓸 때만 추가로 `pnpm add ai-sdk-provider-gemini-cli` (선택적 peer).

---

## 60초 퀵스타트

가장 짧은 경로는 게이트웨이를 직접 부르는 것입니다. 환경변수 `ANTHROPIC_API_KEY`만 있으면 됩니다.

```ts
import { analyzeStructured } from '@krdn/llm-gateway';
import { z } from 'zod';

const { object, usage } = await analyzeStructured(
  '다음 문장의 감정과 핵심어를 뽑아줘: "배송이 빨라서 좋았어요"',
  z.object({
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    keywords: z.array(z.string()),
  }),
);

console.log(object.sentiment);      // 'positive'
console.log(usage.totalTokens);     // number
```

반복 실행할 분석 작업이라면 **모듈**로 정의해 `runModule()`에 넘깁니다. 재시도·취소·저장 콜백이
따라옵니다 — 아래 [러너로 실행하기](#러너로-실행하기)로.

---

## 두 개의 계층

| 계층 | 진입점 | 하는 일 | 실패하면 |
|---|---|---|---|
| **Gateway** | `analyzeText`, `analyzeStructured` | 프로바이더 추상화, 구조화 출력, usage 정규화 | **throw 한다** |
| **Runner** | `runModule` | 게이트웨이 호출 + 재시도·취소·저장·진행 콜백 | **throw 하지 않는다** — `{ status: 'failed' }` 반환 |

게이트웨이는 얇은 함수 두 개이고 상태가 없습니다. 러너는 그 위에 운영 관심사(재시도, 부분 실패,
파이프라인 제어)를 얹습니다. 한 번 호출하고 끝이면 게이트웨이를, 파이프라인의 한 단계라면 러너를 쓰세요.

---

## 게이트웨이 직접 쓰기

### `analyzeText(prompt, options?)`

자유 텍스트 응답.

```ts
import { analyzeText } from '@krdn/llm-gateway';

const { text, usage, finishReason } = await analyzeText('한 문장으로 요약해줘: ...', {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  systemPrompt: '너는 간결한 요약가다.',
  maxOutputTokens: 2048,
  timeoutMs: 60_000,
});
```

`usage`는 **프로바이더 원본 필드에 정규화 필드를 병합**한 형태입니다 — 원본 키를 그대로 두면서
`inputTokens`/`outputTokens`/`totalTokens` 세 개를 항상 숫자로 보장합니다.

### `analyzeStructured(prompt, schema, options?)`

Zod 스키마로 검증된 객체를 반환합니다. 반환 usage는 전략과 무관하게 항상 `NormalizedUsage` 형태입니다.

```ts
const { object, usage, finishReason } = await analyzeStructured(prompt, MySchema, {
  provider: 'claude-cli',
  model: 'claude-sonnet-5',
  baseUrl: 'http://localhost:8317',
  apiKey: process.env.CLI_PROXY_API_KEY,
});
```

프로바이더가 구조화 출력을 네이티브 지원하면 `generateText` + `Output.object` 한 번으로 끝나고,
지원하지 않으면(`claude-cli`·`gemini-cli`·`ollama`·`custom`) **자동으로 2-call 폴백**을 탑니다:
텍스트를 받아 JSON을 추출하고, 잘린 JSON은 복구를 시도한 뒤 스키마로 검증합니다.
호출자가 분기할 필요는 없지만, **폴백 경로는 LLM을 두 번 호출하므로 비용이 약 2배**라는 점은 알아두세요.

### `AIGatewayOptions`

| 필드 | 타입 | 기본값 | 비고 |
|---|---|---|---|
| `provider` | `AIProvider` | `'anthropic'` | |
| `model` | `string` | 프로바이더별 기본값 (아래 표) | 기본값 없는 프로바이더는 **필수** |
| `systemPrompt` | `string` | 없음 | |
| `maxOutputTokens` | `number` | **4096** | `runModule` 경유 시엔 8192 |
| `timeoutMs` | `number` | **300000** (5분) | 0·음수·`Infinity`는 기본값으로 대체 — 비활성화 불가 |
| `baseUrl` | `string` | 프로바이더별 기본값 | OpenAI 호환 경로는 `/v1`이 자동 보장됨 |
| `apiKey` | `string` | 아래 [API 키](#api-키가-해석되는-세-가지-경로) 참조 | |
| `abortSignal` | `AbortSignal` | 없음 | 타임아웃과 `AbortSignal.any`로 병합 |

---

## 프로바이더

`PROVIDER_REGISTRY`가 단일 출처입니다. 코드에서 조회하려면
`PROVIDER_REGISTRY[provider]` 또는 `getProvidersByAccess('local')` 같은 헬퍼를 쓰세요.

| provider | 접근 | apiKey | baseUrl | 구조화 출력 | 기본 모델 |
|---|---|---|---|---|---|
| `anthropic` | 직접 API | 필요¹ | — | 네이티브 | `claude-sonnet-4-6` |
| `openai` | 직접 API | 필요¹ | — | 네이티브 | `gpt-4.1-nano` |
| `gemini` | 직접 API | 필요¹ | — | 네이티브 | `gemini-2.5-flash` |
| `deepseek` | 직접 API | **필수** | 기본값 있음 | 네이티브 | `deepseek-chat` |
| `xai` | 직접 API | **필수** | 기본값 있음 | 네이티브 | 없음 — 지정 필수 |
| `openrouter` | 직접 API | **필수** | 기본값 있음 | 네이티브 | 없음 — 지정 필수 |
| `claude-cli` | CLI 프록시 | **필수**² | `http://localhost:8317` | 2-call 폴백 | 없음 — 지정 필수 |
| `gemini-cli` | 로컬 OAuth | 불필요³ | — | 2-call 폴백 | 없음 — 지정 필수 |
| `ollama` | 로컬 | 불필요 | `http://localhost:11434` | 2-call 폴백 | 없음 — 지정 필수 |
| `custom` | 로컬 | 불필요 | **필수** | 2-call 폴백 | 없음 — 지정 필수 |

¹ 생략하면 AI SDK의 환경변수 폴백을 씁니다 (아래 참조).
² cli-proxy-api가 `config.yaml`의 `api-keys`로 Bearer 토큰을 **항상 검증**하므로 키가 필요합니다.
   미전달 시 명시적 에러입니다.
³ 로컬 `~/.gemini` OAuth **전용**입니다. `baseUrl`/`apiKey`를 넘겨도 무시되며, cli-proxy-api와는
   무관한 별도 크레덴셜·쿼터 경로입니다. 프록시의 Gemini 모델을 쓰려면 `custom` + `baseUrl` +
   프록시 키를 쓰세요.

**기본 모델이 없는 프로바이더에 `model`을 안 주면 에러입니다.** 임의 모델명으로 폴백하지 않습니다 —
잘못된 설정이 나중에 프로바이더의 불투명한 에러로 터지는 대신 즉시 드러나게 하려는 의도입니다.
같은 이유로 `custom`의 `baseUrl` 누락, chat 방식 프로바이더의 `apiKey` 누락도 즉시 에러입니다.

### API 키가 해석되는 세 가지 경로

**경로가 다르면 동작이 다릅니다.** 가장 자주 부딪히는 지점이라 나눠서 적습니다.

**① 게이트웨이 직접 호출 + direct 프로바이더** (`anthropic`/`openai`/`gemini`)
`apiKey`를 생략하면 AI SDK가 자기 환경변수(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY`)를 읽습니다. 라이브러리는 관여하지 않습니다.

**② 게이트웨이 직접 호출 + chat 프로바이더** (`deepseek`/`xai`/`openrouter`/`claude-cli`)
`apiKey`를 **반드시 넘겨야 합니다.** 이 경로에는 환경변수 추론이 없어서, `DEEPSEEK_API_KEY`를
export해 두어도 아무 일도 일어나지 않고 누락 에러가 납니다.

**③ `createInMemoryModelConfig` 어댑터 경유**
어댑터가 자기 추론표로 환경변수를 읽어 `apiKey`를 채웁니다. ②의 프로바이더도 이 경로에서는
환경변수만으로 동작합니다.

| provider | 어댑터가 읽는 환경변수 |
|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GOOGLE_GENERATIVE_AI_API_KEY` → 없으면 `GEMINI_API_KEY` |
| `claude-cli` | `CLI_PROXY_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `ollama`·`custom`·`gemini-cli` | 없음 (키 불필요) |

우선순위는 `overrides` → `providerDefaults` → 환경변수 순입니다.

---

## 러너로 실행하기

### 1. 모듈 정의

모듈은 "이 분석은 무엇이고 프롬프트를 어떻게 만드는가"를 담은 순수 데이터 + 함수입니다.
입력 타입 `TInput`은 완전히 소비자 것이고 라이브러리는 그 형태를 알지 못합니다.

```ts
import { z } from 'zod';
import type { AnalysisModule } from '@krdn/llm-gateway';

interface ReviewInput {
  jobId: number;
  reviews: Array<{ id: number; text: string }>;
}

const ResultSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()).min(1),
  score: z.number().min(0).max(100),
});

const summarizer: AnalysisModule<ReviewInput, z.infer<typeof ResultSchema>> = {
  name: 'summarizer',              // 어댑터 조회 키
  displayName: '리뷰 요약',         // 사람이 읽는 이름
  provider: 'anthropic',           // configAdapter가 없을 때 쓰이는 기본값
  model: 'claude-sonnet-4-6',
  schema: ResultSchema,
  buildSystemPrompt: () => '너는 커머스 리뷰 분석가다. JSON만 출력한다.',
  buildPrompt: (data) =>
    `리뷰 ${data.reviews.length}건을 분석하라:\n` +
    data.reviews.map((r, i) => `${i + 1}. ${r.text}`).join('\n'),
};
```

`schema`는 AI SDK의 `FlexibleSchema<TResult>` 타입이라 zod v3·v4 객체를 모두 받습니다.

### 2. 최소 실행

옵션 없이 부르면 모듈 자신의 `provider`/`model`을 쓰고, API 키는 위 **경로 ①**을 따릅니다.

```ts
import { runModule } from '@krdn/llm-gateway';

const result = await runModule(summarizer, input);

if (result.status === 'completed') {
  // discriminated union — 이 블록 안에서 result/usage는 non-null로 좁혀진다
  console.log(result.result.summary);
  console.log(result.usage.totalTokens, result.usage.provider, result.usage.model);
} else {
  console.error(result.errorMessage);   // 'failed' | 'skipped'
}
```

`runModule`은 **어떤 경로에서도 throw하지 않습니다.** 반환 타입을 `status`로 좁혀 쓰세요.

| `status` | 보장되는 필드 | 의미 |
|---|---|---|
| `completed` | `result`, `usage` | 성공. `errorMessage`가 함께 있으면 **분석은 성공했고 저장만 실패**했다는 뜻 |
| `failed` | `errorMessage` | 실패. `usage`는 실패 전 소비한 토큰이 파악될 때만 존재 |
| `skipped` | `errorMessage` | 실행 안 함 (입력 0건) |

### 3. 모델 설정을 밖에서 주입하기

`configAdapter`를 주면 어댑터의 해석 결과가 모듈 필드보다 **우선**합니다.
모델을 DB나 환경설정으로 바꿔 끼우고 싶을 때 쓰는 이음매입니다.

```ts
import { runModule, createInMemoryModelConfig } from '@krdn/llm-gateway';

const configAdapter = createInMemoryModelConfig({
  modules: {
    summarizer: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  },
  providerDefaults: {
    // 프로바이더 단위 공통값 — apiKey / baseUrl / model 만 받는다
    'claude-cli': { baseUrl: 'http://localhost:8317', apiKey: process.env.CLI_PROXY_API_KEY },
  },
  overrides: {
    // 모듈 단위 부분 오버라이드 — maxOutputTokens / timeoutMs 는 여기서만 지정 가능
    summarizer: { maxOutputTokens: 16_000, timeoutMs: 120_000 },
  },
});

const result = await runModule(summarizer, input, {
  configAdapter,
  extractMeta: (i) => ({ jobId: i.jobId, itemCount: i.reviews.length }),
});
```

`extractMeta`는 입력에서 `jobId`(저장·이벤트 식별자)와 `itemCount`를 뽑습니다.
**`itemCount`가 0이면 LLM을 호출하지 않고 즉시 `skipped`** 입니다 — 빈 배치에 돈을 쓰지 않기 위한
장치입니다. 미지정 시 `jobId=0, itemCount=1`이 되어 이 검사가 꺼집니다.

`overrides`로 `provider`를 바꾸면 **바뀐 프로바이더의 `providerDefaults`가 적용됩니다.**
`providerDefaults.model`은 그렇게 프로바이더가 전환돼 기존 모델명이 무효해진 경우에만 구제용으로
쓰이고, 평상시에는 무시됩니다 (같은 프로바이더에서 모듈의 모델을 조용히 덮어쓰지 않기 위해).

직접 구현하려면 메서드 하나만 채우면 됩니다:

```ts
import type { ModelConfigAdapter } from '@krdn/llm-gateway';

const dbAdapter: ModelConfigAdapter = {
  async resolve(moduleName) {
    const row = await db.query.modelConfigs.findFirst({ where: eq(t.name, moduleName) });
    return { provider: row.provider, model: row.model, apiKey: row.apiKey, baseUrl: row.baseUrl };
  },
};
```

### 4. 결과 저장과 진행 상황

```ts
await runModule(summarizer, input, {
  configAdapter,
  extractMeta: (i) => ({ jobId: i.jobId, itemCount: i.reviews.length }),

  onPersist: async (event) => {
    // 보통은 'running' → ('completed' | 'failed') 순이지만, LLM 호출 전에 판정되는
    // 두 경우는 'running' 없이 곧바로 온다 — 입력 0건('skipped')과 비용 한도 초과('failed').
    // 상태 전이를 UPDATE ... WHERE status='running'으로 짜면 이 두 건이 유실된다.
    if (event.status === 'completed') {
      await db.insert(results).values({
        jobId: event.jobId, module: event.module,
        result: event.result, usage: event.usage,
      });
    }
    if (event.status === 'failed' && event.usage) {
      // 실패해도 과금은 발생했을 수 있다 — usage가 있으면 비용 집계에 반영할 것
      await db.insert(costs).values({ jobId: event.jobId, usage: event.usage });
    }
  },

  onProgress: (e) => {
    // phase: 'start' | 'retry' | 'complete' | 'fail' | 'skip'
    console.log(`[${e.module}] ${e.phase}`, e.message ?? '', e.attempt ?? '');
  },
});
```

**콜백이 throw해도 모듈 실행은 중단되지 않습니다.** 단 하나의 예외로, 분석 성공 후
`onPersist('completed')`가 실패하면 결과를 버리지 않고 `status: 'completed'` +
`errorMessage`(저장 실패 사유)로 돌려줍니다 — 이미 지불한 LLM 호출을 저장 오류 때문에
날리지 않기 위해서입니다.

라이브러리는 **콘솔에 아무것도 찍지 않습니다.** 진단 정보는 던져진 에러 메시지와 `onProgress`로만
나옵니다. 로깅 방식은 소비자가 정합니다.

### 5. 취소 · 일시정지 · 비용 한도

외부 `AbortSignal`은 **진행 중인 LLM 호출까지** 끊습니다.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);

const result = await runModule(summarizer, input, { abortSignal: controller.signal });
// 취소되면 status: 'failed', errorMessage: '사용자에 의해 중지됨'
```

장기 실행 파이프라인에서 외부 상태(DB의 취소 플래그 등)를 보려면 `PipelineControlAdapter`를 씁니다.

```ts
import type { PipelineControlAdapter } from '@krdn/llm-gateway';

const pipelineControl: PipelineControlAdapter = {
  isCancelled: async (jobId) => (await db.job(jobId)).cancelled,  // 5초마다 폴링됨
  waitIfPaused: async (jobId) => { /* 재개될 때까지 await */ },
  checkCostLimit: async (jobId) => (await spent(jobId)) < LIMIT,  // false면 호출 전 중단
  appendEvent: async (jobId, level, message) => { await db.log(jobId, level, message); },
};

await runModule(summarizer, input, { pipelineControl, extractMeta });
```

- `checkCostLimit`은 **호출 전 pre-flight**로 한 번 검사합니다 (false면 `failed`).
- `isCancelled`는 재시도 사이마다, 그리고 호출이 진행되는 동안 **5초 간격으로 폴링**됩니다.
- `waitIfPaused`는 재시도 직전에 호출됩니다.
- 이 어댑터들이 던지는 예외는 **fail-open**으로 흡수됩니다 — DB가 잠깐 흔들려도 분석이
  중단되지 않습니다. 어댑터가 필요 없으면 `noopPipelineControl`이 기본으로 쓰입니다.

---

## 재시도와 에러 처리

### 무엇이 재시도되는가

| 상황 | 동작 |
|---|---|
| Rate limit (429) | 선형 backoff **최대 5회** — `attempt × 3초`, 프로바이더가 `retry-after`를 주면 **둘 중 큰 쪽** |
| 서버 과부하 (503·529) | **15초 후 1회** |
| `retry-after`가 5분 초과 | 재시도하지 않고 즉시 원본 에러 (일일 쿼터 소진에 몇 시간을 자지 않기 위해) |
| **파싱·스키마 검증 실패** | **재시도하지 않음** — 실패한 파싱도 이미 과금됐으므로 즉시 전파 |

두 예산은 서로 독립입니다. 소진되면 마지막 **원본 에러를 그대로** 다시 던집니다(감싸지 않음) —
상위에서 `statusCode` 기반 분류가 계속 동작해야 하기 때문입니다.

에러 분류는 AI SDK의 구조화 에러(`APICallError.statusCode`, `RetryError` 언래핑, `retry-after` 헤더)를
우선 보고, CLI 프록시처럼 그런 정보가 없는 경우에만 메시지 정규식으로 떨어집니다.

### 에러 타입 구분

게이트웨이를 직접 쓸 때만 신경 쓰면 됩니다 (`runModule`은 이미 이 분기를 해서 `usage`에 담아 줍니다).

```ts
import { analyzeStructured, StructuredOutputError } from '@krdn/llm-gateway';
import { NoObjectGeneratedError } from 'ai';

try {
  const { object } = await analyzeStructured(prompt, schema, opts);
} catch (error) {
  if (error instanceof StructuredOutputError) {
    // 2-call 폴백이 두 번 다 실패 — 각 단계의 파싱/검증 사유와 finishReason이 메시지에 있다
    console.error(error.message, error.usage);   // usage가 실려 온다 (과금 집계용)
  } else if (NoObjectGeneratedError.isInstance(error)) {
    // 네이티브 경로에서 스키마 위반
    console.error(error.usage);
  }
}
```

프로바이더가 완결된 출력을 내지 못하면(토큰 절단 등) AI SDK의 `NoOutputGeneratedError` 대신
usage를 실은 `StructuredOutputError`가 올라옵니다 — 실패한 호출의 과금을 집계에서 잃지 않기
위해서입니다. 원본 에러는 `cause`에 보존됩니다.

### 재시도 정책 단독 사용

게이트웨이 밖의 호출에도 같은 정책을 쓸 수 있습니다.

```ts
import { retryWithPolicy, isRateLimitError, MAX_RETRY_AFTER_MS } from '@krdn/llm-gateway';

const data = await retryWithPolicy(() => someApiCall(), {
  maxRateLimitRetries: 3,
  onRetry: ({ attempt, backoffMs, type }) => log(`${type} 재시도 ${attempt} (${backoffMs}ms)`),
  abortSignal: controller.signal,
});
```

---

## Anthropic 구조화 출력 주의점

**Anthropic 경로는 `structuredOutputMode: 'jsonTool'`(classic tool_use)로 고정됩니다.**
`@ai-sdk/anthropic`의 기본값 `auto`는 신형 `output_config.format`을 선택하는데, 이 경로는
JSON Schema의 부분집합만 허용해 다음을 **거부**합니다:

- `number`의 `minimum` / `maximum`
- `array`의 `minItems` (0이나 1이 아닌 값)

classic tool_use는 표준 JSON Schema를 그대로 받으므로 `z.number().min().max()`,
`z.array().min(2)` 같은 제약이 보존되고, **cli-proxy-api(Claude Max 플랜 프록시) 경유에서도**
구조화 출력이 정상 동작합니다. provider-namespaced 옵션이라 다른 프로바이더에는 영향이 없습니다.

> `provider: 'anthropic'` + `baseUrl`을 프록시로 지정하면 별도 설정 없이 이 동작이 적용됩니다.

---

## API 레퍼런스

```ts
import { ... } from '@krdn/llm-gateway';            // 전체
import { ... } from '@krdn/llm-gateway/gateway';    // 게이트웨이만
import { ... } from '@krdn/llm-gateway/runner';     // 러너만
import { ... } from '@krdn/llm-gateway/adapters';   // 어댑터만
```

| Symbol | 서브경로 | 용도 |
|---|---|---|
| `analyzeText`, `analyzeStructured` | `gateway` | 게이트웨이 진입점 |
| `AnalyzeTextResult`, `AIGatewayOptions` | `gateway` | 게이트웨이 결과/옵션 타입 |
| `StructuredOutputError` | `gateway` | 2-call 폴백 이중 실패 에러 (`.usage` 보유) |
| `normalizeUsage`, `NormalizedUsage` | `gateway` | usage 정규화 |
| `PROVIDER_REGISTRY`, `AIProvider`, `AI_PROVIDER_VALUES` | `gateway` | 프로바이더 메타데이터 |
| `getProvidersByAccess`, `isProxyCli`, `needsTextFallback` | `gateway` | 메타데이터 헬퍼 |
| `AccessMethod`, `CallMethod`, `ProviderMeta` | `gateway` | 메타데이터 타입 |
| `runModule` | `runner` | 단일 모듈 실행 (재시도 + persist + progress) |
| `RunModuleOptions<TInput>` | `runner` | runModule 옵션 |
| `PersistEvent`, `ProgressEvent` | `runner` | 콜백 이벤트 타입 |
| `retryWithPolicy`, `RetryPolicyOptions` | `runner` | 재시도 정책 |
| `isRateLimitError`, `isServerOverloadError`, `parseRetryAfter` | `runner` | 에러 분류 유틸 |
| `MAX_RATE_LIMIT_RETRIES`, `MAX_RETRY_AFTER_MS`, `sleep` | `runner` | 재시도 상수/유틸 |
| `ModelConfigAdapter`, `ResolvedModelConfig` | `adapters` | 모듈→모델 해석 |
| `createInMemoryModelConfig`, `InMemoryModelConfigOptions` | `adapters` | 기본 in-memory 어댑터 |
| `PipelineControlAdapter`, `noopPipelineControl` | `adapters` | 취소/일시정지/비용 한도 |
| `AnalysisModule<TInput, TResult>` | root | 모듈 인터페이스 (제네릭) |
| `AnalysisModuleResult<TResult>` | root | 실행 결과 discriminated union |
| `ModuleUsage` | root | `NormalizedUsage` + `provider`/`model` |
| `AnalysisInputMeta` | root | `extractMeta` 반환 타입 (`jobId`, `itemCount`) |
| `ProviderType` | root | `AIProvider`의 호환 별칭 |

브라우저 번들에서 프로바이더 메타데이터(표시명, 색상, 지원 여부)만 필요하다면 `gateway`
서브경로의 `PROVIDER_REGISTRY` 쪽만 import 하세요 — 그 모듈은 SDK를 import하지 않고
`sideEffects: false`라 나머지가 트리셰이킹됩니다.

---

## 버전 이력

전체 내역은 [CHANGELOG.md](./CHANGELOG.md)에 있습니다. 업그레이드 시 확인할 것만 옮깁니다.

### v5.0.0 (BREAKING)

- **Vercel AI SDK v7** (`ai` v6→v7, `@ai-sdk/*` v3→v4). **공개 API는 그대로**입니다 —
  `analyzeText`/`analyzeStructured`/`runModule`의 시그니처와 타입, `zod` peer 범위가 모두
  동일해 소비자 코드 수정은 필요 없습니다.
- **Node 22.0.0 이상** (기존 20.3.0). Node 20이 2026-04-30에 EOL이 됐고 `ai@7` 자신이
  `engines: >=22`를 요구합니다. CI는 22·24에서 돕니다.
- **네이티브 경로의 실패 에러 타입 변경** (동작 자체는 4.1.2부터): 출력이 절단되면
  `NoOutputGeneratedError` 대신 usage를 실은 `StructuredOutputError`가 올라옵니다.
  원본은 `cause`에 남고, 스키마 위반은 종전대로 `NoObjectGeneratedError`입니다.
- 부수 효과로 `undici`가 5.29→7.29로 올라가 런타임 의존성의 알려진 취약점 10건(WebSocket
  관련 high 3건 포함)이 해소됩니다.

### v4.0.0 (BREAKING)

- `AnalysisModuleResult`가 **discriminated union**이 됨 — `status === 'completed'`로 좁히면
  `result`/`usage`가 non-null 보장.
- `runModule`의 `configAdapter`/`extractMeta`가 **선택**이 됨 (없으면 모듈 자신의 provider/model).
- 잘못된 설정을 침묵으로 가리던 폴백 제거 — 알 수 없는 provider, 기본 모델 없는 provider의
  model 미지정, `custom`의 baseUrl 누락, 유료 API의 apiKey 누락은 모두 **명시적 에러**.
- `analyzeText`의 usage에 정규화 필드 보장 (원본 필드는 보존).
- 라이브러리가 콘솔에 로그를 찍지 않음.
- `claude-cli`는 **apiKey 필수**가 됨 (기존 기본값 `'cli-proxy'` 제거).
- `gemini-cli`의 `ai-sdk-provider-gemini-cli`가 선택적 peerDependency로 분리됨.
- Node 20.3.0 이상 필요 (`AbortSignal.any`).

> v3.0.0은 `@krdn/ai-analysis-kit`에서의 이름 변경으로, v2.0.1 대비 API 변경은 없습니다.

## 라이선스

MIT
