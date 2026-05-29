# dispatch 계약 통합 설계 (레거시 notify 잡 정리)

날짜: 2026-05-29

## 목적

릴리스 시 소비자에게 dispatch를 보내는 워크플로우가 둘로 갈려 있던 상태(절반만 끝난 마이그레이션)를
하나로 통합한다. `publish.yml`의 레거시 notify 잡을 제거하고, 그 대상(`ai-signalcraft`)을
신 계약을 쓰는 `notify-consumers.yml`로 이전한다.

배경: PR #1(소비자 셋업 스킬)에서 dispatch 계약 이원화가 발견됨. 이 작업은 그 후속 정리다.

## 현재 상태 (정리 전)

| | `notify-consumers.yml` (신) | `publish.yml`의 notify-consumers 잡 (레거시) |
|---|---|---|
| event-type | `llm-gateway-release` | `llm-gateway-updated` |
| payload | `client_payload.tag` | `version` + `npm_version` |
| secret | `CONSUMER_DISPATCH_PAT` | `CONSUMER_DISPATCH_TOKEN` |
| 대상 | `krdn/gons-dashboard` | `krdn/ai-signalcraft` |

둘 다 `release: published`에 트리거되어 릴리스마다 서로 다른 레포로 dispatch 2건 발송.
또한 두 워크플로우가 독립이라 publish 완료 순서 보장이 없다.

## 변경 (이 작업 범위)

### 파일 1 — `.github/workflows/publish.yml`
- `notify-consumers` 잡 전체 삭제. `publish` 잡만 남긴다.
- 워크플로우 `name`을 `Publish & Notify Consumers` → `Publish to npm`으로 변경 (실제 동작과 일치).
- 최상위 `permissions: contents: read`는 publish 잡에 충분하므로 유지.

### 파일 2 — `.github/workflows/notify-consumers.yml`
- 현재 단일 step(`krdn/gons-dashboard`)을 matrix로 전환.
- `matrix.repo`에 `krdn/gons-dashboard` + `krdn/ai-signalcraft` 둘 다 포함.
- 계약값은 신 계약 유지: event-type `llm-gateway-release`, payload `{"tag": ...}`,
  token `${{ secrets.CONSUMER_DISPATCH_PAT }}`, action SHA 고정(`ff45666...`) 유지.

## 결과 상태 (정리 후)

dispatcher 1개(notify-consumers.yml), 소비자 2개(gons-dashboard, ai-signalcraft) 모두 신 계약.
릴리스당 dispatch 중복 없음, 단일 워크플로우라 순서 모호성 해소.

## 범위 밖 (체크리스트로 안내)

`ai-signalcraft` 레포의 소비자 워크플로우는 레거시 타입(`llm-gateway-updated`)을 듣고 있을
것이다(레거시 dispatcher와 페어였으므로). 통합 후 `llm-gateway-release` + `tag`를 받으려면
ai-signalcraft 쪽 워크플로우를 신 계약으로 교체해야 한다. 이는 **다른 레포**라 이 작업에서
직접 수정하지 않고, 마지막에 안내 텍스트로 출력한다:

> ⚠️ `ai-signalcraft` 레포에서 `.github/workflows/`의 소비자 워크플로우를
> `types: [llm-gateway-release]`를 듣도록 교체해야 합니다.
> `llm-gateway-consumer-setup` 스킬을 그 레포에서 실행하면 신 계약 템플릿이 적용됩니다.
> 그 전까지 ai-signalcraft는 dispatch 미발화 (cron 백업이 있으면 동작).

또한 `CONSUMER_DISPATCH_PAT` PAT에 `ai-signalcraft` 접근 권한이 있는지 확인 필요(레거시는
`CONSUMER_DISPATCH_TOKEN`을 썼으므로 PAT가 다를 수 있음) — 안내에 포함.

## 검증

- publish.yml: YAML 유효, `publish` 잡만 존재, `notify-consumers`/`CONSUMER_DISPATCH_TOKEN`/
  `llm-gateway-updated`/`ai-signalcraft` 흔적 없음, name이 `Publish to npm`.
- notify-consumers.yml: YAML 유효, matrix에 두 레포, 신 계약값 유지, `${{ matrix.repo }}` 참조 정확.
- 단위 테스트 없음(CI YAML). yaml 파서 또는 grep으로 구조 검증.

## 범위 밖 (명시)

- ai-signalcraft 레포 자체 수정 (다른 레포)
- 소비자 셋업 스킬 변경 (PR #1에서 완료)
