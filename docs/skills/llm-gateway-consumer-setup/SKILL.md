---
name: llm-gateway-consumer-setup
description: "@krdn/llm-gateway를 소비자 프로젝트에 추가하거나 기존 설치를 보완할 때 사용한다. llm-gateway 셋업(gateway setup), 매니저별 업데이트 PR과 발행자 등록 안내를 제공한다."
---

# @krdn/llm-gateway 소비자 셋업

1. **대상 확인.** 요청 경로의 Git 루트, `package.json`, 잠금 파일과 기존 CI·업데이트 설정을 확인한다. 라이브러리 자체에서는 소비자 설정을 실행하지 않는다. 프로젝트가 지정한 Node 버전이 설치할 패키지의 `engines.node`와 맞는지 확인한다. 이미 구성된 단계는 재사용한다.
2. **패키지와 예제.** 잠금 파일과 `packageManager`가 가리키는 매니저로 `@krdn/llm-gateway`를 설치한다. [예제](templates/example-usage.ts)를 쓸 때는 예제 경로를 확인하고, 직접 import하는 `zod`를 호환되는 직접 의존성으로 둔다. 기본 예제는 설치한 라이브러리의 제공자별 기본 모델을 사용한다. 모델을 지정한 요청이면 그 ID를 전달한다. 예제 키 이름은 소비자의 예제 환경 파일에 빈 값으로 추가한다. 실제 키는 필요하지 않다. 매니페스트·잠금 파일, 패키지 import와 프로젝트 타입 검사를 확인한다.
3. **업데이트 PR.** 루트에 직접 설치한 프로젝트는 아래 명령으로 워크플로를 임시 파일에 생성한다. `<node-major>`는 CI에서 쓰는 Node 메이저다. pnpm·Yarn 버전이 매니페스트에 없으면 두 번째 인자로 프로젝트의 실제 매니저 버전을 지정한다. 성공한 출력만 `.github/workflows/update-llm-gateway.yml`에 반영한다. 기존 파일이 있으면 차이를 확인하고 필요한 단계만 병합한다. 모노레포에서 의존성 선언과 잠금 파일 위치가 다르면 기존 CI의 워크스페이스 선택·설치 경로를 적용한다.

   ```sh
   node "<skill-dir>/scripts/render-update.mjs" <node-major> [manager-version] > <temporary-workflow>
   ```

4. **백업 업데이트 경로.** 기존 Renovate·Dependabot 설정을 먼저 재사용한다. 둘 다 없으면 하나를 선택해 [Renovate](templates/renovate.json) 또는 [Dependabot](templates/dependabot.yml) 설정을 적용한다. 기존 패키지 규칙과 자동 병합 정책을 보존한다. 새 Renovate 설정에서 자동 병합을 원하는지 확인하고 그 선택을 반영한다.
5. **등록 상태 안내.** 소비자의 GitHub 저장소를 확인하고, 발행자 `krdn/llm-gateway`의 `.github/workflows/publish.yml`에 있는 `jobs.notify.strategy.matrix.repo` 등록 및 `CONSUMER_DISPATCH_PAT`의 소비자 접근 권한을 담당자에게 안내한다. 기존 등록 여부를 확인할 수 없으면 미확인으로 표시한다. 파일 생성, cron 구성, 실제 릴리스 dispatch 및 PR 생성은 각각 관찰한 범위까지 보고한다.
