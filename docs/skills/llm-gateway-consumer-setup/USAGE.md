# llm-gateway-consumer-setup 스킬 사용 가이드

`@krdn/llm-gateway`를 소비자 프로젝트에 도입하는 작업을 자동화하는 Claude Code 스킬의 사용법.

## 이 스킬이 하는 일

새 프로젝트(소비자)에서 `@krdn/llm-gateway`를 쓰려면 5가지를 손으로 해야 한다:
① 패키지 설치 ② 예제 코드 ③ 자동 업데이트 워크플로우 ④ Renovate/Dependabot ⑤ 라이브러리 레포 등록.
이 스킬은 소비자 레포에서 한 번 호출하면 이를 순서대로 처리한다.

## 1. 설치 (전역)

스킬 **소스**는 llm-gateway 레포(`docs/skills/llm-gateway-consumer-setup/`)에 있고,
**사용**하려면 전역 스킬 디렉토리로 복사해야 한다.

```bash
# llm-gateway 레포 안에서
cp -r docs/skills/llm-gateway-consumer-setup ~/.claude/skills/
```

복사 후 새 세션이면 Claude Code가 스킬을 인식한다(재시작이 필요할 수 있음).
자세한 설치/갱신은 [INSTALL.md](./INSTALL.md) 참고.

## 2. 소비자 레포에서 호출

`@krdn/llm-gateway`를 새로 도입할 **프로젝트 루트**에서 Claude Code를 열고 다음 중 하나를 말한다:

- `/llm-gateway-consumer-setup` (슬래시 명령)
- "llm-gateway 셋업"
- "소비자 프로젝트 구성"
- "@krdn/llm-gateway 추가"

> ⚠️ **반드시 대상 소비자 레포 루트에서** 호출한다. 스킬은 "현재 디렉토리 = 셋업 대상"으로
> 가정하고, git 레포 + `package.json`이 없으면 즉시 중단한다(라이브러리 레포에서 잘못 돌리는 것 방지).

## 3. 스킬이 진행하는 5단계 (대화형)

두 원칙으로 동작한다 — **추측 금지**(버전·경로를 감지하거나 물음), **멱등성**(기존 파일은 덮어쓰기 전 확인).

| 단계 | 하는 일 | 묻는 것 |
|---|---|---|
| **0. 환경 감지** | git/package.json 확인, 패키지 매니저(lockfile로 판별), node·pnpm 버전 감지 | 감지 실패 시에만 질문 |
| **1. 설치 + 예제** | `pnpm add @krdn/llm-gateway`, `.env.example`에 `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 추가(없는 키만) | **예제 코드 위치** (예: `src/lib/llm.ts`) |
| **2. 자동 업데이트 워크플로우** | `templates/update-llm-gateway.yml`을 읽어 pnpm/node 버전 치환 후 `.github/workflows/`에 생성 | 기존 파일 있으면 덮어쓰기 확인 |
| **3. Renovate/Dependabot** | 택1해서 `.github/renovate.json` 또는 `.github/dependabot.yml` 생성 | **Renovate(권장) vs Dependabot** |
| **4. 등록 체크리스트** | 파일 생성 없이, 라이브러리 레포에서 할 수동 단계를 출력 | — |

- **1단계 예제 코드**: 위치를 물어본 뒤 `summarize(text)`(analyzeText)와 `analyzeSentiment(review)`(analyzeStructured + Zod) 두 함수가 든 파일을 생성.
- **2단계 워크플로우**: 릴리스 dispatch(`llm-gateway-release`) + 매일 cron + 수동 트리거로 새 버전 PR을 자동 생성.

## 4. 스킬 후 직접 할 일 (수동)

4단계에서 안내하는 단계는 다른 레포·secret이라 스킬이 자동화하지 못한다:

1. **llm-gateway 레포**의 `.github/workflows/publish.yml`의 notify job matrix에 새 소비자 레포 추가
   (레포 주소는 `git remote get-url origin`으로 확인)
2. **`CONSUMER_DISPATCH_PAT`** Fine-grained PAT에 새 레포 접근 권한 추가

이 두 단계 전까지는 즉시 dispatch는 안 되고 cron 백업(매일)으로만 업데이트된다.

## 갱신 주의

전역 설치본(`~/.claude/skills/`)은 복사 시점에 freeze된다. 레포에서 스킬이 갱신되면
재복사해야 최신 절차/템플릿이 반영된다 ([INSTALL.md](./INSTALL.md)의 갱신 섹션 참고).

## 관련 문서

- [SKILL.md](./SKILL.md) — 스킬 절차 정의 (Claude Code가 실행하는 본체)
- [INSTALL.md](./INSTALL.md) — 설치·갱신 방법
- [templates/](./templates/) — 워크플로우/설정/예제 원본 (단일 진실 공급원)
- [../../consumer-guide.md](../../consumer-guide.md) — 수동 셋업·자동 업데이트 구성 전체 가이드
