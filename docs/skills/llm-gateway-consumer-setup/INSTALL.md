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
