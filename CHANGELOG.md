# Changelog

## 4.1.2 (2026-08-11)

- **native 경로에서 응답이 절단되면 과금된 usage가 집계에서 사라지던 것을 고쳤다.**
  AI SDK는 `finishReason`이 `'stop'`일 때만 구조화 출력을 resolve한다. 토큰 제한
  등으로 그렇지 않으면 `result.output` 접근이 `NoOutputGeneratedError`를 던지는데,
  그 에러는 usage를 싣지 않는다. `runModule`의 실패-usage 보존은
  `StructuredOutputError`·`NoObjectGeneratedError`만 인식하므로, 이미 과금된 토큰이
  집계에서 통째로 빠지고 소비자는 "No output generated."만 받았다. 이제 폴백 경로와
  동일하게 `StructuredOutputError`에 usage와 `finishReason`을 실어 던진다.
  `maxOutputTokens` 기본값이 4096이라 절단은 드문 일이 아니다.
- **`dist/`를 소스와 동기화했다.** 이 저장소는 dist를 릴리스마다 커밋해 Git URL
  설치(`github:krdn/llm-gateway#vX.Y.Z`)를 지원하는데, 4.1.0 이후 그 갱신이 밀려
  **v4.1.1 태그가 4.1.0 시점의 dist를 담고 있었다.** npm 경로는 `prepack`이 빌드하므로
  영향이 없고, Git URL로 `#v4.1.1`을 가리키던 소비자만 4.1.1의 수정을 받지 못했다.
  이 릴리스부터 태그 시점에 CI가 dist 신선도를 검사해 재발을 막는다.
- (내부) AI SDK 계약 테스트 계층(`sdk-contract.test.ts`)을 추가했다. 기존 스위트는
  `generateText`를 통째로 mock해 SDK가 실제로 무엇을 하는지 — 스키마의
  `responseFormat` 변환, provider usage의 중첩→평면 정규화, output resolve 조건,
  에러 종류 — 를 검증하지 못했다. 이 계층은 provider 경계까지만 mock하고 SDK를
  실제로 돌린다. 위 결함도 이 계층이 드러냈다.

## 4.1.1 (2026-08-11)

- **폴백 경로에서 커스텀 `validate`가 `error` 없이 실패하면 `TypeError`로 샜다.**
  `ValidationResult.error`는 타입상 필수지만, 4.1.0에서 공개 API를 `FlexibleSchema`로
  넓히면서 소비자가 직접 쓴 validate 콜백이 들어올 수 있게 됐다 — 즉 시스템 경계다.
  여기서 예외가 나면 두 번 과금한 usage를 실은 `StructuredOutputError` 대신 일반
  예외가 올라가 비용 집계가 깨졌다. zod 스키마만 쓰는 소비자에게는 영향이 없다.
- CI의 zod 4 잡이 메이저 버전을 실제로 강제하지 않던 것을 hard-fail 검사로 교체했다
  (회귀 테스트가 `zod/v3`·`zod/v4` 서브패스를 써서 버전 독립적인 것이 원인이었다).

## 4.1.0 (2026-08-10)

- **zod v4 지원** — peer가 `^3.25.76 || ^4.1.8`이 됐다 (`ai@6`의 범위와 동일).
  기존 zod 3 소비자에게 필요한 변경은 없다.
  - 공개 API의 스키마 타입이 `z.ZodType<T, z.ZodTypeDef, unknown>` → `FlexibleSchema<T>`
    (AI SDK 재export)로 바뀌었다. 출력 타입이 유일한 제네릭 인자라 zod v4에서도
    추론이 살고, 인자 위치가 같아 `analyzeStructured<MyType>(...)` 명시 호출은
    그대로 컴파일된다. 라이브러리에서 zod import가 사라졌다.
  - text2step 폴백의 JSON Schema 변환에 런타임 분기를 넣었다. `zod-to-json-schema`
    3.25.x는 v4 스키마에 **예외 없이 `{}`를 반환**해 폴백 프롬프트에 빈 스키마가
    조용히 실렸다. zod v3만 기존 `openApi3` 출력을 유지하고(프롬프트 바이트 불변),
    그 외는 `asSchema().jsonSchema`를 쓴다.
  - 변환 결과가 비면 `{}`를 프롬프트에 싣지 않고 스키마 섹션을 생략하며, 그 상태로
    실패하면 에러 메시지에 "스키마 힌트 없이 실행됨"을 남긴다.
  - 검증기 없는 스키마(`jsonSchema()`로 만든 `Schema` 등)는 **프로바이더 호출 전에**
    거부한다. 그대로 두면 native 경로는 `Output.object`가 검증을 건너뛰어 스키마에
    맞지 않는 출력을 통과시키고, 폴백 경로는 두 번의 유료 호출을 태운 뒤 실패한다.
  - CI가 zod 3·4 두 설치 그래프에서 각각 돈다 (peer 범위가 광고하는 조합을 실제로 검증).

## 4.0.2 (2026-08-10)

- **`zod` peer 범위 하한 수정** (`^3.24.0` → `^3.25.76`) — 의존성 `ai@6`이
  `zod ^3.25.76`을, `zod-to-json-schema`가 `^3.25.28`을 요구하는데 우리 하한이
  그보다 낮았다. zod 3.24.x를 설치한 소비자는 우리 peer는 만족하면서 `ai`의
  peer를 위반하는 상태가 됐다. 실제로 동작 가능한 최소치로 맞춘 것이라
  범위가 좁아졌음에도 새로 깨지는 조합은 없다.

## 4.0.1 (2026-07-12)

- `NormalizedUsage`를 interface → type으로 변경 — interface는 선언 병합 가능성
  때문에 `Record<string, unknown>`에 할당되지 않아, usage를 범용 로깅/persist
  함수에 넘기는 소비자 코드가 v4.0.0에서 컴파일 에러를 맞았다(gons-dashboard
  auto-update typecheck에서 실측). 런타임 변화 없음. `ModuleUsage`(교차 타입)의
  할당성도 함께 복원된다.

## 4.0.0 (2026-07-12)

전면 리팩토링 릴리스 — 침묵 폴백 제거, 타입 강화, 취소/재시도 신뢰성 개선.

### BREAKING CHANGES

- **`AnalysisModuleResult`가 discriminated union으로 변경** (interface → type).
  `status === 'completed'`로 좁히면 `result`/`usage`가 non-null 보장.
  `extends AnalysisModuleResult` 하던 코드는 수정 필요.
- **getModel이 잘못된 설정에 명시적 에러를 던짐** (기존: 침묵 폴백):
  - 알 수 없는 provider → 에러 (기존: opaque TypeError)
  - 기본 모델 없는 provider(ollama/xai/openrouter/custom/claude-cli/gemini-cli)에
    model 미지정 → 에러 (기존: `gpt-4.1-nano`로 폴백)
  - deepseek/xai/openrouter에 apiKey 미전달 → 에러 (기존: 가짜 키 `'ollama'` 전송 → 401)
  - `custom`에 baseUrl 미지정 → 에러 (기존: `localhost:11434`로 폴백)
- **`analyzeText`의 usage 반환 형태 변경**: 프로바이더 원본 필드 + 정규화 필드
  (`inputTokens`/`outputTokens`/`totalTokens` 항상 숫자) 병합. `AnalyzeTextResult` 타입 신설.
- **콘솔 로깅 전면 제거** — 라이브러리가 소비자 stdout/stderr를 오염시키지 않음.
  진단 정보(파싱 실패 사유, finishReason)는 에러 메시지와 `onProgress`로 전달.
- **`ai-sdk-provider-gemini-cli`가 선택적 peerDependency로 전환** — gemini-cli
  사용자는 직접 설치 필요 (`pnpm add ai-sdk-provider-gemini-cli`). 미설치 시 안내 에러.
- **`requiresJsonMode` 필드·`needsJsonMode()` 제거** — AI SDK v6가 structured-output
  모드를 내부 선택하므로 개념 자체가 소멸.
- **`PROVIDER_REGISTRY`가 읽기 전용 타입으로 변경** — 레지스트리를 변조하던 코드는 컴파일 에러.
- **Node 20.3.0 이상 필요** (`AbortSignal.any` 사용).
- **`claude-cli`의 `defaultApiKey: 'cli-proxy'` 제거, `requiresApiKey: true`로 교정** —
  cli-proxy-api는 config.yaml `api-keys`로 Bearer 토큰을 항상 검증하므로 기본 키는
  결정론적 401이었다. 마이그레이션: 프록시에 등록된 키를 `options.apiKey`로 전달하거나,
  어댑터 경로는 `CLI_PROXY_API_KEY` 환경변수 사용 (`resolveApiKeyFromEnv` 신규 지원).
- **`gemini-cli` 메타데이터 교정**: displayName 'Gemini CLI (Local OAuth)',
  `accessMethod: 'proxy-cli'` → `'local'` — 이 프로바이더는 로컬 `~/.gemini` OAuth
  전용이며 `baseUrl`/`apiKey`가 무시된다(cli-proxy-api와 무관). `isProxyCli('gemini-cli')`가
  이제 `false`를 반환. 프록시의 Gemini 모델은 `custom` 프로바이더로 호출할 것.
- **`createInMemoryModelConfig`의 `providerDefaults.model` 적용 조건 변경** —
  override로 provider를 전환해 base.model이 무효해진 경우에만 적용
  (기존: 동일 provider에서도 모듈별 model을 조용히 덮어썼음).
- `openai.defaultBaseUrl` 제거 (getModel이 읽지 않는 죽은 데이터였음).

### 개선 (하위 호환)

- `runModule`: `configAdapter`/`extractMeta`가 선택이 됨 — 미지정 시
  `module.provider`/`module.model` 사용, skip-on-empty 비활성. 어댑터가 있으면 어댑터 우선.
- `runModule`: never-throw 정책 완전 보장 — `extractMeta`/`onPersist`/`onProgress`가
  throw해도 항상 `AnalysisModuleResult` 반환. 분석 성공 후 저장만 실패하면
  `completed` + `errorMessage`(저장 실패 사유).
- `runModule`: `pipelineControl.checkCostLimit`이 실제로 호출됨 (false면 실행 전 중단).
- `runModule`: `abortSignal` 옵션 + `ResolvedModelConfig.timeoutMs` 신설 —
  취소가 진행 중인 LLM 호출까지 전파됨 (기존: 재시도 사이에서만 체크).
- `retryWithPolicy`: overload 재시도가 rate limit 예산과 독립된 카운터 사용
  (기존: overload 재시도 설정이 사실상 무시됨). 예산 소진 시 원본 에러 그대로 전파
  (기존: `'재시도 한도 초과'` 일반 에러로 감쌌음).
- `retryWithPolicy`: retry-after 상한(`MAX_RETRY_AFTER_MS`=5분) 신설 —
  일일 쿼터 소진(retry in 86400s) 시 24시간 잠들지 않고 즉시 실패.
- 에러 분류가 AI SDK 구조화 에러(`APICallError.statusCode`, `RetryError` 래핑 해제,
  retry-after 헤더)를 우선 사용 — 메시지 정규식은 CLI 프록시용 폴백으로 강등.
- `repairTruncatedJson` 재작성 — 문자열 중간 절단(토큰 제한 절단의 최다 형태) 복구.
  기존 구현은 5/7 절단 시나리오에서 invalid JSON을 반환했음.
- text2step 폴백: step1 분석 텍스트를 2,000자로 자르던 제한 제거(상한 32,000자) —
  스키마 필드가 조용히 기본값으로 채워지던 데이터 유실 수정. 실패 시 각 단계의
  파싱/검증 사유와 finishReason을 에러에 포함.
- `mergeAbortSignals`를 `AbortSignal.any`로 교체 — 이미 abort된 외부 signal 즉시 반영,
  호출 완료 후 최대 5분간 이벤트 루프를 붙잡던 타이머 누수 제거.
- `extractJson`을 탐욕 정규식에서 **이스케이프 인지 균형 스캔**으로 교체 —
  문자열 값 안의 `}`/`]`를 JSON 경계로 오인해 절단 복구 가능한 응답을 `{}`로
  만들던 silent data loss와, JSON 뒤 산문의 중괄호로 인한 파싱 실패 수정.
- text2step 이중 실패 시 **`StructuredOutputError`**(신규 export)로 두 호출의
  usage 합산을 보존 — `runModule`이 이를 감지해 `failed` 결과와 `PersistEvent`에
  `usage?: ModuleUsage`를 실어 실패한 분석도 비용 집계에 포함 (native 경로의
  `NoObjectGeneratedError.usage`도 동일 처리). optional 필드 추가라 하위 호환.
- 재시도 backoff sleep이 abort-aware가 됨 — 취소 후 최대 5분(MAX_RETRY_AFTER_MS)
  pending으로 남던 문제 수정 (`RetryPolicyOptions.abortSignal` 신규).
- `onPersist('running')`에 safePersist 가드 적용 — persist 일시 실패가 문서화된
  never-interrupt 계약을 깨고 LLM 호출 없이 모듈을 failed 처리하던 누락 수정.
- `shouldAbort`의 `isCancelled`·`onRetry`의 `waitIfPaused`에 fail-open 가드 —
  어댑터 일시 오류가 재시도 가능한 모듈을 엉뚱한 사유로 즉사시키지 않음.
- `timeoutMs`에 0/음수/Infinity 방어 — 유효하지 않은 값은 기본 5분으로 대체
  (기존: 0이면 즉시 abort, Infinity면 RangeError).
- Anthropic 구조화 출력 jsonTool 강제(v3.4.0)를 전략 구조(`executeNative`)로 포팅.
- 레지스트리 불변식을 `provider-meta.test.ts`로 강제 (requiresApiKey ⇒ defaultApiKey 없음 등).
- CI: publish 잡의 전 액션 SHA 고정, notify matrix `fail-fast: false`.
- 네이티브 구조화 출력을 deprecated `generateObject`에서 `generateText` + `Output.object`로 이행.
- `createInMemoryModelConfig`: override로 provider를 바꾸면 바뀐 provider의
  providerDefaults가 적용되도록 수정 (기존: 원래 provider의 defaults 적용 버그).
- `normalizeUsage(usage: unknown)` — 호출부 캐스트 불필요. `finishReason`이
  `FinishReason` union 타입으로 강화.
- `retryWithPolicy`/`RetryPolicyOptions`가 `runner` 배럴에서 export됨 (문서화된 API였으나 누락).
- 죽은 코드 제거: `isParseError`, `MAX_PARSE_RETRIES`, `select-strategy.ts`(전략 선택이
  `strategies.executeStructured`로 통합).
- 패키징: zod 이중 선언 해소(peer+dev만), `sideEffects: false`, npm provenance,
  `packageManager` 필드. CI에 lint 게이트 추가. 소비자 dispatch가 publish 성공 이후에만 발송.

## 3.4.0 (2026-07-04)

### Anthropic 구조화 출력을 classic tool_use(jsonTool)로 강제

`analyzeStructured`에서 provider가 `anthropic`일 때 `structuredOutputMode: 'jsonTool'`을
providerOptions로 전달한다.

- `@ai-sdk/anthropic`의 기본값 `auto`는 신형 `output_config.format` 경로를 선택하는데,
  이 경로는 JSON Schema 부분집합만 허용해 `number`의 `minimum`/`maximum`,
  `array`의 `minItems`(>1) 등 제약을 거부한다.
- classic `tool_use`(jsonTool)는 표준 JSON Schema를 그대로 받으므로 스키마 제약이 보존되고,
  `cli-proxy-api`(Claude Max 플랜 프록시) 경유 시에도 구조화 출력이 정상 동작한다.
- anthropic 외 프로바이더 동작은 변화 없음(provider-namespaced 옵션).

## 3.3.0 (2026-05-27)

- refactor: `gateway.ts`에서 `model-factory.ts`(getModel/SDK_MAP/DEFAULT_MODELS),
  `json-repair.ts`(extractJson/repairTruncatedJson) 분리. 재시도 로직을
  `retryWithPolicy`(`retry-utils.ts`)로 분리.
- refactor(사후): structured output 전략 패턴 분리(`strategies.ts`),
  `normalizeUsage`를 `normalize-usage.ts`로 추출 (commit 3866f98, 태그 이후).
- ci: repository-dispatch action SHA 고정 (supply-chain 보안), dispatch 계약 통합.

## 3.2.0 (2026-05-27) — git tag만, npm 미배포

- **BREAKING**: `ConcurrencyAdapter`, `createStaticConcurrency`(adapters),
  `runWithProviderGrouping`(runner) 제거. 동시성 제어는 소비자 측에서
  p-limit 등으로 직접 처리.
- test: extractJson/repairTruncatedJson, analyzeStructured 2단계 파이프라인 테스트 대폭 추가.

## 3.1.0 (2026-05-27) — git tag만, npm 미배포

- refactor: `getModel()`을 `PROVIDER_REGISTRY` 기반 레지스트리 디스패처로 재구성 (API 변경 없음).
- ci: npm publish + 소비자 자동 업데이트 워크플로우 추가.

## 3.0.1 — npm 배포본 (소급 기입)

- npm에 배포된 패치 릴리스. git tag·커밋 기록이 없어 상세 내역은 남아 있지 않다.

## 3.0.0 (2026-05-26)

### Package Rename

패키지명을 `@krdn/ai-analysis-kit`에서 `@krdn/llm-gateway`로 변경.
LLM 게이트웨이 본연의 역할을 반영하는 이름으로 통일.

- API 변경 없음 (v2.0.1과 동일)
- dead import 제거 (`ollama-ai-provider-v2` — 실제로는 OpenAI 호환 경로 사용)
- 로그 프리픽스 `[ai-gateway]` → `[llm-gateway]`
- `@krdn/ai-analysis-kit`은 deprecated


## 2.0.0 (2026-04-08)

### BREAKING CHANGES

정치 여론 분석 도메인 코드를 전부 제거하고 도메인 무관 AI 분석 러너로 재정비했다. v1.x에서 12개 모듈을 사용하던 프로젝트(ai-signalcraft)는 모듈/스키마를 자체 저장소로 이전해야 한다.

#### 제거

- `./modules`, `./schemas` 서브경로 export 삭제
- 12개 정치 여론 모듈: `macroViewModule`, `segmentationModule`, `sentimentFramingModule`, `messageImpactModule`, `riskMapModule`, `opportunityModule`, `strategyModule`, `finalSummaryModule`, `approvalRatingModule`, `frameWarModule`, `crisisScenarioModule`, `winSimulationModule`
- 12개 Zod 스키마: `MacroViewSchema`, `SegmentationSchema`, … (+ 각 `*Result` 타입)
- Stage 상수: `STAGE1_MODULES`, `STAGE2_MODULES`, `STAGE3_MODULES`, `STAGE4_PARALLEL`, `STAGE4_SEQUENTIAL`, `ALL_MODULES`
- 모듈 레지스트리: `MODULE_MODEL_MAP`, `MODULE_NAMES`, `getModuleByName()`
- 도메인 입력 타입: `AnalysisInput` (articles/videos/comments 필드 강제)
- CLI 도구: `ai-analysis` bin, `cli/index.ts`, eval 디렉토리 (도메인 모듈 레지스트리 의존)
- 의존성: `cac`

#### 변경

- **`AnalysisModule` 제네릭 확장**: `AnalysisModule<T>` → `AnalysisModule<TInput, TResult>`
  - `buildPrompt(data: AnalysisInput)` → `buildPrompt(data: TInput)`
  - `buildPromptWithContext?(data: AnalysisInput, ...)` → `buildPromptWithContext?(data: TInput, ...)`
- **`runModule` 시그니처 변경**:
  - `runModule<T>(module, input: AnalysisInput, options)` → `runModule<TInput, TResult>(module, input: TInput, options: RunModuleOptions<TInput>)`
  - `RunModuleOptions.extractMeta: (input: TInput) => { jobId, itemCount }` **필수 옵션 추가**. v1.x가 하드코딩하던 `input.jobId`와 `articles+videos+comments.length` 로직을 대체
- **스킵 판정**: "수집 데이터 0건" → "`meta.itemCount === 0`" (도메인 측이 정의)
- `runWithProviderGrouping`의 제네릭 제약: `M extends AnalysisModule` → `M extends AnalysisModule<unknown, unknown>`

#### 추가

- `AnalysisInputMeta` 타입 export (runModule이 입력에서 추출하는 최소 메타데이터)
- `RunModuleOptions<TInput>`의 제네릭화

### 마이그레이션 가이드 (v1 → v2)

```ts
// Before (v1.x)
import { runModule, macroViewModule, type AnalysisInput } from '@krdn/llm-gateway';

const input: AnalysisInput = {
  jobId: 1,
  keyword: '...',
  articles: [...],
  videos: [...],
  comments: [...],
  dateRange: { start, end },
};

await runModule(macroViewModule, input, { configAdapter });

// After (v2.0.0)
// 1) 모듈 정의를 자기 프로젝트로 이전
import { runModule } from '@krdn/llm-gateway';
import { macroViewModule } from './my-modules';  // 로컬 정의
import type { MyAnalysisInput } from './my-types';

const input: MyAnalysisInput = { /* ... */ };

await runModule(macroViewModule, input, {
  configAdapter,
  extractMeta: (i) => ({
    jobId: i.jobId,
    itemCount: i.articles.length + i.videos.length + i.comments.length,
  }),
});
```

---

## 1.0.0 (2026-04-07)

- `ai-signalcraft`에서 12개 정치 여론 분석 모듈, Zod 스키마, AI Gateway, runner, 어댑터, CLI를 분리하여 초기 릴리스
