import { analyzeText, analyzeStructured } from '@krdn/llm-gateway/gateway';
import { z } from 'zod';

// 1) 자유 텍스트 분석
export async function summarize(text: string) {
  const result = await analyzeText(text, {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return result.text;
}

// 2) 구조화 출력 (Zod 스키마 검증)
const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number(),
  summary: z.string(),
});

export async function analyzeSentiment(review: string) {
  const result = await analyzeStructured(review, SentimentSchema, {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
  });
  return result.object;
}
