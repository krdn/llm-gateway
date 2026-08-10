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
├─① publish.yml → npm publish (즉시)
│   └─ 같은 워크플로우의 notify job이 소비자 레포에 dispatch 전송 → 즉시 PR 생성
│
├─② Dependabot (매일)
│   └─ npm 레지스트리에서 새 버전 감지 → PR 생성
│
└─③ cron 워크플로우 (매일, 백업)
    └─ npm 레지스트리에서 새 버전 확인 → PR 생성
```

### 1단계: llm-gateway 레포에 소비자 등록

`.github/workflows/publish.yml`의 `notify` job matrix에 새 소비자 레포를 추가합니다
(현재 `krdn/gons-dashboard`, `krdn/ai-signalcraft` 두 개가 등록되어 있습니다):

```yaml
jobs:
  notify:
    needs: publish
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false # 한 소비자 dispatch 실패가 다른 소비자 알림을 취소하지 않도록
      matrix:
        repo:
          - krdn/gons-dashboard
          - krdn/ai-signalcraft
          - krdn/새-소비자-레포   # ← 추가
    steps:
      - uses: peter-evans/repository-dispatch@ff45666b9427631e3450c54a1bcbee4d9ff4d7c0 # v3
        with:
          token: ${{ secrets.CONSUMER_DISPATCH_PAT }}
          repository: ${{ matrix.repo }}
          event-type: llm-gateway-release
          client-payload: '{"tag": "${{ github.event.release.tag_name }}"}'
```

그리고 `CONSUMER_DISPATCH_PAT` Fine-grained PAT에 새 레포 접근 권한을 추가합니다
(https://github.com/settings/tokens → 토큰 편집 → Repository access).

### 2단계: 소비자 레포에 업데이트 워크플로우 추가

`llm-gateway-consumer-setup` 스킬을 실행하면 환경(매니저·node·pnpm 버전)을 감지해
`.github/workflows/update-llm-gateway.yml`을 자동 생성합니다.

수동으로 추가하려면 템플릿을 복사하세요:
`docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml`
(`{{PNPM_VERSION}}` / `{{NODE_VERSION}}`를 프로젝트 값으로 치환)

> dispatch 계약: 발행자(`publish.yml`의 `notify` job)는 `event-type: llm-gateway-release`,
> payload `{"tag": ...}`를 보냅니다. 워크플로우의 `types:`는 `llm-gateway-release`여야 합니다.

### 3단계: Dependabot 또는 Renovate 설정 (백업)

템플릿을 복사하세요 (둘 중 하나만):
- Dependabot: `docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml` → `.github/dependabot.yml`
- Renovate(권장): `docs/skills/llm-gateway-consumer-setup/templates/renovate.json` → `.github/renovate.json`

Renovate를 사용하려면 GitHub repo에 [Renovate App](https://github.com/apps/renovate)을 설치해야 합니다.

**Renovate 주요 옵션 설명:**

| 옵션 | 값 | 설명 |
|------|-----|------|
| `automerge` | `true` | CI 통과 시 자동 머지 |
| `schedule` | `["at any time"]` | 새 버전 감지 즉시 PR 생성 |
| `rangeStrategy` | `"bump"` | `^3.3.0` → `^3.4.0`으로 범위 갱신 |

자동 머지를 원하지 않으면 `automerge: false`로 변경합니다.

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
