<!-- Generated: 2026-07-18 | Files scanned: package.json + .github/workflows/ | Token estimate: ~450 -->

# Dependencies & Integrations

## Runtime Dependencies

| 패키지 | 용도 |
|--------|------|
| `ai` (v6) | Vercel AI SDK 코어 — generateText, Output.object, APICallError/RetryError |
| `@ai-sdk/anthropic` | Anthropic 네이티브 클라이언트 (callMethod: direct) |
| `@ai-sdk/openai` | OpenAI 네이티브 + OpenAI 호환 chat (deepseek/xai/openrouter/ollama/custom/claude-cli) |
| `@ai-sdk/google` | Gemini 네이티브 클라이언트 |
| `zod-to-json-schema` | text-2step 폴백에서 스키마 → 프롬프트 JSON 안내 |

## Peer Dependencies

| 패키지 | 성격 |
|--------|------|
| `zod` ^3.24 | peer + dev — 소비자의 Zod 인스턴스로 스키마 검증 |
| `ai-sdk-provider-gemini-cli` | **optional** peer — `getModel('gemini-cli')`에서만 동적 import (`~/.gemini` OAuth 전용) |

## External Services (런타임에 소비자가 연결)

- 직접 API: Anthropic / OpenAI / Gemini / DeepSeek / xAI / OpenRouter
- 프록시: cli-proxy-api (claude-cli — config.yaml api-keys로 Bearer 검증)
- 로컬: Ollama, OpenAI 호환 custom 서버

## CI/CD (.github/workflows/)

```
ci.yml      : typecheck → lint(--max-warnings 0) → test → build
              (pnpm 버전 = package.json packageManager 단일 소스)
publish.yml : GitHub release → npm publish(provenance) → repository-dispatch
              (notify job은 publish 성공 후에만; 소비자: gons-dashboard, ai-signalcraft)
```

## Build / Distribution

- `tsup` (ESM + dts + sourcemap), `vitest`, `eslint`
- `dist/`가 Git에 추적됨 — Git URL 설치 패턴 지원 (의도적 설계)
- `sideEffects: false` — provider-meta만 쓰는 브라우저 번들 tree-shaking 지원
