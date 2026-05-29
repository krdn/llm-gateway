# llm-gateway-consumer-setup 스킬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소비자 프로젝트에서 `@krdn/llm-gateway`를 셋업하는 작업(설치·예제코드·자동업데이트 워크플로우·Renovate/Dependabot·등록 체크리스트)을 자동화하는 Claude Code 스킬을 만든다.

**Architecture:** 라이브러리 레포 `docs/skills/llm-gateway-consumer-setup/`에 스킬 소스(SKILL.md + templates/ + INSTALL.md)를 둔다. 워크플로우/설정 템플릿의 단일 진실 공급원을 `templates/`로 통일하고, 기존에 drift 중이던 `.github/consumer-workflow-template.yml`을 삭제하며 `consumer-guide.md`의 인라인 YAML을 템플릿 참조로 정리한다. 소비자 워크플로우의 dispatch 계약값은 발행자 `notify-consumers.yml`을 따른다.

**Tech Stack:** Markdown (SKILL.md), GitHub Actions YAML, JSON, TypeScript (예제 코드). 빌드 도구 없음 — 정적 파일 스킬.

---

## File Structure

생성:
- `docs/skills/llm-gateway-consumer-setup/SKILL.md` — 메인 스킬, 0~4단계 절차 정의
- `docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml` — 소비자 워크플로우 템플릿 (플레이스홀더 포함)
- `docs/skills/llm-gateway-consumer-setup/templates/renovate.json` — Renovate 설정 템플릿
- `docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml` — Dependabot 설정 템플릿
- `docs/skills/llm-gateway-consumer-setup/templates/example-usage.ts` — 기본 사용 예제
- `docs/skills/llm-gateway-consumer-setup/INSTALL.md` — 전역 설치 안내

수정:
- `docs/consumer-guide.md` — 인라인 YAML 블록(워크플로우/renovate/dependabot)을 템플릿 참조로 교체, dispatch 계약값을 notify-consumers.yml 기준으로 정정

삭제:
- `.github/consumer-workflow-template.yml` — 깨진 계약 + 모노레포 하드코딩. templates/가 대체

---

## dispatch 계약 (모든 워크플로우 템플릿이 따라야 하는 값)

출처: `.github/workflows/notify-consumers.yml`

| 항목 | 값 |
|------|-----|
| event-type / `types:` | `llm-gateway-release` |
| payload 필드 | `client_payload.tag` |
| secret 이름 (발행자 측) | `CONSUMER_DISPATCH_PAT` |

소비자 워크플로우는 `secrets.GITHUB_TOKEN`으로 PR을 만들고, dispatch payload의 `tag`를 읽어 버전을 정한다.

---

## Task 1: 디렉토리 + 소비자 워크플로우 템플릿 생성

**Files:**
- Create: `docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml`

- [ ] **Step 1: 템플릿 파일 작성**

`docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml` 생성. `{{PNPM_VERSION}}` / `{{NODE_VERSION}}`는 스킬이 실행 시 감지값으로 치환하는 플레이스홀더다. dispatch 계약값(`llm-gateway-release`, `client_payload.tag`)을 그대로 사용한다.

```yaml
# 이 파일은 @krdn/llm-gateway 소비자 레포에 복사됩니다.
# 경로: .github/workflows/update-llm-gateway.yml
# {{PNPM_VERSION}} / {{NODE_VERSION}} 는 설치 시 치환됩니다.
name: Update @krdn/llm-gateway

on:
  repository_dispatch:
    types: [llm-gateway-release]
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
          version: {{PNPM_VERSION}}

      - uses: actions/setup-node@v4
        with:
          node-version: {{NODE_VERSION}}
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
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: chore/update-llm-gateway-v${{ steps.update.outputs.updated }}
          delete-branch: true
          title: "chore(deps): @krdn/llm-gateway ${{ steps.update.outputs.current }} → ${{ steps.update.outputs.updated }}"
          commit-message: "chore(deps): @krdn/llm-gateway ${{ steps.update.outputs.updated }}"
          labels: dependencies
          body: |
            `@krdn/llm-gateway` 자동 업데이트 (${{ steps.update.outputs.current }} → ${{ steps.update.outputs.updated }})

            > llm-gateway 릴리스 dispatch(`llm-gateway-release`)로 자동 생성되었습니다.
```

- [ ] **Step 2: 파일 생성 확인**

Run: `test -f docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml && echo OK`
Expected: `OK`

- [ ] **Step 3: 플레이스홀더 존재 확인**

Run: `grep -c -E '\{\{(PNPM|NODE)_VERSION\}\}' docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml`
Expected: `2` 이상 (PNPM_VERSION, NODE_VERSION 각 1회 이상)

- [ ] **Step 4: 계약값 확인 (깨진 옛 값이 없어야 함)**

Run: `grep -E 'llm-gateway-updated|client_payload.version|CONSUMER_DISPATCH_TOKEN' docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml; echo "exit=$?"`
Expected: 출력 없음, `exit=1` (옛 계약값이 하나도 없음)

- [ ] **Step 5: Commit**

```bash
git add docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml
git commit -m "feat: 소비자 워크플로우 템플릿 추가 (dispatch 계약 정정)"
```

---

## Task 2: Renovate / Dependabot 템플릿 생성

**Files:**
- Create: `docs/skills/llm-gateway-consumer-setup/templates/renovate.json`
- Create: `docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml`

- [ ] **Step 1: renovate.json 작성**

`docs/skills/llm-gateway-consumer-setup/templates/renovate.json` 생성:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchPackageNames": ["@krdn/llm-gateway"],
      "automerge": true,
      "automergeType": "pr",
      "schedule": ["at any time"],
      "rangeStrategy": "bump",
      "labels": ["dependencies", "automerge"]
    }
  ]
}
```

- [ ] **Step 2: dependabot.yml 작성**

`docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml` 생성:

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

- [ ] **Step 3: JSON 유효성 확인**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/skills/llm-gateway-consumer-setup/templates/renovate.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: 두 파일 생성 확인**

Run: `ls docs/skills/llm-gateway-consumer-setup/templates/renovate.json docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml`
Expected: 두 경로 모두 출력

- [ ] **Step 5: Commit**

```bash
git add docs/skills/llm-gateway-consumer-setup/templates/renovate.json docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml
git commit -m "feat: Renovate/Dependabot 템플릿 추가"
```

---

## Task 3: 예제 사용 코드 템플릿 생성

**Files:**
- Create: `docs/skills/llm-gateway-consumer-setup/templates/example-usage.ts`

- [ ] **Step 1: example-usage.ts 작성**

`docs/skills/llm-gateway-consumer-setup/templates/example-usage.ts` 생성. consumer-guide.md의 기본 사용법 두 가지(analyzeText, analyzeStructured)를 담는다:

```typescript
import { analyzeText, analyzeStructured } from '@krdn/llm-gateway/gateway';
import { z } from 'zod';

// 1) 자유 텍스트 분석
export async function summarize(text: string) {
  const result = await analyzeText(text, {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return result.text;
}

// 2) 구조화 출력 (Zod 스키마 검증)
const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number(),
  summary: z.string(),
});

export async function analyzeSentiment(review: string) {
  const result = await analyzeStructured(review, SentimentSchema, {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    apiKey: process.env.OPENAI_API_KEY,
  });
  return result.object;
}
```

- [ ] **Step 2: 파일 생성 + import 경로 확인**

Run: `grep -q "@krdn/llm-gateway/gateway" docs/skills/llm-gateway-consumer-setup/templates/example-usage.ts && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add docs/skills/llm-gateway-consumer-setup/templates/example-usage.ts
git commit -m "feat: 기본 사용 예제 템플릿 추가"
```

---

## Task 4: SKILL.md 작성 (메인 절차)

**Files:**
- Create: `docs/skills/llm-gateway-consumer-setup/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

`docs/skills/llm-gateway-consumer-setup/SKILL.md` 생성. frontmatter + 0~4단계 절차. 템플릿은 스킬 디렉토리의 `templates/`를 Read해서 사용한다.

````markdown
---
name: llm-gateway-consumer-setup
description: >
  Use when setting up @krdn/llm-gateway in a new consumer project — installs the
  package, generates example usage code, adds the auto-update GitHub workflow,
  configures Renovate or Dependabot, and prints the library-repo registration
  checklist. Triggers on "llm-gateway 셋업", "소비자 프로젝트 구성", "gateway setup",
  "@krdn/llm-gateway 추가".
---

# @krdn/llm-gateway 소비자 셋업

소비자 프로젝트에서 `@krdn/llm-gateway`를 도입할 때 필요한 작업을 순서대로 수행한다.
**현재 디렉토리가 대상 소비자 레포라고 가정한다.**

## 원칙
- **추측 금지**: 패키지 매니저·node·pnpm 버전을 감지하거나 사용자에게 묻는다. 하드코딩하지 않는다.
- **멱등성**: 이미 있는 파일은 덮어쓰기 전 사용자에게 확인한다. `.env`는 없는 키만 추가한다.

## 0단계 — 환경 감지
1. git 레포 + `package.json` 존재 확인. 없으면 **중단**하고 "소비자 레포 루트에서 실행하세요"라고 알린다.
2. 패키지 매니저 감지:
   - `pnpm-lock.yaml` → pnpm / `package-lock.json` → npm / `yarn.lock` → yarn
   - lockfile이 없으면 사용자에게 어떤 매니저를 쓸지 묻는다.
3. node 버전: 소비자 레포의 `.nvmrc`, `package.json`의 `engines.node`, 또는 로컬 `node -v`에서 메이저 버전을 정한다. 못 정하면 사용자에게 묻는다.
4. pnpm 버전: `package.json`의 `packageManager` 필드(`pnpm@10.x`) 또는 `pnpm -v`에서 메이저 버전을 정한다. 못 정하면 사용자에게 묻는다.
5. `.github/workflows/update-llm-gateway.yml`이 이미 있는지 확인한다.

## 1단계 — 설치 + 예제 코드
1. 감지된 매니저로 설치: `pnpm add @krdn/llm-gateway` (npm/yarn은 그에 맞게).
2. 설치 검증: `package.json`의 `dependencies`에 `@krdn/llm-gateway`가 추가됐는지 확인하고 결과를 보고한다.
3. `.env.example`(있으면, 없으면 `.env`)에 다음 키가 없으면 append한다 (기존 내용 보존):
   ```
   ANTHROPIC_API_KEY=
   OPENAI_API_KEY=
   ```
4. 예제 코드 위치를 **사용자에게 묻는다** (예: `src/lib/llm.ts`). 추측 경로로 강제 생성하지 않는다.
   사용자가 위치를 주면 이 스킬의 `templates/example-usage.ts`를 Read해서 그 경로에 쓴다.

## 2단계 — 자동 업데이트 워크플로우
1. `.github/workflows/` 디렉토리가 없으면 만든다.
2. 이 스킬의 `templates/update-llm-gateway.yml`을 Read한다.
3. `{{PNPM_VERSION}}` → 0단계 pnpm 메이저 버전, `{{NODE_VERSION}}` → 0단계 node 메이저 버전으로 치환한다.
4. `.github/workflows/update-llm-gateway.yml`로 쓴다. 이미 있으면 덮어쓰기 전 확인한다.

## 3단계 — Renovate / Dependabot (택1)
1. 사용자에게 Renovate(권장) / Dependabot 중 선택받는다.
2. Renovate면 `templates/renovate.json`을 `.github/renovate.json`으로, Dependabot이면 `templates/dependabot.yml`을 `.github/dependabot.yml`로 복사한다.
3. Renovate 선택 시: GitHub repo에 Renovate App 설치가 필요함을 안내한다.

## 4단계 — 라이브러리 레포 등록 체크리스트 (출력만, 파일 생성 없음)
다음을 그대로 출력한다:

> ✅ 소비자 셋업 완료. 자동 PR이 발화하려면 **라이브러리(llm-gateway) 레포에서** 다음 수동 단계가 필요합니다:
>
> 1. `.github/workflows/notify-consumers.yml`의 dispatch 대상에 이 레포(`<owner>/<repo>`)를 추가하세요.
>    현재는 `krdn/gons-dashboard` 단일 step입니다. 소비자가 여러 개이므로 matrix로 전환하는 것이 좋습니다.
> 2. `CONSUMER_DISPATCH_PAT` Fine-grained PAT에 이 레포 접근 권한을 추가하세요.
>    (https://github.com/settings/tokens → 해당 토큰 편집 → Repository access)
>
> 이 두 단계 전까지는 schedule(cron) 백업 경로로만 업데이트됩니다.
````

- [ ] **Step 2: frontmatter 유효성 확인**

Run: `head -10 docs/skills/llm-gateway-consumer-setup/SKILL.md`
Expected: 첫 줄 `---`, `name: llm-gateway-consumer-setup`, `description:` 포함

- [ ] **Step 3: 옛 계약값 누출 없음 확인**

Run: `grep -E 'llm-gateway-updated|CONSUMER_DISPATCH_TOKEN|client_payload.version' docs/skills/llm-gateway-consumer-setup/SKILL.md; echo "exit=$?"`
Expected: 출력 없음, `exit=1`

- [ ] **Step 4: Commit**

```bash
git add docs/skills/llm-gateway-consumer-setup/SKILL.md
git commit -m "feat: SKILL.md 작성 (0~4단계 소비자 셋업 절차)"
```

---

## Task 5: INSTALL.md 작성 (전역 설치 안내)

**Files:**
- Create: `docs/skills/llm-gateway-consumer-setup/INSTALL.md`

- [ ] **Step 1: INSTALL.md 작성**

`docs/skills/llm-gateway-consumer-setup/INSTALL.md` 생성:

````markdown
# 설치: llm-gateway-consumer-setup 스킬

이 스킬의 소스는 llm-gateway 레포에 있습니다. 어느 소비자 레포에서든 호출하려면
전역 스킬 디렉토리로 복사하세요.

```bash
cp -r docs/skills/llm-gateway-consumer-setup ~/.claude/skills/
```

복사 후 Claude Code에서 "llm-gateway 셋업" 또는 `/llm-gateway-consumer-setup`으로 호출합니다.

## 갱신

전역 설치본은 복사 시점에 freeze됩니다. **라이브러리 레포에서 스킬이 갱신되면 다시 복사**해야
최신 절차/템플릿이 반영됩니다:

```bash
rm -rf ~/.claude/skills/llm-gateway-consumer-setup
cp -r docs/skills/llm-gateway-consumer-setup ~/.claude/skills/
```
````

- [ ] **Step 2: 생성 확인**

Run: `grep -q '~/.claude/skills/' docs/skills/llm-gateway-consumer-setup/INSTALL.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add docs/skills/llm-gateway-consumer-setup/INSTALL.md
git commit -m "docs: 스킬 전역 설치 안내(INSTALL.md) 추가"
```

---

## Task 6: 깨진 옛 템플릿 삭제

**Files:**
- Delete: `.github/consumer-workflow-template.yml`

- [ ] **Step 1: 삭제 전 내용이 templates/로 대체됐는지 확인**

Run: `test -f docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml && echo "replacement exists"`
Expected: `replacement exists`

- [ ] **Step 2: 삭제**

Run: `git rm .github/consumer-workflow-template.yml`
Expected: `rm '.github/consumer-workflow-template.yml'`

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: 깨진 소비자 워크플로우 템플릿 삭제 (templates/가 대체)

기존 .github/consumer-workflow-template.yml은 llm-gateway-updated +
client_payload.version을 listen했으나 발행자는 llm-gateway-release + tag를
보내 발화하지 않았음. 올바른 계약의 docs/skills/.../templates/로 대체."
```

---

## Task 7: consumer-guide.md 정리 (인라인 YAML 제거 + 계약값 정정)

**Files:**
- Modify: `docs/consumer-guide.md`

- [ ] **Step 1: 자동 업데이트 섹션(2단계 워크플로우)의 인라인 YAML 블록 교체**

`docs/consumer-guide.md`에서 "### 2단계: 소비자 레포에 업데이트 워크플로우 추가" 아래의 큰 YAML 코드블록(`name: Update @krdn/llm-gateway` ... `labels: dependencies`)을 다음으로 교체한다:

```markdown
### 2단계: 소비자 레포에 업데이트 워크플로우 추가

`llm-gateway-consumer-setup` 스킬을 실행하면 환경(매니저·node·pnpm 버전)을 감지해
`.github/workflows/update-llm-gateway.yml`을 자동 생성합니다.

수동으로 추가하려면 템플릿을 복사하세요:
`docs/skills/llm-gateway-consumer-setup/templates/update-llm-gateway.yml`
(`{{PNPM_VERSION}}` / `{{NODE_VERSION}}`를 프로젝트 값으로 치환)

> dispatch 계약: 발행자 `notify-consumers.yml`은 `event-type: llm-gateway-release`,
> payload `{"tag": ...}`를 보냅니다. 워크플로우의 `types:`는 `llm-gateway-release`여야 합니다.
```

- [ ] **Step 2: 3단계 Renovate/Dependabot 인라인 블록 교체**

"### 3단계: Dependabot 또는 Renovate 설정" 아래의 dependabot/renovate 코드블록 두 개를 다음으로 교체한다 (옵션 설명 표는 유지):

```markdown
### 3단계: Dependabot 또는 Renovate 설정 (백업)

템플릿을 복사하세요 (둘 중 하나만):
- Dependabot: `docs/skills/llm-gateway-consumer-setup/templates/dependabot.yml` → `.github/dependabot.yml`
- Renovate(권장): `docs/skills/llm-gateway-consumer-setup/templates/renovate.json` → `.github/renovate.json`

Renovate를 사용하려면 GitHub repo에 [Renovate App](https://github.com/apps/renovate)을 설치해야 합니다.
```

- [ ] **Step 3: 1단계 등록 안내의 계약값 정정**

"### 1단계: llm-gateway 레포에 소비자 등록" 본문에서 `publish.yml`/`matrix.repo`/`CONSUMER_DISPATCH_TOKEN`/`ai-signalcraft` 언급을 실제 값으로 정정한다:
- 파일: `.github/workflows/notify-consumers.yml`
- secret: `CONSUMER_DISPATCH_PAT`
- 현재 단일 step(`krdn/gons-dashboard`)을 matrix로 확장해 새 소비자를 추가한다고 기술

교체 텍스트:

````markdown
### 1단계: llm-gateway 레포에 소비자 등록

`.github/workflows/notify-consumers.yml`에 새 소비자 레포로의 dispatch를 추가합니다.
현재는 `krdn/gons-dashboard` 단일 step이므로, 소비자가 여러 개라면 matrix로 전환하세요:

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo:
          - krdn/gons-dashboard
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
````

- [ ] **Step 4: 옛 계약값이 문서에 남아있지 않은지 확인**

Run: `grep -nE 'llm-gateway-updated|CONSUMER_DISPATCH_TOKEN|client_payload.version|publish\.yml' docs/consumer-guide.md; echo "exit=$?"`
Expected: 출력 없음, `exit=1` (매칭이 남으면 해당 라인을 검토해 정정)

- [ ] **Step 5: Commit**

```bash
git add docs/consumer-guide.md
git commit -m "docs: consumer-guide 인라인 YAML 제거 + dispatch 계약값 정정

워크플로우/renovate/dependabot 전문을 templates/ 참조로 교체(DRY).
dispatch 계약을 notify-consumers.yml 실제 값(llm-gateway-release, tag,
CONSUMER_DISPATCH_PAT)으로 정정."
```

---

## Task 8: 전역 설치 + 스모크 검증

**Files:** 없음 (설치 동작 검증)

- [ ] **Step 1: 전역으로 설치**

Run: `rm -rf ~/.claude/skills/llm-gateway-consumer-setup && cp -r docs/skills/llm-gateway-consumer-setup ~/.claude/skills/ && ls ~/.claude/skills/llm-gateway-consumer-setup/`
Expected: `INSTALL.md  SKILL.md  templates` (3개 항목)

- [ ] **Step 2: 템플릿 4개 모두 설치됐는지 확인**

Run: `ls ~/.claude/skills/llm-gateway-consumer-setup/templates/`
Expected: `dependabot.yml  example-usage.ts  renovate.json  update-llm-gateway.yml`

- [ ] **Step 3: 최종 보고**

스킬이 새 세션에서 인식되려면 Claude Code 재시작이 필요할 수 있음을 사용자에게 안내한다. 설치 경로와 호출 방법(`/llm-gateway-consumer-setup` 또는 "llm-gateway 셋업")을 보고한다.

---

## Self-Review

**Spec coverage:**
- 0~4단계 → Task 4 (SKILL.md)에 전부 반영 ✓
- 소스는 레포 / 설치는 전역 → Task 1~7(소스) + Task 5·8(설치) ✓
- templates/ 단일 소스 + 옛 파일 삭제 + consumer-guide 정리 → Task 6·7 ✓
- dispatch 계약(notify-consumers.yml) → Task 1·4·7에 계약값 명시 + 옛 값 누출 검증 ✓
- 추측 금지·멱등성 → Task 4 SKILL.md 원칙 + 0단계 감지 ✓
- 모노레포 가정 제거 → Task 1 템플릿이 flat `pnpm update`만 사용 ✓
- 범위 밖(릴리스 자동화, notify-consumers 실제 matrix 전환) → 플랜에서 제외 ✓

**Placeholder scan:** 템플릿의 `{{PNPM_VERSION}}`/`{{NODE_VERSION}}`는 의도된 치환 토큰(스킬이 런타임 치환). 플랜 자체에는 미완성 placeholder 없음 ✓

**Type/값 일관성:** 모든 Task가 동일 계약값(`llm-gateway-release`, `client_payload.tag`, `CONSUMER_DISPATCH_PAT`) 사용. 디렉토리 경로 `docs/skills/llm-gateway-consumer-setup/` 일관 ✓
