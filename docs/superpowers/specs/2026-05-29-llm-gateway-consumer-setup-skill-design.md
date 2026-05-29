# llm-gateway-consumer-setup 스킬 설계

날짜: 2026-05-29

## 목적

소비자(consumer) 프로젝트에서 `@krdn/llm-gateway`를 처음 도입할 때 필요한 반복 작업을
하나의 스킬로 자동화한다. 현재 `docs/consumer-guide.md`에 수동 절차로 흩어져 있는 작업을
스킬 호출 한 번으로 처리한다.

## 스킬 정체성

- **이름**: `llm-gateway-consumer-setup`
- **유형**: 절차(workflow) 스킬 — 대상 소비자 레포에서 셸 명령 실행 + 파일 생성
- **실행 위치**: 소비자 프로젝트 루트

## 저장/설치 구조 (소스는 레포, 설치는 전역)

- **소스(canonical)**: 이 라이브러리 레포의 `docs/skills/llm-gateway-consumer-setup/`
  — git에 커밋되어 배포·버전관리됨
- **설치**: `~/.claude/skills/llm-gateway-consumer-setup/`로 복사 → 어느 소비자 레포에서든 호출 가능
- 전역 설치본은 복사 시점에 freeze된다. 라이브러리 측 스킬 소스가 갱신되면 전역 사본은 stale —
  `INSTALL.md`에 "라이브러리 측 스킬 갱신 후 재복사 필요" 한 줄을 명시한다.

## 디렉토리 구조 (소스)

```
docs/skills/llm-gateway-consumer-setup/
├── SKILL.md                          # 메인 스킬 (frontmatter + 절차)
├── templates/
│   ├── update-llm-gateway.yml        # 워크플로우 템플릿 ({{PNPM_VERSION}}, {{NODE_VERSION}} 플레이스홀더)
│   ├── renovate.json                 # Renovate 템플릿
│   ├── dependabot.yml                # Dependabot 템플릿
│   └── example-usage.ts              # 기본 사용 예제 (analyzeText / analyzeStructured)
└── INSTALL.md                        # ~/.claude/skills/로 설치하는 방법 안내
```

### SKILL.md frontmatter (초안)

```yaml
---
name: llm-gateway-consumer-setup
description: >
  Use when setting up @krdn/llm-gateway in a new consumer project — installs the
  package, generates example usage code, adds the auto-update GitHub workflow,
  configures Renovate or Dependabot, and prints the library-repo registration
  checklist. Triggers on "llm-gateway 셋업", "소비자 프로젝트 구성", "gateway setup".
---
```

## 스킬이 수행하는 단계

### 0단계 — 환경 감지 (선행 점검)
- 현재 디렉토리가 git 레포인지, `package.json`이 있는지 확인
- 패키지 매니저 감지: lockfile로 판별 (`pnpm-lock.yaml`→pnpm, `package-lock.json`→npm, `yarn.lock`→yarn)
- `.github/workflows/update-llm-gateway.yml` 존재 여부 확인 (있으면 덮어쓰기 확인)

### 1단계 — 패키지 설치 + 기본 코드
- 감지된 매니저로 `add @krdn/llm-gateway` 실행
- `.env` / `.env.example`에 `ANTHROPIC_API_KEY` 등 키 자리 추가 — 기존 파일 보존, 없는 키만 append
- 사용 예제 파일(`templates/example-usage.ts`): **생성 위치를 사용자에게 물어본 뒤** 생성.
  `src/lib/llm.ts` 같은 추측 경로를 강제 생성하지 않는다.

### 2단계 — 자동 업데이트 워크플로우
- `templates/update-llm-gateway.yml`을 읽어 `{{PNPM_VERSION}}` / `{{NODE_VERSION}}`를
  0단계에서 감지한 값으로 치환 후 `.github/workflows/update-llm-gateway.yml`로 생성
- `.github/workflows/` 디렉토리가 없으면 먼저 생성

### 3단계 — Renovate / Dependabot (택1)
- 사용자에게 Renovate(권장) / Dependabot 중 선택받아 해당 파일 1개만 생성

### 4단계 — 라이브러리 레포 등록 체크리스트 출력
- 파일 생성 없음. 다음 수동 절차를 안내 텍스트로 출력:
  1. llm-gateway `publish.yml`의 `matrix.repo`에 이 소비자 레포 추가
  2. `CONSUMER_DISPATCH_TOKEN` Fine-grained PAT에 이 레포 접근 권한 추가
- 수동 단계임을 명시한다 (다른 레포 수정 + PAT 설정이라 자동화하지 않음)

## 핵심 설계 원칙

1. **추측 금지** — 경로/매니저/버전을 하드코딩하지 않고 감지하거나 묻는다
   (consumer-guide.md의 하드코딩된 `version: 10`, `node-version: 20`을 그대로 쓰지 않음)
2. **멱등성(idempotent)** — 존재하는 파일은 덮어쓰기 전 확인, `.env`는 없는 키만 추가

## 에러 처리 및 검증

- git 레포/package.json 없음 → 즉시 중단, 소비자 레포 아님을 알림
- 패키지 매니저 미감지(lockfile 없음) → 사용자에게 질문 (추측 금지)
- 기존 파일 충돌 → 덮어쓰기 전 확인
- 설치 검증 → 1단계 후 `package.json`에 `@krdn/llm-gateway` 추가 여부 확인 후 보고
- `.github/` 디렉토리 없음 → 워크플로우 생성 전 디렉토리 생성
- 검증은 가볍게(설치 성공 + 파일 생성 확인 수준). 절차 스킬이므로 스킬 자체 테스트 코드는 만들지 않는다.

## 단일 진실 공급원 (DRY) 결정

`docs/consumer-guide.md`에 이미 `update-llm-gateway.yml`, `renovate.json`, `dependabot.yml`
전문이 인라인되어 있다. 새 `templates/`가 같은 내용을 복제하면 사본이 두 곳이 되어 drift 위험이 있다.

**결정: `templates/`를 단일 소스로 삼는다.**
- `templates/`의 파일이 진실 공급원이 된다.
- `consumer-guide.md`의 인라인 YAML 블록은 걷어내고, "이 스킬을 실행" 안내 또는 템플릿 경로 링크로 대체한다.
  (consumer-guide.md 정리는 스킬 구현과 함께 수행 — 동일 변경의 일부)

## 구현 도구

`/skillify` 또는 `write-a-skill` / `skill-creator` 스킬을 활용해 SKILL.md를 작성한다
(frontmatter·트리거 규칙을 강제해 일관성·품질 확보). 설계 자체는 도구와 무관하게 동일하다.

## 범위 밖 (Out of Scope)

- 라이브러리 릴리스 자동화(버전 올리기 + 커밋 + GitHub Release) — 별도 작업
- 기본 사용 코드 외의 도메인별 모듈 생성
- 스킬 자체에 대한 테스트 코드
