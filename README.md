# @krdn/ai-analysis-kit

`ai-signalcraft`에서 분리한 정치 여론 AI 분석 모듈 패키지. 12개의 분석 모듈, Zod 스키마, AI Gateway, 그리고 DB-독립적인 runner를 제공합니다.

## 특징

- **12개 분석 모듈** (Stage 1~4): macro-view, segmentation, sentiment-framing, message-impact, risk-map, opportunity, strategy, final-summary, approval-rating, frame-war, crisis-scenario, win-simulation
- **Adapter 패턴**: DB / 파이프라인 / 동시성 의존성을 인터페이스로 추상화 → 다른 프로젝트에서도 즉시 사용 가능
- **다중 프로바이더**: Anthropic Claude, Google Gemini, OpenAI, Ollama, OpenRouter, DeepSeek, xAI, Gemini CLI, Claude CLI Proxy
- **Vercel AI SDK v6** 기반 구조화 출력 (`generateObject`) + JSON 폴백
- **CLI 도구** 내장: 단일 모듈 디버깅, 일괄 실행
- **Rate limit / 서버 과부하 자동 재시도** (exponential backoff)

## 설치

Git URL + Semver 태그 방식 (private repo):

```json
{
  "dependencies": {
    "@krdn/ai-analysis-kit": "github:krdn/ai-analysis-kit#v1.0.0"
  }
}
```

업데이트:
```bash
pnpm update @krdn/ai-analysis-kit
```

## 사용법

### 단일 모듈 실행

```typescript
import {
  runModule,
  macroViewModule,
  createInMemoryModelConfig,
  type AnalysisInput,
} from '@krdn/ai-analysis-kit';

const input: AnalysisInput = {
  jobId: 1,
  keyword: '관심 키워드',
  articles: [/* ... */],
  videos: [/* ... */],
  comments: [/* ... */],
  dateRange: { start: new Date('2026-04-01'), end: new Date('2026-04-07') },
};

const configAdapter = createInMemoryModelConfig({
  // 환경변수 GOOGLE_GENERATIVE_AI_API_KEY / ANTHROPIC_API_KEY 자동 사용
});

const result = await runModule(macroViewModule, input, { configAdapter });
console.log(result.result);
```

### 커스텀 ModelConfigAdapter (DB 기반)

```typescript
import { runModule, type ModelConfigAdapter } from '@krdn/ai-analysis-kit';

class DbModelConfigAdapter implements ModelConfigAdapter {
  async resolve(moduleName: string) {
    const row = await db.query(/* ... */);
    return {
      provider: row.provider,
      model: row.model,
      apiKey: row.api_key,
      baseUrl: row.base_url,
    };
  }
}
```

### onPersist 콜백으로 결과 저장

```typescript
await runModule(module, input, {
  configAdapter,
  onPersist: async (event) => {
    await db.insert(analysisResults).values({
      jobId: event.jobId,
      module: event.module,
      status: event.status,
      ...(event.status === 'completed'
        ? { result: event.result, usage: event.usage }
        : event.status === 'failed'
        ? { errorMessage: event.errorMessage }
        : {}),
    });
  },
});
```

### 파이프라인 제어 (취소/일시정지)

```typescript
await runModule(module, input, {
  configAdapter,
  pipelineControl: {
    async isCancelled(jobId) {
      const job = await db.findJob(jobId);
      return job.status === 'cancelled';
    },
    async waitIfPaused(jobId) { /* ... */ },
    async checkCostLimit(jobId, cost) { return true; },
    async appendEvent(jobId, level, message) { /* ... */ },
  },
});
```

## CLI

```bash
# 12개 모듈 목록
npx ai-analysis list

# 단일 모듈 실행 (디버깅)
ANTHROPIC_API_KEY=sk-... \
  npx ai-analysis run macro-view --input ./sample.json

# 모든 모듈 일괄 실행
npx ai-analysis run-all --input ./sample.json --output ./results
```

## 모듈 구성

| Stage | 모듈 | 기본 모델 | 의존 |
|-------|------|----------|------|
| 1 | macro-view | gemini-2.5-flash | — |
| 1 | segmentation | gemini-2.5-flash | — |
| 1 | sentiment-framing | gemini-2.5-flash | — |
| 1 | message-impact | gemini-2.5-flash | — |
| 2 | risk-map | claude-sonnet-4-6 | Stage 1 |
| 2 | opportunity | claude-sonnet-4-6 | Stage 1 |
| 2 | strategy | claude-sonnet-4-6 | Stage 1, 2 |
| 3 | final-summary | claude-sonnet-4-6 | Stage 1, 2 |
| 4 | approval-rating | claude-sonnet-4-6 | Stage 1 |
| 4 | frame-war | claude-sonnet-4-6 | Stage 1 |
| 4 | crisis-scenario | claude-sonnet-4-6 | risk-map + approval-rating |
| 4 | win-simulation | claude-sonnet-4-6 | 전체 |

## 개발

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

## 릴리스

```bash
# 1) 버전 업데이트 (package.json + CHANGELOG.md)
# 2) dist 빌드 + 커밋
pnpm build
git add -f dist
git commit -m "build: dist for v1.0.1"
git tag v1.0.1
git push origin main --tags
```

소비 측 프로젝트:
```bash
pnpm update @krdn/ai-analysis-kit
```

## 라이선스

MIT
