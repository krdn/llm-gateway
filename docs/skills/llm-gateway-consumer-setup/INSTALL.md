# 소비자 셋업 스킬 설치와 갱신

라이브러리 저장소의 `docs/skills/llm-gateway-consumer-setup/` 전체를 사용할 도구의 스킬 폴더에 복사한다. `scripts/`와 `templates/`는 함께 설치해야 워크플로를 생성할 수 있다. 이 환경에서 Codex 공유 스킬 위치는 `~/.agents/skills`, Claude Code 기본 위치는 `~/.claude/skills`다.

아래는 라이브러리 저장소 루트에서 Codex 설치본을 갱신하는 예다. 기존 설치본이 있으면 먼저 로컬 수정과 복사할 파일을 확인한다.

```sh
src=docs/skills/llm-gateway-consumer-setup/
dest="$HOME/.agents/skills/llm-gateway-consumer-setup/"
mkdir -p "$dest"
rsync -ani "$src" "$dest"
```

표시된 변경을 반영하려면 `rsync -a "$src" "$dest"`를 실행한다. 다시 `rsync -anic "$src" "$dest"`로 복사한 파일의 내용이 원본과 일치하는지 확인한다. 대상에만 있는 파일은 유지된다. Claude Code에 설치할 때는 해당 스킬 경로를 대상으로 지정한다.
