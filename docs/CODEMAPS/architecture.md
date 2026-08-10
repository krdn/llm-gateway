<!-- Generated: 2026-07-18 | Files scanned: 26 (src/) | Token estimate: ~600 -->

# Architecture — @krdn/llm-gateway v4.x

도메인 무관(multi-domain) 멀티 프로바이더 LLM 게이트웨이 라이브러리. Vercel AI SDK v6 기반. 앱이 아닌 **퍼블리시드 라이브러리** — 서버/라우트/DB 없음.

## Module Layout

```
src/
├── types.ts              # AnalysisModule, AnalysisModuleResult (discriminated union), ModuleUsage
├── gateway/              # AI 프로바이더 추상화 계층
│   ├── provider-meta.ts  # PROVIDER_REGISTRY (순수 데이터, SDK import 없음 → 브라우저 안전)
│   ├── model-factory.ts  # getModel() 디스패처 + SDK_MAP (레지스트리 불변식 강제)
│   ├── strategies.ts     # executeStructured() — native vs text-2step 분기
│   ├── json-repair.ts    # extractJson / repairTruncatedJson / tryParseAndValidate
│   ├── normalize-usage.ts# provider별 usage 필드 정규화 (순환 의존 방지용 분리)
│   └── gateway.ts        # 공개 진입점: analyzeText() / analyzeStructured()
├── runner/               # 도메인 무관 모듈 실행 엔진
│   ├── run-module.ts     # runModule() — 오케스트레이션 (콜백·취소·부분 실패)
│   └── retry-utils.ts    # retryWithPolicy() — 재시도 타이밍/판정
└── adapters/             # DI 인터페이스 (외부 관심사 주입)
    ├── model-config.ts   # ModelConfigAdapter + createInMemoryModelConfig
    └── pipeline-control.ts # PipelineControlAdapter + noopPipelineControl
```

## Data Flow

```
Consumer app
  └─ runModule(module, input, opts)          [runner]
       ├─ configAdapter.resolve(moduleName)  [adapters] provider/model/key 결정
       ├─ pipelineControl.checkCostLimit     [adapters] pre-flight
       └─ retryWithPolicy(                   [runner]  rate-limit/overload만 재시도
            analyzeStructured(...)           [gateway]
              ├─ getModel(provider, ...)     [gateway] 레지스트리 검증 + SDK 클라이언트
              └─ executeStructured(...)      [gateway]
                   ├─ native: generateText + Output.object
                   └─ fallback: text→JSON 2-step (+json-repair)
          )
```

## Key Invariants

- 침묵 폴백 금지: 잘못된 설정은 `getModel`에서 즉시 서술적 에러로 실패
- 라이브러리 내 console 출력 금지 — 진단은 에러 메시지·onProgress 콜백으로
- `runModule`은 절대 throw하지 않음 — `{ status: 'failed' }` 반환 (부분 실패 정책)
- parse/validation 실패는 재시도 안 함 (비용 발생) — rate limit/overload만 재시도
- `provider-meta.ts`는 SDK import 금지 (sideEffects: false, tree-shaking)

## Package Exports (subpath)

| Export | 내용 |
|--------|------|
| `.` | 전체 (types + gateway + adapters + runner) |
| `./gateway` | analyzeText, analyzeStructured, PROVIDER_REGISTRY 등 |
| `./adapters` | ModelConfigAdapter, PipelineControlAdapter + in-memory 구현 |
| `./runner` | runModule, retryWithPolicy + retry utils |

상세: [gateway.md](gateway.md) · [runner-adapters.md](runner-adapters.md) · [dependencies.md](dependencies.md)
