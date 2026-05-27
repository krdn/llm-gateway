# @krdn/llm-gateway 소비자 가이드

새 프로젝트에서 llm-gateway를 사용하고, 자동 업데이트를 구성하는 방법을 설명합니다.

## 설치

```bash
pnpm add @krdn/llm-gateway
```

## 기본 사용법

### 자유 텍스트 분석

```typescript
import { analyzeText } from '@krdn/llm-gateway/gateway';

const result = await analyzeText('이 기사를 요약해줘', {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
console.log(result.text);
```

### 구조화 출력 (Zod 스키마 검증)

```typescript
import { analyzeStructured } from '@krdn/llm-gateway/gateway';
import { z } from 'zod';

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number(),
  summary: z.string(),
});

const result = await analyzeStructured(
  '이 리뷰의 감정을 분석해줘: 정말 최고의 제품입니다!',
  SentimentSchema,
  { provider: 'openai', model: 'gpt-4.1-nano', apiKey: process.env.OPENAI_API_KEY },
);
console.log(result.object); // { sentiment: 'positive', score: 95, summary: '...' }
```

### 모듈 실행 (재시도 + 부분 실패 허용)

```typescript
import { runModule } from '@krdn/llm-gateway/runner';
import { createInMemoryModelConfig } from '@krdn/llm-gateway/adapters';

const configAdapter = createInMemoryModelConfig({
  modules: {
    'sentiment': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  },
  providerDefaults: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  },
});

const result = await runModule(sentimentModule, inputData, {
  configAdapter,
  extractMeta: (input) => ({ jobId: input.id, itemCount: input.items.length }),
});
// result.status === 'completed' | 'failed' | 'skipped'
```

## 지원 프로바이더

| 프로바이더 | provider 값 | 비고 |
|-----------|------------|------|
| Anthropic | `anthropic` | Claude |
| OpenAI | `openai` | GPT |
| Google | `gemini` | Gemini |
| DeepSeek | `deepseek` | |
| xAI | `xai` | Grok |
| OpenRouter | `openrouter` | 멀티 프로바이더 |
| Ollama | `ollama` | 로컬 |
| Claude CLI | `claude-cli` | 프록시 |
| Gemini CLI | `gemini-cli` | 프록시 |
| Custom | `custom` | OpenAI 호환 |

## 패키지 서브패스

```
@krdn/llm-gateway           # 전체
@krdn/llm-gateway/gateway   # Gateway만 (analyzeText, analyzeStructured, normalizeUsage)
@krdn/llm-gateway/adapters  # 어댑터 인터페이스 + in-memory 구현
@krdn/llm-gateway/runner    # runModule + retryWithPolicy + retry utils
```

---

## 자동 업데이트 구성

llm-gateway에서 새 버전이 릴리스되면, 소비자 프로젝트에 자동으로 PR이 생성되도록 구성합니다.

### 동작 흐름

```
llm-gateway에서 GitHub Release 생성
│
├─① publish.yml (즉시)
│   ├─ npm에 자동 publish
│   └─ 소비자 레포에 dispatch 이벤트 전송 → 즉시 PR 생성
│
├─② Dependabot (매일)
│   └─ npm 레지스트리에서 새 버전 감지 → PR 생성
│
└─③ cron 워크플로우 (매일, 백업)
    └─ git tag 체크 → PR 생성
```

### 1단계: llm-gateway 레포에 소비자 등록

`.github/workflows/publish.yml`의 `matrix.repo`에 새 레포를 추가합니다:

```yaml
notify-consumers:
  needs: publish
  strategy:
    matrix:
      repo:
        - krdn/ai-signalcraft      # 기존
        - krdn/새-프로젝트-이름     # ← 추가
```

`CONSUMER_DISPATCH_TOKEN`의 Fine-grained PAT에도 새 레포 접근 권한을 추가해야 합니다:

1. https://github.com/settings/tokens → `llm-gateway-dispatch` 토큰 편집
2. Repository access에 새 레포 추가

### 2단계: 소비자 레포에 업데이트 워크플로우 추가

`.github/workflows/update-llm-gateway.yml` 파일을 생성합니다:

```yaml
name: Update @krdn/llm-gateway

on:
  repository_dispatch:
    types: [llm-gateway-updated]
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  check-update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10      # 프로젝트 pnpm 버전에 맞춰 변경

      - uses: actions/setup-node@v4
        with:
          node-version: 20  # 프로젝트 node 버전에 맞춰 변경
          cache: pnpm

      - name: Update @krdn/llm-gateway
        id: update
        run: |
          CURRENT=$(pnpm list @krdn/llm-gateway --json 2>/dev/null \
            | grep -oP '"version":\s*"\K[^"]+' | head -1 || echo "0.0.0")

          pnpm update @krdn/llm-gateway
          pnpm install

          UPDATED=$(pnpm list @krdn/llm-gateway --json 2>/dev/null \
            | grep -oP '"version":\s*"\K[^"]+' | head -1 || echo "0.0.0")

          if [ "$CURRENT" = "$UPDATED" ]; then
            echo "needs_pr=false" >> "$GITHUB_OUTPUT"
          else
            echo "needs_pr=true" >> "$GITHUB_OUTPUT"
            echo "current=$CURRENT" >> "$GITHUB_OUTPUT"
            echo "updated=$UPDATED" >> "$GITHUB_OUTPUT"
          fi

      - name: Create Pull Request
        if: steps.update.outputs.needs_pr == 'true'
        uses: peter-evans/create-pull-request@v7
        with:
          branch: chore/update-llm-gateway-v${{ steps.update.outputs.updated }}
          delete-branch: true
          title: "chore(deps): @krdn/llm-gateway ${{ steps.update.outputs.current }} → ${{ steps.update.outputs.updated }}"
          body: |
            `@krdn/llm-gateway` 자동 업데이트
          labels: dependencies
```

### 3단계: Dependabot 설정 (백업)

`.github/dependabot.yml` 파일을 생성합니다:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    allow:
      - dependency-name: "@krdn/llm-gateway"
    labels:
      - dependencies
    commit-message:
      prefix: "chore(deps)"
```

---

## 버전 업데이트 방법 (llm-gateway 관리자용)

### 1. 코드 변경 후 버전 올리기

`package.json`의 `version` 필드를 수정합니다:

| 변경 유형 | 예시 | 설명 |
|-----------|------|------|
| patch | `3.3.0` → `3.3.1` | 버그 수정 |
| minor | `3.3.0` → `3.4.0` | 기능 추가 |
| major | `3.3.0` → `4.0.0` | 호환성 깨지는 변경 |

### 2. 커밋 + 푸시

```bash
git add .
git commit -m "release: v3.4.0 — 변경 내용 설명"
git push origin main
```

### 3. GitHub Release 생성

```bash
gh release create v3.4.0 --title "v3.4.0" --notes "변경 내용 설명"
```

또는 GitHub 웹에서:

1. https://github.com/krdn/llm-gateway/releases/new 접속
2. **Tag**: `v3.4.0` 입력
3. **Title**: `v3.4.0`
4. **Description**: 변경 내용 작성
5. **Publish release** 클릭

**이후 npm publish + 소비자 PR 생성이 전부 자동으로 진행됩니다.**
