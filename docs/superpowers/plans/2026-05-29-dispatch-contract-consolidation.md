# dispatch 계약 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `publish.yml`의 레거시 notify-consumers 잡을 제거하고, 그 대상(`ai-signalcraft`)을 신 계약을 쓰는 `notify-consumers.yml`로 이전해 dispatcher를 하나로 통합한다.

**Architecture:** GitHub Actions 워크플로우 2개를 편집한다. publish.yml은 publish 잡만 남기고 이름을 동작에 맞게 바꾼다. notify-consumers.yml은 단일 step을 matrix로 전환해 두 소비자(gons-dashboard, ai-signalcraft)를 신 계약(`llm-gateway-release`/`tag`/`CONSUMER_DISPATCH_PAT`)으로 통일한다.

**Tech Stack:** GitHub Actions YAML. 빌드/단위테스트 없음 — YAML 구조 검증만.

---

## File Structure

수정:
- `.github/workflows/publish.yml` — notify-consumers 잡 삭제 + 워크플로우 name 변경
- `.github/workflows/notify-consumers.yml` — 단일 step → matrix(gons-dashboard + ai-signalcraft)

---

## 현재 파일 내용 (참고)

`publish.yml`은 `name: Publish & Notify Consumers`, 최상위 `permissions: contents: read`, `publish` 잡(npm publish)과 `notify-consumers` 잡(레거시 dispatch, matrix=ai-signalcraft, `llm-gateway-updated`, `CONSUMER_DISPATCH_TOKEN`)으로 구성. `notify-consumers` 잡은 33~51줄.

`notify-consumers.yml`은 `name: Notify consumers on release`, `on: release: types: [published]`, `notify-gons-dashboard` 잡 단일 step(`repository-dispatch@ff45666...`, token `CONSUMER_DISPATCH_PAT`, repository `krdn/gons-dashboard`, event-type `llm-gateway-release`, client-payload `{"tag": ...}`).

---

## Task 1: publish.yml — 레거시 notify 잡 삭제 + 이름 변경

**Files:**
- Modify: `.github/workflows/publish.yml`

- [ ] **Step 1: 현재 파일 Read**

`.github/workflows/publish.yml`을 Read해 정확한 현재 텍스트를 확인한다.

- [ ] **Step 2: 워크플로우 이름 변경**

첫 줄을 교체한다:
```
name: Publish & Notify Consumers
```
→
```
name: Publish to npm
```

- [ ] **Step 3: notify-consumers 잡 삭제**

`publish` 잡 끝(`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 줄)부터 파일 끝까지 중, `notify-consumers:` 잡 블록 전체를 삭제한다. 삭제 대상은 아래 블록 (들여쓰기·내용 정확히 현재 파일 따름):

```yaml
  notify-consumers:
    needs: publish
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo:
          - krdn/ai-signalcraft
    steps:
      - name: Dispatch update event to ${{ matrix.repo }}
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.CONSUMER_DISPATCH_TOKEN }}
          repository: ${{ matrix.repo }}
          event-type: llm-gateway-updated
          client-payload: |
            {
              "version": "${{ github.event.release.tag_name }}",
              "npm_version": "${{ github.event.release.tag_name }}"
            }
```

결과적으로 `publish` 잡만 남고, 파일은 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 줄에서 끝난다 (잡 사이 빈 줄도 함께 제거).

- [ ] **Step 4: 검증 — 레거시 흔적 없음**

Run: `grep -nE 'notify-consumers|CONSUMER_DISPATCH_TOKEN|llm-gateway-updated|ai-signalcraft' .github/workflows/publish.yml; echo "exit=$?"`
Expected: 출력 없음, `exit=1`

- [ ] **Step 5: 검증 — 이름 변경 + publish 잡 보존**

Run: `head -1 .github/workflows/publish.yml; grep -c 'pnpm publish' .github/workflows/publish.yml`
Expected: `name: Publish to npm` 그리고 `1`

- [ ] **Step 6: 검증 — YAML 유효성**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/publish.yml')); print(list(d['jobs'].keys()))"`
Expected: `['publish']`

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "refactor(ci): publish.yml 레거시 notify 잡 제거 + 이름 변경

레거시 dispatch(llm-gateway-updated/version/CONSUMER_DISPATCH_TOKEN)를 제거.
소비자 알림은 notify-consumers.yml(신 계약)로 일원화. 워크플로우 이름을
실제 동작에 맞춰 'Publish to npm'으로 변경."
```

---

## Task 2: notify-consumers.yml — matrix로 ai-signalcraft 이전

**Files:**
- Modify: `.github/workflows/notify-consumers.yml`

- [ ] **Step 1: 현재 파일 Read**

`.github/workflows/notify-consumers.yml`을 Read해 정확한 현재 텍스트를 확인한다.

- [ ] **Step 2: 단일 step 잡을 matrix로 교체**

`jobs:` 아래 `notify-gons-dashboard` 잡 전체를 아래로 교체한다. 신 계약값(event-type `llm-gateway-release`, payload `{"tag": ...}`, token `CONSUMER_DISPATCH_PAT`, SHA 고정)은 유지하고, repository만 `${{ matrix.repo }}`로 바꾼다:

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo:
          - krdn/gons-dashboard
          - krdn/ai-signalcraft
    steps:
      - name: Dispatch release event to ${{ matrix.repo }}
        uses: peter-evans/repository-dispatch@ff45666b9427631e3450c54a1bcbee4d9ff4d7c0 # v3
        with:
          token: ${{ secrets.CONSUMER_DISPATCH_PAT }}
          repository: ${{ matrix.repo }}
          event-type: llm-gateway-release
          client-payload: '{"tag": "${{ github.event.release.tag_name }}"}'
```

파일 상단(`name:`, `on:`)은 그대로 둔다.

- [ ] **Step 3: 검증 — 두 소비자 + 신 계약값**

Run: `grep -E 'gons-dashboard|ai-signalcraft|llm-gateway-release|CONSUMER_DISPATCH_PAT' .github/workflows/notify-consumers.yml`
Expected: 4개 모두 등장 (gons-dashboard, ai-signalcraft, llm-gateway-release, CONSUMER_DISPATCH_PAT)

- [ ] **Step 4: 검증 — 레거시 계약값 없음**

Run: `grep -nE 'llm-gateway-updated|CONSUMER_DISPATCH_TOKEN|npm_version' .github/workflows/notify-consumers.yml; echo "exit=$?"`
Expected: 출력 없음, `exit=1`

- [ ] **Step 5: 검증 — YAML 유효성 + matrix 구조**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/notify-consumers.yml')); print(d['jobs']['notify']['strategy']['matrix']['repo'])"`
Expected: `['krdn/gons-dashboard', 'krdn/ai-signalcraft']`

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/notify-consumers.yml
git commit -m "feat(ci): notify-consumers matrix로 ai-signalcraft 신 계약 이전

publish.yml 레거시 잡에서 ai-signalcraft를 받던 것을 notify-consumers.yml의
matrix(gons-dashboard + ai-signalcraft)로 통합. 두 소비자 모두 신 계약
(llm-gateway-release/tag/CONSUMER_DISPATCH_PAT) 사용."
```

---

## Task 3: 마무리 안내 출력 (파일 변경 없음)

**Files:** 없음

- [ ] **Step 1: ai-signalcraft 후속 안내 출력**

다음을 사용자에게 출력한다:

> ✅ dispatcher 통합 완료 — notify-consumers.yml 하나가 gons-dashboard + ai-signalcraft에 신 계약으로 dispatch.
>
> 🔴 **ai-signalcraft 자동 업데이트가 지금부터 작동 중단 상태입니다.** 이 변경 전에는
> publish.yml 레거시 잡(`llm-gateway-updated`)과 ai-signalcraft의 레거시 리스너가 정상 페어로
> 작동 중이었습니다. 이제 ai-signalcraft는 `llm-gateway-release`를 받지만 그쪽 워크플로우는
> 여전히 `llm-gateway-updated`를 들으므로 발화하지 않습니다. 삭제된 레거시 템플릿에 cron이
> 없었던 점으로 보아 **cron 폴백이 없어 자가복구되지 않을 공산이 큽니다** — 다음 릴리스 전에
> 아래 두 단계를 **반드시** 처리해야 합니다 (다른 레포 / secret 설정이라 자동화 불가):
> 1. `ai-signalcraft` 레포의 소비자 워크플로우가 ① 어떤 event-type을 듣는지 ② cron이 있는지
>    확인하고, `types: [llm-gateway-release]`를 듣도록 교체하세요.
>    그 레포에서 `llm-gateway-consumer-setup` 스킬을 실행하면 신 계약 템플릿(cron 포함)이 적용됩니다.
> 2. `CONSUMER_DISPATCH_PAT` PAT에 `ai-signalcraft` 접근 권한이 있는지 확인하세요.
>    (레거시는 `CONSUMER_DISPATCH_TOKEN`을 썼으므로 PAT가 다를 수 있음)
>
> 참고: `CONSUMER_DISPATCH_TOKEN` secret은 이제 어디서도 참조되지 않는 고아 상태입니다(무해, 정리 선택).

---

## Self-Review

**Spec coverage:**
- publish.yml 레거시 잡 삭제 + 이름 변경 → Task 1 ✓
- notify-consumers.yml matrix 전환(두 소비자, 신 계약) → Task 2 ✓
- ai-signalcraft 후속 + PAT 권한 안내 → Task 3 ✓
- 검증(YAML 유효, 레거시 흔적 없음, 신 계약값 유지) → Task 1·2의 검증 step ✓
- 범위 밖(ai-signalcraft 레포 수정) → Task 3 안내로만, 직접 수정 없음 ✓

**Placeholder scan:** 미완성 placeholder 없음. 모든 step에 실제 명령/내용 포함 ✓

**값 일관성:** 신 계약값(`llm-gateway-release`/payload `{"tag"}`/`CONSUMER_DISPATCH_PAT`)이 Task 2와 spec 전반에서 일치. matrix 잡 이름 `notify`로 통일 ✓
