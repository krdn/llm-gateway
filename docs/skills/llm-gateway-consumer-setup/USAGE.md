# 소비자 셋업 사용법

설치된 스킬을 대상 소비자 저장소에서 `$llm-gateway-consumer-setup`(Codex) 또는 `/llm-gateway-consumer-setup`(Claude Code)으로 호출한다. 원하는 예제 경로와 기존 자동 업데이트 도구가 있으면 함께 지정한다.

스킬은 루트의 잠금 파일과 패키지 매니저를 확인하고 필요한 단계만 적용한다. 업데이트 워크플로는 npm·pnpm·Yarn Classic·현대 Yarn에 맞춰 생성한다. 매니저가 충돌하거나 버전을 결정할 수 없으면 대상 파일을 쓰기 전에 확인한다. 중앙 등록을 완료하면 발행자의 `llm-gateway-release` 이벤트를 받을 수 있다. 소비자에 설치한 cron과 Renovate·Dependabot은 각각의 설정에 따라 동작한다.

구체적인 명령·검증은 [스킬 절차](SKILL.md), 설치 위치와 갱신 방법은 [설치 안내](INSTALL.md)에 있다.
