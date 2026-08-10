// @krdn/llm-gateway 실행 데모 — 쇼핑몰 리뷰 감정 분석 배치
//
// 실행:
//   node examples/review-demo.mjs                        # 기본: openai / gpt-4.1-nano
//   node examples/review-demo.mjs deepseek deepseek-chat # 프로바이더 교체 (코드 수정 없음)
//   node examples/review-demo.mjs ollama llama3.2        # 로컬 Ollama (키 불필요)
//
// API 키는 환경변수(OPENAI_API_KEY, DEEPSEEK_API_KEY, ...)에서 자동 해석된다.
import { z } from 'zod';
import { runModule, createInMemoryModelConfig } from '../dist/index.js';

const [provider = 'openai', model = 'gpt-4.1-nano'] = process.argv.slice(2);

// ── 1. 결과 스키마 — LLM 응답은 이 스키마를 통과해야만 result가 된다
const ReviewAnalysis = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  complaintType: z.enum(['배송', '품질', '가격', 'CS응대', '없음']),
  summary: z.string(),
});

// ── 2. 분석 모듈 정의 — "입력 → 프롬프트" 변환 규칙과 스키마를 소유
const reviewModule = {
  name: 'review-sentiment',
  displayName: '리뷰 감정 분석',
  provider: 'openai', // configAdapter가 있으면 adapter 해석 결과가 우선
  model: 'gpt-4.1-nano',
  schema: ReviewAnalysis,
  buildSystemPrompt: () =>
    '너는 쇼핑몰 리뷰 분석기다. 리뷰의 감정과 주된 불만 유형을 분류하고 한 문장으로 요약하라.',
  buildPrompt: (review) => `리뷰: ${review.text}`,
};

// ── 3. 모델 설정 어댑터 — 모듈명 → provider/model 매핑 (CLI 인자로 교체 가능)
const configAdapter = createInMemoryModelConfig({
  modules: {
    'review-sentiment': { provider, model },
  },
});

// ── 4. 입력 데이터 (실전에서는 DB에서 가져올 부분)
const reviews = [
  { id: 1, text: '배송이 3일이나 늦었는데 고객센터 연결도 안 되네요. 물건 자체는 좋아요.' },
  { id: 2, text: '가격 대비 최고입니다. 재구매 의사 있어요!' },
  { id: 3, text: '박음질이 벌써 뜯어졌어요. 이 가격에 이 품질은 아니죠.' },
  { id: 4, text: '그냥 무난해요. 특별히 좋지도 나쁘지도 않네요.' },
];

// ── 5. 배치 실행 — 부분 실패 허용: 한 건이 실패해도 나머지는 계속된다
console.log(`\n리뷰 ${reviews.length}건 분석 시작 (${provider} / ${model})\n`);
let totalTokens = 0;
let failed = 0;

for (const review of reviews) {
  const res = await runModule(reviewModule, review, {
    configAdapter,
    // 실전에서는 DB 저장 — 데모에서는 저장됐다고 출력만
    onPersist: (event) => {
      if (event.status === 'completed') {
        console.log(`  [persist] 리뷰 #${review.id} 분석 결과 저장됨`);
      }
    },
    // 재시도가 일어나면 여기로 보인다 (rate limit 등)
    onProgress: (e) => {
      if (e.phase === 'retry') console.log(`  [retry] ${e.message} (attempt ${e.attempt})`);
    },
  });

  // discriminated union: status를 좁히면 result/usage가 non-null로 보장
  if (res.status === 'completed') {
    const { sentiment, complaintType, summary } = res.result;
    console.log(`#${review.id} ${sentiment.padEnd(8)} 불만:${complaintType.padEnd(4)} — ${summary}`);
    totalTokens += res.usage.totalTokens;
  } else {
    failed += 1;
    console.log(`#${review.id} ${res.status.toUpperCase()} — ${res.errorMessage}`);
  }
}

console.log(`\n완료: ${reviews.length - failed}/${reviews.length}건 성공, 총 ${totalTokens} tokens 사용\n`);
