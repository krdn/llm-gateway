# Changelog

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
