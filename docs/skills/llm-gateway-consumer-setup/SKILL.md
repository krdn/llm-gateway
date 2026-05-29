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
> 1. `.github/workflows/notify-consumers.yml`의 dispatch 대상에 이 레포를 추가하세요.
>    이 레포 주소는 `git remote get-url origin`으로 확인합니다.
>    현재는 `krdn/gons-dashboard` 단일 step입니다. 소비자가 여러 개이므로 matrix로 전환하는 것이 좋습니다.
> 2. `CONSUMER_DISPATCH_PAT` Fine-grained PAT에 이 레포 접근 권한을 추가하세요.
>    (https://github.com/settings/tokens → 해당 토큰 편집 → Repository access)
>
> 이 두 단계 전까지는 schedule(cron) 백업 경로로만 업데이트됩니다.
