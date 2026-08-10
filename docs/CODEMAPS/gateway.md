<!-- Generated: 2026-07-18 | Files scanned: 8 (src/gateway/) | Token estimate: ~700 -->

# Gateway Module (`src/gateway/`)

## Public Entrypoints

```
analyzeText(provider, model, prompt, opts)        → { text, usage(raw+normalized), finishReason }
analyzeStructured(provider, model, schema, opts)  → { object, usage: NormalizedUsage, finishReason }
```

호출 체인:
```
analyzeStructured → getModel → executeStructured ─┬─ native: generateText + Output.object
                                                  └─ fallback: executeText2Step (text→JSON, json-repair)
```

## Providers (PROVIDER_REGISTRY, 10종)

| Provider | access | callMethod | structured | 비고 |
|----------|--------|-----------|-----------|------|
| anthropic / openai / gemini | direct-api | direct | ✅ | apiKey 생략 시 AI SDK env-var 폴백 허용 |
| deepseek / xai / openrouter | direct-api | chat | ✅ | OpenAI 호환 Chat Completions |
| claude-cli | proxy-cli | chat | ❌ | cli-proxy-api가 키 검증 → apiKey **필수** |
| gemini-cli | proxy-cli | direct | ❌ | optional peer dep 동적 import, `~/.gemini` OAuth 전용 |
| ollama / custom | local | chat | ❌ | keyless (defaultApiKey: 'ollama') |

## Key Files

| 파일 | 라인 | 역할 |
|------|------|------|
| provider-meta.ts | 180 | 레지스트리 순수 데이터. `AIProvider`, `AccessMethod`, `CallMethod`, `ProviderMeta`. SDK import 없음 |
| model-factory.ts | 109 | `getModel()` + `SDK_MAP` + `DEFAULT_MODELS`(내부 상수). 불변식 강제: unknown provider / missing model·apiKey·baseUrl → 서술적 throw |
| strategies.ts | 210 | `executeStructured()`, `StructuredOutputError` (양쪽 실패 시 각 step의 reason·finishReason 포함) |
| json-repair.ts | 262 | `extractJson()`, `repairTruncatedJson()` (escape-aware 단일 스캔, 문자열 중간 절단 복구), `tryParseAndValidate()` → `{ ok, data \| reason }` |
| normalize-usage.ts | 35 | `normalizeUsage(unknown) → NormalizedUsage` — gateway/strategies 공유 (순환 의존 방지) |
| gateway.ts | 112 | 진입점 2개. 외부 abort signal과 timeout을 `AbortSignal.any`로 병합 |

## Error Design

- 설정 오류는 `getModel`(단일 funnel)에서 즉시 실패 — 침묵 폴백 없음
- `StructuredOutputError`: 2-step 이중 실패 시 각 단계의 parse/validation 사유 운반
- direct 프로바이더(anthropic/openai/gemini)만 apiKey 생략 허용 (env-var 폴백 목적)

## Tests (src/gateway/*.test.ts)

get-model(248줄) · strategies(232) · json-repair(316) · analyze-text(110) · structured-native(99) · structured-via-text(94) · normalize-usage(39) · provider-meta 불변식(31)
