import { z } from 'zod';
import { generateText, generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { zodToJsonSchema } from 'zod-to-json-schema';

// src/types.ts
var MODULE_MODEL_MAP = {
  // Stage 1: 대량 텍스트 요약/분류 — 속도·비용 우선
  "macro-view": { provider: "gemini", model: "gemini-2.5-flash" },
  segmentation: { provider: "gemini", model: "gemini-2.5-flash" },
  "sentiment-framing": { provider: "gemini", model: "gemini-2.5-flash" },
  "message-impact": { provider: "gemini", model: "gemini-2.5-flash" },
  // Stage 2: 복합 추론/전략 — 품질 우선
  "risk-map": { provider: "anthropic", model: "claude-sonnet-4-6" },
  opportunity: { provider: "anthropic", model: "claude-sonnet-4-6" },
  strategy: { provider: "anthropic", model: "claude-sonnet-4-6" },
  "final-summary": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "integrated-report": { provider: "anthropic", model: "claude-sonnet-4-6" },
  // Stage 4: ADVN 고급 분석 모듈
  "approval-rating": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "frame-war": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "crisis-scenario": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "win-simulation": { provider: "anthropic", model: "claude-sonnet-4-6" }
};
var MODULE_NAMES = {
  MACRO_VIEW: "macro-view",
  SEGMENTATION: "segmentation",
  SENTIMENT_FRAMING: "sentiment-framing",
  MESSAGE_IMPACT: "message-impact",
  RISK_MAP: "risk-map",
  OPPORTUNITY: "opportunity",
  STRATEGY: "strategy",
  FINAL_SUMMARY: "final-summary",
  APPROVAL_RATING: "approval-rating",
  FRAME_WAR: "frame-war",
  CRISIS_SCENARIO: "crisis-scenario",
  WIN_SIMULATION: "win-simulation"
};
var MacroViewSchema = z.object({
  overallDirection: z.enum(["positive", "negative", "mixed"]).describe("\uC804\uCCB4 \uC5EC\uB860 \uBC29\uD5A5\uC131"),
  summary: z.string().min(1).describe("\uD575\uC2EC \uD750\uB984 \uC694\uC57D 3~5\uC904"),
  timeline: z.array(
    z.object({
      date: z.string().catch(""),
      event: z.string().catch(""),
      impact: z.enum(["positive", "negative", "neutral", "mixed"]).catch("neutral"),
      description: z.string().catch("")
    })
  ).default([]).describe("\uC8FC\uC694 \uC774\uBCA4\uD2B8 \uD0C0\uC784\uB77C\uC778"),
  inflectionPoints: z.array(
    z.object({
      date: z.string().catch(""),
      description: z.string().catch(""),
      beforeSentiment: z.enum(["positive", "negative", "neutral"]).catch("neutral"),
      afterSentiment: z.enum(["positive", "negative", "neutral"]).catch("neutral")
    })
  ).default([]).describe("\uC5EC\uB860 \uBCC0\uACE1\uC810"),
  dailyMentionTrend: z.array(
    z.object({
      date: z.string().catch(""),
      count: z.number().catch(0),
      sentimentRatio: z.object({
        positive: z.number().catch(0),
        negative: z.number().catch(0),
        neutral: z.number().catch(0)
      }).catch({ positive: 0, negative: 0, neutral: 0 })
    })
  ).default([]).describe("\uC77C\uBCC4 \uC5B8\uAE09\uB7C9 \uBC0F \uAC10\uC131 \uCD94\uC774")
});

// src/modules/prompt-utils.ts
var MAX_CONTENT_LENGTH = 500;
var PLATFORM_KNOWLEDGE = `
## \uD55C\uAD6D \uC628\uB77C\uC778 \uC5EC\uB860 \uD50C\uB7AB\uD3FC \uD2B9\uC131 (\uBD84\uC11D \uC2DC \uBC18\uB4DC\uC2DC \uBC18\uC601)

| \uD50C\uB7AB\uD3FC | \uC8FC \uC0AC\uC6A9\uCE35 | \uC815\uCE58 \uD3B8\uD5A5 | \uD655\uC0B0 \uD328\uD134 | \uBD84\uC11D \uC2DC \uC720\uC758\uC810 |
|--------|----------|----------|----------|--------------|
| \uB124\uC774\uBC84 \uB274\uC2A4 | 40~60\uB300 | \uBCF4\uC218 \uC6B0\uC138 | \uB313\uAE00\u2192\uBCA0\uC2A4\uD2B8\uB313\uAE00\u2192\uB274\uC2A4 \uC7AC\uC0DD\uC0B0 | \uB313\uAE00 \uC88B\uC544\uC694 \uC218\uAC00 \uC5EC\uB860 \uB300\uD45C\uC131\uC758 \uD575\uC2EC \uC9C0\uD45C. \uBCA0\uC2A4\uD2B8\uB313\uAE00\uC740 \uC804\uCCB4 \uC5EC\uB860\uC774 \uC544\uB2CC \uB2E4\uC218\uD30C \uC758\uACAC \uBC18\uC601 |
| \uC720\uD29C\uBE0C | \uC804 \uC5F0\uB839 | \uCC44\uB110\uBCC4 \uADF9\uC2EC | \uC54C\uACE0\uB9AC\uC998 \uCD94\uCC9C\u2192\uC5D0\uCF54\uCC54\uBC84 | \uC870\uD68C\uC218\xB7\uC88B\uC544\uC694 \uBE44\uC728\uBCF4\uB2E4 \uB313\uAE00 \uB0B4\uC6A9\uC774 \uB354 \uC815\uD655\uD55C \uAC10\uC815 \uC9C0\uD45C. \uC815\uCE58 \uC720\uD29C\uBE0C\uB294 \uD655\uC99D\uD3B8\uD5A5 \uC99D\uD3ED\uAE30 |
| DC\uC778\uC0AC\uC774\uB4DC | 20~30\uB300 \uB0A8\uC131 | \uC774\uC288\uBCC4 \uC0C1\uC774 | \uBC08\uD654\u2192\uCEE4\uBBA4\uB2C8\uD2F0 \uAD50\uCC28\u2192SNS \uD655\uC0B0 | \uD48D\uC790\xB7\uBE44\uAF3C \uD45C\uD604\uC774 \uB9CE\uC544 \uD45C\uBA74\uC801 \uAC10\uC815\uACFC \uC2E4\uC81C \uC758\uB3C4\uAC00 \uBC18\uB300\uC77C \uC218 \uC788\uC74C |
| \uD074\uB9AC\uC559 | 30~40\uB300 IT\uC9C1\uC885 | \uC9C4\uBCF4 \uC6B0\uC138 | \uAC8C\uC2DC\uAE00\u2192\uB313\uAE00\uD1A0\uB860\u2192\uC678\uBD80\uB9C1\uD06C \uACF5\uC720 | IT\xB7\uACBD\uC81C \uC774\uC288\uC5D0 \uC804\uBB38\uC131 \uB192\uC74C. \uC815\uCE58 \uD1A0\uB860 \uC2DC \uB17C\uB9AC\uC801 \uADFC\uAC70 \uC911\uC2DC |
| FM\uCF54\uB9AC\uC544 | 20~30\uB300 \uB0A8\uC131 | \uB2E4\uC591 | \uC720\uBA38\u2192\uC815\uCE58 \uC804\uD658 \uBE60\uB984 | \uC720\uBA38 \uAC8C\uC2DC\uD310\uC5D0\uC11C \uC2DC\uC791\uB41C \uC774\uC288\uAC00 \uC815\uCE58\uD654\uB418\uB294 \uC18D\uB3C4\uAC00 \uB9E4\uC6B0 \uBE60\uB984 |

\uC774 \uD2B9\uC131\uC744 \uAC10\uC548\uD558\uC5EC \uD50C\uB7AB\uD3FC\uBCC4 \uB370\uC774\uD130\uB97C \uCC28\uB4F1 \uD574\uC11D\uD558\uC138\uC694.`;
var ANALYSIS_CONSTRAINTS = `
## \uBD84\uC11D \uAE08\uC9C0 \uC0AC\uD56D (\uBC18\uB4DC\uC2DC \uC900\uC218)

1. **\uC911\uAC04\uAC12 \uD3B8\uD5A5 \uAE08\uC9C0**: \uBAA8\uB4E0 \uC810\uC218\uB97C 5/10, 50% \uB4F1 \uC548\uC804\uD55C \uC911\uAC04\uAC12\uC73C\uB85C \uBD80\uC5EC\uD558\uC9C0 \uB9C8\uC138\uC694. \uB370\uC774\uD130\uAC00 \uADF9\uB2E8\uC801\uC774\uBA74 \uADF9\uB2E8\uC801 \uC810\uC218\uB97C \uBD80\uC5EC\uD558\uC138\uC694.
2. **\uADE0\uD615 \uD3B8\uD5A5 \uAE08\uC9C0**: \uAE0D\uC815\uACFC \uBD80\uC815\uC744 \uC778\uC704\uC801\uC73C\uB85C \uBC18\uBC18 \uB098\uB204\uC9C0 \uB9C8\uC138\uC694. \uB370\uC774\uD130\uAC00 \uBD80\uC815 80%\uC774\uBA74 \uADF8\uB300\uB85C \uBC18\uC601\uD558\uC138\uC694.
3. **\uD328\uB529 \uAE08\uC9C0**: \uAC19\uC740 \uB0B4\uC6A9\uC744 \uB2E4\uB978 \uD45C\uD604\uC73C\uB85C \uBC18\uBCF5\uD558\uC5EC \uD56D\uBAA9 \uC218\uB97C \uCC44\uC6B0\uC9C0 \uB9C8\uC138\uC694. \uC758\uBBF8 \uC788\uB294 \uCC28\uC774\uAC00 \uC788\uB294 \uD56D\uBAA9\uB9CC \uD3EC\uD568\uD558\uC138\uC694.
4. **\uADFC\uAC70 \uC5C6\uB294 \uCD94\uCE21 \uAE08\uC9C0**: "~\uD560 \uC218 \uC788\uB2E4", "~\uAC00\uB2A5\uC131\uC774 \uC788\uB2E4" \uB4F1\uC758 \uD45C\uD604\uC740 \uB370\uC774\uD130 \uADFC\uAC70\uB97C \uBC18\uB4DC\uC2DC \uBA85\uC2DC\uD558\uC138\uC694.
5. **\uC120\uD589 \uACB0\uACFC \uC7AC\uAE30\uC220 \uAE08\uC9C0**: \uC774\uC804 \uBD84\uC11D \uACB0\uACFC\uB97C \uADF8\uB300\uB85C \uC62E\uACA8\uC4F0\uC9C0 \uB9C8\uC138\uC694. \uC0C8\uB85C\uC6B4 \uAD00\uC810\uC758 \uC2EC\uD654\xB7\uD655\uC7A5\uB9CC \uD5C8\uC6A9\uD569\uB2C8\uB2E4.

\uBC18\uB4DC\uC2DC \uD55C\uAD6D\uC5B4\uB85C \uC751\uB2F5\uD558\uC138\uC694.`;
var IMPACT_SCORE_ANCHOR = `
## impactScore / negativeScore \uAE30\uC900 (1~10)

| \uC810\uC218 | \uAE30\uC900 | \uC0AC\uB840 \uC608\uC2DC |
|------|------|----------|
| 9~10 | \uC804 \uD50C\uB7AB\uD3FC \uB3D9\uC2DC \uD655\uC0B0, \uB274\uC2A4 \uC0AC\uC774\uD074 3\uC77C \uC774\uC0C1 \uC9C0\uC18D, \uC2E4\uAC80/\uD2B8\uB80C\uB4DC \uC7A5\uAE30 \uC810\uC720 | \uB300\uD1B5\uB839\xB7\uCD1D\uB9AC\uAE09 \uBC1C\uC5B8 \uB17C\uB780, \uB300\uD615 \uC2A4\uCE94\uB4E4 |
| 7~8 | 2\uAC1C \uC774\uC0C1 \uD50C\uB7AB\uD3FC \uAD50\uCC28 \uD655\uC0B0, \uC2E4\uAC80/\uD2B8\uB80C\uB4DC \uC77C\uC2DC \uC9C4\uC785, \uD6C4\uC18D \uBCF4\uB3C4 \uB2E4\uC218 | \uC7A5\uAD00\uAE09 \uC774\uC288, \uC815\uB2F9 \uB300\uD45C \uBC1C\uC5B8, \uC8FC\uC694 \uC815\uCC45 \uB17C\uB780 |
| 5~6 | \uB2E8\uC77C \uD50C\uB7AB\uD3FC \uB0B4 \uC0C1\uC704 \uAC8C\uC2DC\uAE00, \uB313\uAE00 500+ \uC218\uC900\uC758 \uBC18\uC751 | \uCEE4\uBBA4\uB2C8\uD2F0 \uD56B\uAE00, \uC720\uD29C\uBE0C \uC778\uAE30 \uC601\uC0C1 |
| 3~4 | \uC77C\uBD80 \uBC18\uC751, \uD655\uC0B0 \uC81C\uD55C\uC801, \uB274\uC2A4 1~2\uAC74 \uBCF4\uB3C4 | \uB274\uC2A4 \uAE30\uC0AC \uB313\uAE00 100+, \uCEE4\uBBA4\uB2C8\uD2F0 \uC77C\uBC18 \uAC8C\uC2DC\uAE00 |
| 1~2 | \uAC70\uC758 \uBC18\uC751 \uC5C6\uC74C, \uD655\uC0B0 \uC5C6\uC74C | \uBCF4\uB3C4\uC790\uB8CC \uC218\uC900, \uAD00\uC2EC \uC5C6\uB294 \uBC1C\uC5B8 |`;
var FRAME_STRENGTH_ANCHOR = `
## \uD504\uB808\uC784 \uAC15\uB3C4 \uAE30\uC900 (0~100)

| \uBC94\uC704 | \uAE30\uC900 | \uC124\uBA85 |
|------|------|------|
| 80~100 | \uC9C0\uBC30\uC801 \uD504\uB808\uC784 | \uD574\uB2F9 \uC774\uC288\uB97C \uC5B8\uAE09\uD560 \uB54C \uB300\uBD80\uBD84 \uC774 \uD504\uB808\uC784\uC73C\uB85C \uC774\uC57C\uAE30\uD568. \uB300\uC548 \uD504\uB808\uC784\uC774 \uAC70\uC758 \uC5C6\uC74C |
| 60~79 | \uC6B0\uC138 \uD504\uB808\uC784 | \uC8FC\uC694 \uBBF8\uB514\uC5B4\uC640 \uB2E4\uC218 \uB313\uAE00\uC774 \uC774 \uD504\uB808\uC784\uC744 \uC0AC\uC6A9\uD558\uC9C0\uB9CC \uBC18\uB860\uB3C4 \uC874\uC7AC |
| 40~59 | \uACBD\uD569 \uD504\uB808\uC784 | \uCC2C\uBC18\uC774 \uBE44\uB4F1\uD558\uAC70\uB098 \uBCF5\uC218\uC758 \uD504\uB808\uC784\uC774 \uACBD\uC7C1 \uC911 |
| 20~39 | \uC57D\uC138 \uD504\uB808\uC784 | \uC18C\uC218 \uC758\uACAC\uC774\uB098 \uD2B9\uC815 \uD50C\uB7AB\uD3FC\uC5D0\uC11C\uB9CC \uD1B5\uC6A9 |
| 0~19 | \uBBF8\uC57D \uD504\uB808\uC784 | \uAC70\uC758 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uAC70\uB098 \uC0C8\uB86D\uAC8C \uB4F1\uC7A5 \uC911\uC778 \uD504\uB808\uC784 |`;
var PROBABILITY_ANCHOR = `
## \uD655\uB960 \uAE30\uC900

| \uBC94\uC704 | \uC758\uBBF8 | \uD310\uB2E8 \uADFC\uAC70 |
|------|------|----------|
| 80~100% | \uAC70\uC758 \uD655\uC2E4 | \uD604\uC7AC \uCD94\uC138\uAC00 \uBA85\uD655\uD558\uACE0, \uBC18\uC804 \uC694\uC778\uC774 \uBCF4\uC774\uC9C0 \uC54A\uC74C |
| 60~79% | \uAC00\uB2A5\uC131 \uB192\uC74C | \uC8FC\uC694 \uC9C0\uD45C\uAC00 \uD574\uB2F9 \uBC29\uD5A5\uC774\uC9C0\uB9CC, \uBCC0\uC218 1~2\uAC1C \uC874\uC7AC |
| 40~59% | \uBC18\uBC18 | \uCC2C\uBC18 \uC9C0\uD45C\uAC00 \uD63C\uC7AC\uD558\uAC70\uB098 \uD575\uC2EC \uBCC0\uC218\uAC00 \uBBF8\uACB0\uC815 |
| 20~39% | \uAC00\uB2A5\uC131 \uB0AE\uC74C | \uD604\uC7AC \uCD94\uC138\uC5D0 \uBC18\uD558\uC9C0\uB9CC, \uD2B9\uC815 \uC870\uAC74 \uCDA9\uC871 \uC2DC \uAC00\uB2A5 |
| 0~19% | \uAC70\uC758 \uBD88\uAC00\uB2A5 | \uB370\uC774\uD130\uC0C1 \uADFC\uAC70\uAC00 \uAC70\uC758 \uC5C6\uC74C |`;
function extractField(results, module, ...fields) {
  const moduleResult = results[module];
  if (!moduleResult || typeof moduleResult !== "object") return void 0;
  const result = {};
  for (const field of fields) {
    const value = moduleResult[field];
    if (value !== void 0) result[field] = value;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function distillForRiskMap(priorResults) {
  const sections = [];
  const macroView = extractField(
    priorResults,
    "macro-view",
    "overallDirection",
    "summary",
    "inflectionPoints"
  );
  if (macroView)
    sections.push(`### \uC5EC\uB860 \uD750\uB984 \uC694\uC57D (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const segmentation = extractField(
    priorResults,
    "segmentation",
    "audienceGroups",
    "highInfluenceGroup"
  );
  if (segmentation)
    sections.push(`### \uC9D1\uB2E8 \uAD6C\uC870 (segmentation)
${JSON.stringify(segmentation, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "negativeFrames",
    "frameConflict"
  );
  if (sentiment)
    sections.push(
      `### \uBD80\uC815 \uAC10\uC815\xB7\uD504\uB808\uC784 (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`
    );
  const impact = extractField(
    priorResults,
    "message-impact",
    "failureMessages",
    "highSpreadContentTypes"
  );
  if (impact)
    sections.push(`### \uC2E4\uD328 \uBA54\uC2DC\uC9C0\xB7\uD655\uC0B0 \uC720\uD615 (message-impact)
${JSON.stringify(impact, null, 2)}`);
  return sections.join("\n\n");
}
function distillForOpportunity(priorResults) {
  const sections = [];
  const macroView = extractField(priorResults, "macro-view", "overallDirection", "summary");
  if (macroView)
    sections.push(`### \uC5EC\uB860 \uD750\uB984 \uC694\uC57D (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const segmentation = extractField(
    priorResults,
    "segmentation",
    "audienceGroups",
    "highInfluenceGroup"
  );
  if (segmentation)
    sections.push(`### \uC9D1\uB2E8 \uAD6C\uC870 (segmentation)
${JSON.stringify(segmentation, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "positiveFrames"
  );
  if (sentiment)
    sections.push(
      `### \uAE0D\uC815 \uAC10\uC815\xB7\uD504\uB808\uC784 (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`
    );
  const impact = extractField(
    priorResults,
    "message-impact",
    "successMessages",
    "highSpreadContentTypes"
  );
  if (impact)
    sections.push(`### \uC131\uACF5 \uBA54\uC2DC\uC9C0\xB7\uD655\uC0B0 \uC720\uD615 (message-impact)
${JSON.stringify(impact, null, 2)}`);
  return sections.join("\n\n");
}
function distillForStrategy(priorResults) {
  const sections = [];
  const macroView = extractField(priorResults, "macro-view", "overallDirection", "summary");
  if (macroView) sections.push(`### \uC5EC\uB860 \uBC29\uD5A5 (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const segmentation = extractField(
    priorResults,
    "segmentation",
    "audienceGroups",
    "highInfluenceGroup"
  );
  if (segmentation)
    sections.push(`### \uD575\uC2EC \uC9D1\uB2E8 (segmentation)
${JSON.stringify(segmentation, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "positiveFrames",
    "negativeFrames",
    "frameConflict"
  );
  if (sentiment)
    sections.push(`### \uAC10\uC815\xB7\uD504\uB808\uC784 (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`);
  const impact = extractField(priorResults, "message-impact", "successMessages", "failureMessages");
  if (impact) sections.push(`### \uBA54\uC2DC\uC9C0 \uC131\uD328 (message-impact)
${JSON.stringify(impact, null, 2)}`);
  const riskMap = extractField(priorResults, "risk-map", "topRisks", "overallRiskLevel");
  if (riskMap) sections.push(`### \uB9AC\uC2A4\uD06C (risk-map)
${JSON.stringify(riskMap, null, 2)}`);
  const opportunity = extractField(
    priorResults,
    "opportunity",
    "positiveAssets",
    "priorityOpportunity"
  );
  if (opportunity) sections.push(`### \uAE30\uD68C (opportunity)
${JSON.stringify(opportunity, null, 2)}`);
  return sections.join("\n\n");
}
function distillForFinalSummary(priorResults) {
  const sections = [];
  const macroView = extractField(
    priorResults,
    "macro-view",
    "overallDirection",
    "summary",
    "inflectionPoints"
  );
  if (macroView) sections.push(`### \uC5EC\uB860 \uD750\uB984 (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const segmentation = extractField(priorResults, "segmentation", "highInfluenceGroup");
  if (segmentation)
    sections.push(`### \uD575\uC2EC \uC9D1\uB2E8 (segmentation)
${JSON.stringify(segmentation, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "frameConflict"
  );
  if (sentiment)
    sections.push(
      `### \uAC10\uC815\xB7\uD504\uB808\uC784 \uD575\uC2EC (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`
    );
  const riskMap = extractField(
    priorResults,
    "risk-map",
    "topRisks",
    "overallRiskLevel",
    "riskTrend"
  );
  if (riskMap) sections.push(`### \uB9AC\uC2A4\uD06C (risk-map)
${JSON.stringify(riskMap, null, 2)}`);
  const opportunity = extractField(priorResults, "opportunity", "priorityOpportunity");
  if (opportunity)
    sections.push(`### \uCD5C\uC6B0\uC120 \uAE30\uD68C (opportunity)
${JSON.stringify(opportunity, null, 2)}`);
  const strategy = extractField(
    priorResults,
    "strategy",
    "targetStrategy",
    "messageStrategy",
    "riskResponse"
  );
  if (strategy) sections.push(`### \uC804\uB7B5 (strategy)
${JSON.stringify(strategy, null, 2)}`);
  return sections.join("\n\n");
}
function distillForApprovalRating(priorResults) {
  const sections = [];
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "topKeywords"
  );
  if (sentiment)
    sections.push(
      `### \uAC10\uC815 \uBE44\uC728\xB7\uD0A4\uC6CC\uB4DC (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`
    );
  const segmentation = extractField(
    priorResults,
    "segmentation",
    "platformSegments",
    "audienceGroups"
  );
  if (segmentation)
    sections.push(
      `### \uD50C\uB7AB\uD3FC\xB7\uC9D1\uB2E8\uBCC4 \uBC18\uC751 (segmentation)
${JSON.stringify(segmentation, null, 2)}`
    );
  const macroView = extractField(
    priorResults,
    "macro-view",
    "overallDirection",
    "dailyMentionTrend"
  );
  if (macroView) sections.push(`### \uC5EC\uB860 \uCD94\uC774 (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  return sections.join("\n\n");
}
function distillForFrameWar(priorResults) {
  const sections = [];
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "positiveFrames",
    "negativeFrames",
    "frameConflict",
    "topKeywords"
  );
  if (sentiment)
    sections.push(`### \uD504\uB808\uC784\xB7\uD0A4\uC6CC\uB4DC (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`);
  const macroView = extractField(
    priorResults,
    "macro-view",
    "overallDirection",
    "inflectionPoints"
  );
  if (macroView)
    sections.push(`### \uC5EC\uB860 \uBCC0\uACE1\uC810 (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const impact = extractField(priorResults, "message-impact", "successMessages", "failureMessages");
  if (impact) sections.push(`### \uBA54\uC2DC\uC9C0 \uC131\uD328 (message-impact)
${JSON.stringify(impact, null, 2)}`);
  return sections.join("\n\n");
}
function distillForCrisisScenario(priorResults) {
  const sections = [];
  const riskMap = extractField(
    priorResults,
    "risk-map",
    "topRisks",
    "overallRiskLevel",
    "riskTrend"
  );
  if (riskMap) sections.push(`### \uB9AC\uC2A4\uD06C (risk-map)
${JSON.stringify(riskMap, null, 2)}`);
  const approval = extractField(
    priorResults,
    "approval-rating",
    "estimatedRange",
    "confidence",
    "methodology"
  );
  if (approval)
    sections.push(`### \uC9C0\uC9C0\uC728 \uCD94\uC815 (approval-rating)
${JSON.stringify(approval, null, 2)}`);
  const macroView = extractField(
    priorResults,
    "macro-view",
    "overallDirection",
    "inflectionPoints"
  );
  if (macroView)
    sections.push(`### \uC5EC\uB860 \uBCC0\uACE1\uC810 (macro-view)
${JSON.stringify(macroView, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "negativeFrames"
  );
  if (sentiment)
    sections.push(`### \uBD80\uC815 \uAC10\uC815 (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`);
  return sections.join("\n\n");
}
function distillForWinSimulation(priorResults) {
  const sections = [];
  const approval = extractField(priorResults, "approval-rating", "estimatedRange", "confidence");
  if (approval)
    sections.push(`### \uC9C0\uC9C0\uC728 \uCD94\uC815 (approval-rating)
${JSON.stringify(approval, null, 2)}`);
  const riskMap = extractField(priorResults, "risk-map", "topRisks", "overallRiskLevel");
  if (riskMap) sections.push(`### \uB9AC\uC2A4\uD06C (risk-map)
${JSON.stringify(riskMap, null, 2)}`);
  const opportunity = extractField(
    priorResults,
    "opportunity",
    "positiveAssets",
    "priorityOpportunity"
  );
  if (opportunity) sections.push(`### \uAE30\uD68C (opportunity)
${JSON.stringify(opportunity, null, 2)}`);
  const strategy = extractField(
    priorResults,
    "strategy",
    "targetStrategy",
    "messageStrategy",
    "riskResponse"
  );
  if (strategy) sections.push(`### \uC804\uB7B5 (strategy)
${JSON.stringify(strategy, null, 2)}`);
  const frameWar = extractField(
    priorResults,
    "frame-war",
    "dominantFrames",
    "threateningFrames",
    "battlefieldSummary"
  );
  if (frameWar) sections.push(`### \uD504\uB808\uC784 \uC804\uC7C1 (frame-war)
${JSON.stringify(frameWar, null, 2)}`);
  const crisis = extractField(priorResults, "crisis-scenario", "scenarios", "currentRiskLevel");
  if (crisis)
    sections.push(`### \uC704\uAE30 \uC2DC\uB098\uB9AC\uC624 (crisis-scenario)
${JSON.stringify(crisis, null, 2)}`);
  const sentiment = extractField(
    priorResults,
    "sentiment-framing",
    "sentimentRatio",
    "frameConflict"
  );
  if (sentiment)
    sections.push(`### \uAC10\uC815\xB7\uD504\uB808\uC784 (sentiment-framing)
${JSON.stringify(sentiment, null, 2)}`);
  const segmentation = extractField(priorResults, "segmentation", "highInfluenceGroup");
  if (segmentation)
    sections.push(`### \uD575\uC2EC \uC9D1\uB2E8 (segmentation)
${JSON.stringify(segmentation, null, 2)}`);
  return sections.join("\n\n");
}
function formatInputData(data) {
  const formatDate = (d) => d ? d.toISOString().split("T")[0] : "\uB0A0\uC9DC \uBBF8\uC0C1";
  const articles = data.articles.map((a) => ({
    title: a.title,
    content: a.content ? a.content.length > MAX_CONTENT_LENGTH ? a.content.slice(0, MAX_CONTENT_LENGTH) + "..." : a.content : "(\uBCF8\uBB38 \uC5C6\uC74C)",
    source: a.source,
    publisher: a.publisher ?? "\uCD9C\uCC98 \uBBF8\uC0C1",
    publishedAt: formatDate(a.publishedAt)
  }));
  const videos = data.videos.map((v) => ({
    title: v.title,
    channel: v.channelTitle ?? "\uCC44\uB110 \uBBF8\uC0C1",
    viewCount: v.viewCount ?? 0,
    likeCount: v.likeCount ?? 0,
    publishedAt: formatDate(v.publishedAt)
  }));
  const comments = data.comments.map((c) => ({
    content: c.content,
    source: c.source,
    author: c.author ?? "\uC775\uBA85",
    likeCount: c.likeCount ?? 0,
    publishedAt: formatDate(c.publishedAt)
  }));
  const dateRange = `${formatDate(data.dateRange.start)} ~ ${formatDate(data.dateRange.end)}`;
  return { articles, videos, comments, dateRange };
}

// src/modules/macro-view.ts
var macroViewModule = {
  name: "macro-view",
  displayName: "\uC804\uCCB4 \uC5EC\uB860 \uAD6C\uC870 \uBD84\uC11D",
  provider: MODULE_MODEL_MAP["macro-view"].provider,
  model: MODULE_MODEL_MAP["macro-view"].model,
  schema: MacroViewSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 15\uB144 \uACBD\uB825\uC758 \uC815\uCE58 \uC5EC\uB860 \uB3D9\uD5A5 \uBD84\uC11D\uAC00\uC785\uB2C8\uB2E4.
\uD55C\uAD6D \uC628\uB77C\uC778 \uC5EC\uB860 \uB370\uC774\uD130(\uB274\uC2A4, \uC720\uD29C\uBE0C, \uCEE4\uBBA4\uB2C8\uD2F0 \uB313\uAE00)\uB97C \uC885\uD569\uD558\uC5EC **\uC2DC\uAC04\uCD95 \uAE30\uBC18 \uC5EC\uB860 \uAD6C\uC870**\uB97C \uD30C\uC545\uD569\uB2C8\uB2E4.

## \uC804\uBB38 \uC5ED\uB7C9
- \uC77C\uBCC4/\uC8FC\uBCC4 \uC5EC\uB860 \uD750\uB984\uC758 \uBCC0\uACE1\uC810(inflection point)\uC744 \uC815\uD655\uD788 \uD3EC\uCC29
- \uC774\uBCA4\uD2B8-\uBC18\uC751 \uAC04 \uC778\uACFC\uAD00\uACC4\uB97C \uCD94\uB860\uD558\uC5EC \uD0C0\uC784\uB77C\uC778 \uAD6C\uC131
- \uD50C\uB7AB\uD3FC\uBCC4 \uB370\uC774\uD130 \uD3B8\uD5A5\uC744 \uBCF4\uC815\uD55C \uC885\uD569 \uBC29\uD5A5\uC131 \uD310\uB2E8
- \uB2E8\uC21C \uAC10\uC815 \uC9D1\uACC4\uAC00 \uC544\uB2CC, \uC5EC\uB860\uC758 **\uAD6C\uC870\uC801 \uD750\uB984**(\uC0C1\uC2B9\u2192\uC815\uCCB4\u2192\uBC18\uC804 \uB4F1)\uC744 \uC11C\uC0AC\uB85C \uAD6C\uC131
${PLATFORM_KNOWLEDGE}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const { articles, videos, comments, dateRange } = formatInputData(data);
    return `## \uBD84\uC11D \uB300\uC0C1: "${data.keyword}"
## \uBD84\uC11D \uAE30\uAC04: ${dateRange}

### \uB274\uC2A4 \uAE30\uC0AC (${articles.length}\uAC74)
${articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}
   ${a.content}`).join("\n")}

### \uC601\uC0C1 (${videos.length}\uAC74)
${videos.map((v, i) => `${i + 1}. [${v.channel}] ${v.title} (\uC870\uD68C\uC218: ${v.viewCount}, \uC88B\uC544\uC694: ${v.likeCount})`).join("\n")}

### \uB313\uAE00 (${comments.length}\uAC74)
${comments.map((c, i) => `${i + 1}. [${c.source}] ${c.content} (\uC88B\uC544\uC694: ${c.likeCount})`).join("\n")}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uC2DC\uAC04\uCD95 \uC2A4\uCE94
- \uAE30\uC0AC \uBC1C\uD589\uC77C\uACFC \uB313\uAE00 \uC791\uC131\uC77C\uC744 \uAE30\uC900\uC73C\uB85C \uC77C\uBCC4 \uC5B8\uAE09\uB7C9\uC744 \uC9D1\uACC4\uD558\uC138\uC694
- \uC5B8\uAE09\uB7C9\uC774 \uAE09\uC99D(\uC804\uC77C \uB300\uBE44 2\uBC30 \uC774\uC0C1)\uD558\uAC70\uB098 \uAE09\uAC10\uD55C \uB0A0\uC9DC\uB97C \uD45C\uC2DC\uD558\uC138\uC694

### Step 2: \uC774\uBCA4\uD2B8-\uBC18\uC751 \uB9E4\uD551
- \uAE09\uC99D/\uAE09\uAC10 \uC2DC\uC810\uC5D0 \uC5B4\uB5A4 \uAE30\uC0AC\xB7\uBC1C\uC5B8\xB7\uC0AC\uAC74\uC774 \uC788\uC5C8\uB294\uC9C0 \uC2DD\uBCC4\uD558\uC138\uC694
- "\uC774\uBCA4\uD2B8 \u2192 \uD50C\uB7AB\uD3FC\uBCC4 \uBC18\uC751 \u2192 \uD6C4\uC18D \uC601\uD5A5"\uC758 \uC778\uACFC \uCCB4\uC778\uC744 \uAD6C\uC131\uD558\uC138\uC694

### Step 3: \uBCC0\uACE1\uC810 \uD310\uBCC4
- \uAC10\uC815 \uAE30\uC870\uAC00 \uC804\uD658\uB41C \uC2DC\uC810(\uAE0D\uC815\u2192\uBD80\uC815, \uB610\uB294 \uBC18\uB300)\uC744 \uBCC0\uACE1\uC810\uC73C\uB85C \uC2DD\uBCC4\uD558\uC138\uC694
- \uBCC0\uACE1\uC810 \uC804\uD6C4\uC758 \uAC10\uC815 \uBCC0\uD654\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uAE30\uC220\uD558\uC138\uC694 (beforeSentiment \u2192 afterSentiment)

### Step 4: \uAD6C\uC870\uC801 \uC11C\uC0AC \uAD6C\uC131
- \uC704 \uBD84\uC11D\uC744 \uC885\uD569\uD558\uC5EC \uC804\uCCB4 \uC5EC\uB860\uC758 \uD750\uB984\uC744 3~5\uC904\uC758 \uC11C\uC0AC(narrative)\uB85C \uC694\uC57D\uD558\uC138\uC694
- \uB2E8\uC21C \uB098\uC5F4\uC774 \uC544\uB2CC, "A \uB54C\uBB38\uC5D0 B\uAC00 \uBC1C\uC0DD\uD588\uACE0, \uC774\uB85C \uC778\uD574 C\uB85C \uC804\uD658\uB428" \uD615\uD0DC\uC758 \uC778\uACFC\uC801 \uC11C\uC0AC\uB97C \uC791\uC131\uD558\uC138\uC694

### Step 5: \uC77C\uBCC4 \uCD94\uC774 \uC815\uB9AC
- \uBD84\uC11D \uAE30\uAC04 \uB0B4 \uC8FC\uC694 \uB0A0\uC9DC\uBCC4 \uC5B8\uAE09\uB7C9\uACFC \uAC10\uC815 \uBE44\uC728(positive/negative/neutral)\uC744 \uC815\uB9AC\uD558\uC138\uC694`;
  }
};
var SegmentationSchema = z.object({
  platformSegments: z.array(
    z.object({
      platform: z.string().catch(""),
      sentiment: z.enum(["positive", "negative", "mixed"]).catch("mixed"),
      keyTopics: z.array(z.string()).default([]),
      volume: z.number().catch(0),
      characteristics: z.string().catch("")
    })
  ).default([]).describe("\uD50C\uB7AB\uD3FC\uBCC4 \uBC18\uC751 \uC138\uBD84\uD654"),
  audienceGroups: z.array(
    z.object({
      groupName: z.string().catch(""),
      type: z.enum(["core", "opposition", "swing"]).catch("swing"),
      characteristics: z.string().catch(""),
      sentiment: z.enum(["positive", "negative", "mixed"]).catch("mixed"),
      influence: z.enum(["high", "medium", "low"]).catch("medium")
    })
  ).default([]).describe("\uC9D1\uB2E8\uBCC4 \uBC18\uC751 (Core/Opposition/Swing)"),
  highInfluenceGroup: z.object({
    name: z.string().catch("\uBBF8\uD655\uC778"),
    reason: z.string().catch("\uB370\uC774\uD130 \uBD80\uC871")
  }).catch({ name: "\uBBF8\uD655\uC778", reason: "\uB370\uC774\uD130 \uBD80\uC871" }).describe("\uAC00\uC7A5 \uC601\uD5A5\uB825 \uB192\uC740 \uC9D1\uB2E8")
});

// src/modules/segmentation.ts
var segmentationModule = {
  name: "segmentation",
  displayName: "\uC9D1\uB2E8\uBCC4 \uBC18\uC751 \uBD84\uC11D",
  provider: MODULE_MODEL_MAP["segmentation"].provider,
  model: MODULE_MODEL_MAP["segmentation"].model,
  schema: SegmentationSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uC5EC\uB860\uC758 \uC9D1\uB2E8 \uC5ED\uD559(group dynamics) \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC628\uB77C\uC778 \uC5EC\uB860 \uB370\uC774\uD130\uC5D0\uC11C **\uB204\uAC00, \uC5B4\uB5A4 \uD50C\uB7AB\uD3FC\uC5D0\uC11C, \uC5B4\uB5A4 \uBC18\uC751**\uC744 \uBCF4\uC774\uB294\uC9C0 \uC138\uBD84\uD654\uD569\uB2C8\uB2E4.

## \uC804\uBB38 \uC5ED\uB7C9
- \uD50C\uB7AB\uD3FC\uBCC4 \uC0AC\uC6A9\uC790 \uD2B9\uC131\uC744 \uAC10\uC548\uD55C \uB370\uC774\uD130 \uD574\uC11D (\uB124\uC774\uBC84 \uB313\uAE00 \u2260 \uD074\uB9AC\uC559 \uB313\uAE00)
- Core(\uD575\uC2EC \uC9C0\uC9C0\uCE35) / Opposition(\uBC18\uB300\uCE35) / Swing(\uC720\uB3D9\uCE35) \uC0BC\uBD84\uBC95\uC73C\uB85C \uC9D1\uB2E8 \uAD6C\uC870 \uD30C\uC545
- \uAC01 \uC9D1\uB2E8\uC758 \uADDC\uBAA8\xB7\uACB0\uC9D1\uB825\xB7\uC774\uD0C8 \uAC00\uB2A5\uC131\uC744 \uC885\uD569\uD55C \uC601\uD5A5\uB825 \uD3C9\uAC00
- \uB313\uAE00 \uC5B4\uD22C\xB7\uC6A9\uC5B4\xB7\uC88B\uC544\uC694 \uD328\uD134\uC5D0\uC11C \uC9D1\uB2E8 \uD2B9\uC131\uC744 \uCD94\uB860

## Core/Opposition/Swing \uD310\uBCC4 \uAE30\uC900
- **Core**: \uC77C\uAD00\uB418\uAC8C \uC639\uD638/\uC9C0\uC9C0\uD558\uB294 \uB313\uAE00, \uCD9C\uCC98 \uBD88\uBB38 \uAE0D\uC815 \uBC18\uC751, \uBC18\uB860\uC5D0\uB3C4 \uC785\uC7A5 \uC720\uC9C0
- **Opposition**: \uC77C\uAD00\uB418\uAC8C \uBE44\uD310/\uBC18\uB300\uD558\uB294 \uB313\uAE00, \uBD80\uC815 \uD504\uB808\uC784 \uC801\uADF9 \uD655\uC0B0, \uB300\uC548 \uC81C\uC2DC
- **Swing**: \uC774\uC288\uC5D0 \uB530\uB77C \uC785\uC7A5 \uBCC0\uB3D9, \uC870\uAC74\uBD80 \uC9C0\uC9C0/\uBC18\uB300, "~\uD558\uBA74 \uC88B\uACA0\uB294\uB370" \uD615\uD0DC\uC758 \uC720\uBCF4\uC801 \uD45C\uD604
${PLATFORM_KNOWLEDGE}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const { articles, videos, comments, dateRange } = formatInputData(data);
    return `## \uBD84\uC11D \uB300\uC0C1: "${data.keyword}"
## \uBD84\uC11D \uAE30\uAC04: ${dateRange}

### \uB274\uC2A4 \uAE30\uC0AC (${articles.length}\uAC74)
${articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}
   ${a.content}`).join("\n")}

### \uC601\uC0C1 (${videos.length}\uAC74)
${videos.map((v, i) => `${i + 1}. [${v.channel}] ${v.title} (\uC870\uD68C\uC218: ${v.viewCount}, \uC88B\uC544\uC694: ${v.likeCount})`).join("\n")}

### \uB313\uAE00 (${comments.length}\uAC74)
${comments.map((c, i) => `${i + 1}. [${c.source}] ${c.content} (\uC88B\uC544\uC694: ${c.likeCount})`).join("\n")}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD50C\uB7AB\uD3FC\uBCC4 \uBD84\uB9AC
- \uAC01 \uD50C\uB7AB\uD3FC(naver, youtube, clien, fmkorea, dcinside)\uC758 \uB313\uAE00\uC744 \uBD84\uB9AC\uD558\uC138\uC694
- \uD50C\uB7AB\uD3FC\uBCC4 \uC804\uCCB4 \uAC10\uC815 \uAE30\uC870(\uAE0D\uC815/\uBD80\uC815/\uC911\uB9BD \uBE44\uC728)\uB97C 1\uCC28 \uD310\uB2E8\uD558\uC138\uC694

### Step 2: \uC9D1\uB2E8 \uC2DD\uBCC4
- \uB313\uAE00 \uB0B4\uC6A9\xB7\uC5B4\uD22C\xB7\uC88B\uC544\uC694 \uD328\uD134\uC5D0\uC11C Core/Opposition/Swing \uC9D1\uB2E8\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- \uAC01 \uC9D1\uB2E8\uC758 \uB300\uD45C\uC801 \uD45C\uD604 \uD328\uD134\uACFC \uAD00\uC2EC \uC8FC\uC81C\uB97C \uC815\uB9AC\uD558\uC138\uC694

### Step 3: \uC9D1\uB2E8\uBCC4 \uC601\uD5A5\uB825 \uD3C9\uAC00
- \uAC01 \uC9D1\uB2E8\uC758 \uCD94\uC815 \uADDC\uBAA8(\uB313\uAE00 \uBE44\uC728), \uACB0\uC9D1\uB825(\uC758\uACAC \uC77C\uAD00\uC131), \uD655\uC0B0\uB825(\uC88B\uC544\uC694\xB7\uACF5\uC720 \uC218)\uC744 \uD3C9\uAC00\uD558\uC138\uC694
- \uC601\uD5A5\uB825\uC740 "\uADDC\uBAA8 \xD7 \uACB0\uC9D1\uB825 \xD7 \uD655\uC0B0\uB825"\uC744 \uC885\uD569 \uACE0\uB824\uD558\uC5EC high/medium/low\uB85C \uD310\uB2E8\uD558\uC138\uC694

### Step 4: \uC804\uB7B5\uC801 \uC778\uC0AC\uC774\uD2B8
- Swing \uC9D1\uB2E8\uC758 \uC774\uD0C8 \uC870\uAC74\uACFC \uD3EC\uC12D \uAC00\uB2A5\uC131\uC744 \uAD6C\uCCB4\uC801\uC73C\uB85C \uAE30\uC220\uD558\uC138\uC694
- \uAC00\uC7A5 \uC601\uD5A5\uB825 \uB192\uC740 \uC9D1\uB2E8\uC774 \uC804\uCCB4 \uC5EC\uB860\uC5D0 \uBBF8\uCE58\uB294 \uC601\uD5A5\uC744 \uC124\uBA85\uD558\uC138\uC694`;
  }
};
var SentimentFramingSchema = z.object({
  sentimentRatio: z.object({
    positive: z.number().describe("0~1"),
    negative: z.number().describe("0~1"),
    neutral: z.number().describe("0~1")
  }).describe("\uAC10\uC815 \uBE44\uC728"),
  topKeywords: z.array(
    z.object({
      keyword: z.string().catch(""),
      count: z.number().catch(0),
      sentiment: z.enum(["positive", "negative", "neutral"]).catch("neutral")
    })
  ).default([]).describe("\uBC18\uBCF5 \uD0A4\uC6CC\uB4DC TOP 20"),
  relatedKeywords: z.array(
    z.object({
      keyword: z.string(),
      relatedTo: z.array(z.string()).default([]).describe("\uC5F0\uAD00 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D"),
      coOccurrenceScore: z.number().catch(0).describe("0~1 \uB3D9\uC2DC\uCD9C\uD604 \uBE48\uB3C4"),
      context: z.string().catch("").describe("\uC5F0\uAD00 \uB9E5\uB77D \uC124\uBA85")
    })
  ).default([]).describe("\uC5F0\uAD00\uC5B4 \uB124\uD2B8\uC6CC\uD06C (ANLZ-02)"),
  positiveFrames: z.array(
    z.object({
      frame: z.string().catch(""),
      description: z.string().catch(""),
      strength: z.number().catch(0).describe("1~10")
    })
  ).default([]).describe("\uAE0D\uC815 \uD504\uB808\uC784 TOP5 (\uCD5C\uB300 5\uAC1C)"),
  negativeFrames: z.array(
    z.object({
      frame: z.string().catch(""),
      description: z.string().catch(""),
      strength: z.number().catch(0).describe("1~10")
    })
  ).default([]).describe("\uBD80\uC815 \uD504\uB808\uC784 TOP5 (\uCD5C\uB300 5\uAC1C)"),
  frameConflict: z.object({
    description: z.string().catch("\uD504\uB808\uC784 \uCDA9\uB3CC \uC815\uBCF4 \uC5C6\uC74C"),
    dominantFrame: z.string().catch("\uBBF8\uD655\uC778"),
    challengingFrame: z.string().catch("\uBBF8\uD655\uC778")
  }).catch({
    description: "\uD504\uB808\uC784 \uCDA9\uB3CC \uC815\uBCF4 \uC5C6\uC74C",
    dominantFrame: "\uBBF8\uD655\uC778",
    challengingFrame: "\uBBF8\uD655\uC778"
  }).describe("\uD504\uB808\uC784 \uCDA9\uB3CC \uAD6C\uC870")
});

// src/modules/sentiment-framing.ts
var sentimentFramingModule = {
  name: "sentiment-framing",
  displayName: "\uAC10\uC815 \uBC0F \uD504\uB808\uC784 \uBD84\uC11D",
  provider: MODULE_MODEL_MAP["sentiment-framing"].provider,
  model: MODULE_MODEL_MAP["sentiment-framing"].model,
  schema: SentimentFramingSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uBBF8\uB514\uC5B4 \uD504\uB808\uC774\uBC0D(framing) \uC774\uB860\uACFC \uAC10\uC815 \uBD84\uC11D(sentiment analysis) \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC628\uB77C\uC778 \uC5EC\uB860 \uB370\uC774\uD130\uC5D0\uC11C **\uAC10\uC815\uC758 \uBD84\uD3EC, \uD575\uC2EC \uD0A4\uC6CC\uB4DC, \uD504\uB808\uC784\uC758 \uACBD\uC7C1 \uAD6C\uC870**\uB97C \uC815\uB7C9\xB7\uC815\uC131 \uBD84\uC11D\uD569\uB2C8\uB2E4.

## \uC804\uBB38 \uC5ED\uB7C9
- \uAC10\uC815 \uBE44\uC728 \uC0B0\uCD9C \uC2DC \uD50C\uB7AB\uD3FC\uBCC4 \uD3B8\uD5A5\uC744 \uBCF4\uC815 (\uB124\uC774\uBC84 \uB313\uAE00\uC758 \uBD80\uC815 \uD3B8\uD5A5, \uC720\uD29C\uBE0C\uC758 \uCC44\uB110\uBCC4 \uD3B8\uD5A5 \uB4F1)
- \uD0A4\uC6CC\uB4DC \uCD94\uCD9C \uC2DC \uB2E8\uC21C \uBE48\uB3C4\uAC00 \uC544\uB2CC "\uC88B\uC544\uC694 \uAC00\uC911 \uBE48\uB3C4"\uB97C \uACE0\uB824 (\uC88B\uC544\uC694 \uB9CE\uC740 \uB313\uAE00\uC758 \uD0A4\uC6CC\uB4DC\uAC00 \uB354 \uB300\uD45C\uC801)
- \uD504\uB808\uC784 \uC2DD\uBCC4 \uC2DC "\uAC19\uC740 \uC0AC\uC2E4\uC744 \uB2E4\uB974\uAC8C \uD574\uC11D\uD558\uB294 \uAD00\uC810"\uC744 \uD504\uB808\uC784\uC73C\uB85C \uC778\uC2DD (\uB2E8\uC21C \uD1A0\uD53D \u2260 \uD504\uB808\uC784)
- \uC5F0\uAD00\uC5B4 \uB124\uD2B8\uC6CC\uD06C\uC5D0\uC11C "\uD568\uAED8 \uB4F1\uC7A5\uD558\uBA74 \uC758\uBBF8\uAC00 \uBCC0\uD558\uB294 \uD0A4\uC6CC\uB4DC \uC870\uD569"\uC744 \uD3EC\uCC29

## \uD504\uB808\uC784 vs \uD1A0\uD53D \uAD6C\uBD84
- **\uD1A0\uD53D**: "\uACBD\uC81C", "\uAD50\uC721", "\uC678\uAD50" \u2192 \uC8FC\uC81C \uC601\uC5ED (\uD504\uB808\uC784\uC774 \uC544\uB2D8)
- **\uD504\uB808\uC784**: "\uACBD\uC81C \uC2E4\uD328\uB860", "\uAD50\uC721 \uAC1C\uD601 \uAE30\uB300\uB860", "\uAD74\uC695 \uC678\uAD50\uB860" \u2192 \uAC19\uC740 \uD1A0\uD53D\uC744 \uD2B9\uC815 \uAD00\uC810\uC73C\uB85C \uD574\uC11D
- \uD504\uB808\uC784\uC740 \uBC18\uB4DC\uC2DC "~\uB860", "~\uD504\uB808\uC784", "~\uC11C\uC0AC" \uD615\uD0DC\uB85C \uBA85\uBA85\uD558\uC138\uC694

${FRAME_STRENGTH_ANCHOR}
${PLATFORM_KNOWLEDGE}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const { articles, videos, comments, dateRange } = formatInputData(data);
    return `## \uBD84\uC11D \uB300\uC0C1: "${data.keyword}"
## \uBD84\uC11D \uAE30\uAC04: ${dateRange}

### \uB274\uC2A4 \uAE30\uC0AC (${articles.length}\uAC74)
${articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}
   ${a.content}`).join("\n")}

### \uC601\uC0C1 (${videos.length}\uAC74)
${videos.map((v, i) => `${i + 1}. [${v.channel}] ${v.title} (\uC870\uD68C\uC218: ${v.viewCount}, \uC88B\uC544\uC694: ${v.likeCount})`).join("\n")}

### \uB313\uAE00 (${comments.length}\uAC74)
${comments.map((c, i) => `${i + 1}. [${c.source}] ${c.content} (\uC88B\uC544\uC694: ${c.likeCount})`).join("\n")}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uAC10\uC815 \uBE44\uC728 \uC0B0\uCD9C
- \uAC01 \uB313\uAE00\xB7\uAE30\uC0AC\uC758 \uAC10\uC815(\uAE0D\uC815/\uBD80\uC815/\uC911\uB9BD)\uC744 \uD310\uB2E8\uD558\uC138\uC694
- \uD50C\uB7AB\uD3FC\uBCC4 \uD3B8\uD5A5\uC744 \uBCF4\uC815\uD558\uC5EC \uC804\uCCB4 \uAC10\uC815 \uBE44\uC728\uC744 \uC0B0\uCD9C\uD558\uC138\uC694 (\uD569\uACC4 1.0)
- \uC608: \uB124\uC774\uBC84 \uB313\uAE00\uC774 \uBD80\uC815 70%\uB77C\uB3C4 \uB124\uC774\uBC84 \uD3B8\uD5A5\uC744 \uAC10\uC548\uD558\uBA74 \uC2E4\uC81C \uBD80\uC815\uC740 55% \uC218\uC900\uC77C \uC218 \uC788\uC74C

### Step 2: \uD0A4\uC6CC\uB4DC \uCD94\uCD9C
- \uC88B\uC544\uC694 \uC218\uAC00 \uB192\uC740 \uB313\uAE00\uC5D0 \uAC00\uC911\uCE58\uB97C \uB450\uC5B4 \uD0A4\uC6CC\uB4DC\uB97C \uCD94\uCD9C\uD558\uC138\uC694 (TOP 20)
- \uAC01 \uD0A4\uC6CC\uB4DC\uC758 \uAC10\uC815 \uADF9\uC131(\uAE0D\uC815/\uBD80\uC815/\uC911\uB9BD)\uC744 \uD310\uB2E8\uD558\uC138\uC694
- \uB2E8\uC21C \uACE0\uC720\uBA85\uC0AC(\uC778\uBB3C\uBA85, \uC815\uB2F9\uBA85)\uB294 \uC81C\uC678\uD558\uACE0 **\uC758\uACAC\uC774 \uB2F4\uAE34 \uD0A4\uC6CC\uB4DC**\uB97C \uCD94\uCD9C\uD558\uC138\uC694

### Step 3: \uC5F0\uAD00\uC5B4 \uB124\uD2B8\uC6CC\uD06C
- \uB3D9\uC77C \uB313\uAE00/\uAE30\uC0AC\uC5D0 \uD568\uAED8 \uB4F1\uC7A5\uD558\uB294 \uD0A4\uC6CC\uB4DC \uC30D\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- coOccurrenceScore(0~1)\uB294 \uB3D9\uC2DC \uCD9C\uD604 \uBE48\uB3C4 / \uAC1C\uBCC4 \uCD9C\uD604 \uBE48\uB3C4 \uCD5C\uB300\uAC12\uC73C\uB85C \uACC4\uC0B0\uD558\uC138\uC694

### Step 4: \uD504\uB808\uC784 \uC2DD\uBCC4
- \uB370\uC774\uD130\uC5D0\uC11C "\uAC19\uC740 \uC0AC\uC2E4\uC744 \uB2E4\uB974\uAC8C \uD574\uC11D\uD558\uB294 \uAD00\uC810"\uC744 \uD504\uB808\uC784\uC73C\uB85C \uC2DD\uBCC4\uD558\uC138\uC694
- \uAE0D\uC815 TOP5, \uBD80\uC815 TOP5\uB97C \uCD94\uCD9C\uD558\uACE0 \uAC01 \uD504\uB808\uC784\uC758 \uAC15\uB3C4\uB97C 1~10\uC73C\uB85C \uD3C9\uAC00\uD558\uC138\uC694
- \uD504\uB808\uC784\uBA85\uC740 \uAD6C\uCCB4\uC801\uC73C\uB85C (\uC608: "\uBB34\uB2A5\uB860" (X) \u2192 "\uACBD\uC81C\uC815\uCC45 \uBB34\uB2A5\uB860" (O))

### Step 5: \uD504\uB808\uC784 \uCDA9\uB3CC \uAD6C\uC870
- \uD604\uC7AC \uC9C0\uBC30\uC801\uC778 \uD504\uB808\uC784(dominant)\uACFC \uC774\uB97C \uB3C4\uC804\uD558\uB294 \uD504\uB808\uC784(challenging)\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- \uB450 \uD504\uB808\uC784\uC758 \uCDA9\uB3CC\uC774 \uC5EC\uB860\uC5D0 \uC5B4\uB5A4 \uC601\uD5A5\uC744 \uBBF8\uCE58\uB294\uC9C0 \uAE30\uC220\uD558\uC138\uC694`;
  }
};
var MessageImpactSchema = z.object({
  successMessages: z.array(
    z.object({
      content: z.string().catch(""),
      source: z.string().catch(""),
      impactScore: z.number().catch(0).describe("\uC601\uD5A5\uB825 \uC810\uC218 1~10 \uC815\uC218"),
      reason: z.string().catch(""),
      spreadType: z.string().catch("")
    })
  ).default([]).describe("\uAE0D\uC815 \uBC18\uC751\uC744 \uC720\uBC1C\uD55C \uC131\uACF5 \uBA54\uC2DC\uC9C0 \uBAA9\uB85D (\uCD5C\uC18C 1\uAC1C)"),
  failureMessages: z.array(
    z.object({
      content: z.string().catch(""),
      source: z.string().catch(""),
      negativeScore: z.number().catch(0).describe("\uBD80\uC815 \uC810\uC218 1~10 \uC815\uC218"),
      reason: z.string().catch(""),
      damageType: z.string().catch("")
    })
  ).default([]).describe("\uBD80\uC815 \uBC18\uC751\uC744 \uC720\uBC1C\uD55C \uC2E4\uD328 \uBA54\uC2DC\uC9C0 \uBAA9\uB85D (\uCD5C\uC18C 1\uAC1C)"),
  highSpreadContentTypes: z.array(
    z.object({
      type: z.string().catch(""),
      description: z.string().catch(""),
      exampleCount: z.number().catch(0).describe("\uC0AC\uB840 \uC218 (0 \uC774\uC0C1 \uC815\uC218)")
    })
  ).default([]).describe("\uD655\uC0B0\uB825 \uB192\uC740 \uCF58\uD150\uCE20 \uC720\uD615 \uBAA9\uB85D (\uCD5C\uC18C 1\uAC1C)")
});

// src/modules/message-impact.ts
var messageImpactModule = {
  name: "message-impact",
  displayName: "\uBA54\uC2DC\uC9C0 \uD6A8\uACFC \uBD84\uC11D",
  provider: MODULE_MODEL_MAP["message-impact"].provider,
  model: MODULE_MODEL_MAP["message-impact"].model,
  schema: MessageImpactSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uCEE4\uBBA4\uB2C8\uCF00\uC774\uC158 \uD6A8\uACFC \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC628\uB77C\uC778 \uC5EC\uB860 \uB370\uC774\uD130\uC5D0\uC11C **\uC5EC\uB860\uC744 \uC2E4\uC81C\uB85C \uC6C0\uC9C1\uC778 \uBA54\uC2DC\uC9C0**\uB97C \uC2DD\uBCC4\uD558\uACE0, \uC131\uACF5/\uC2E4\uD328 \uC6D0\uC778\uC744 \uBD84\uC11D\uD569\uB2C8\uB2E4.

## \uC804\uBB38 \uC5ED\uB7C9
- "\uC88B\uC544\uC694 \uC218\uAC00 \uB9CE\uC740 \uB313\uAE00" = \uACF5\uAC10 \uBA54\uC2DC\uC9C0, "\uB313\uAE00\uC774 \uB9CE\uC740 \uAE30\uC0AC" = \uB17C\uC7C1 \uC720\uBC1C \uBA54\uC2DC\uC9C0\uB97C \uAD6C\uBD84
- \uBA54\uC2DC\uC9C0\uC758 **\uD655\uC0B0 \uACBD\uB85C** \uCD94\uC801: \uCD5C\uCD08 \uBC1C\uD654 \u2192 \uD50C\uB7AB\uD3FC \uB0B4 \uD655\uC0B0 \u2192 \uD50C\uB7AB\uD3FC \uAC04 \uAD50\uCC28 \uD655\uC0B0
- \uC131\uACF5 \uBA54\uC2DC\uC9C0\uC758 \uACF5\uD1B5 \uD328\uD134(\uAC10\uC815 \uD638\uC18C, \uAD6C\uCCB4\uC801 \uC218\uCE58, \uBE44\uAD50 \uD504\uB808\uC784 \uB4F1) \uC2DD\uBCC4
- \uC2E4\uD328 \uBA54\uC2DC\uC9C0\uC758 \uACF5\uD1B5 \uD328\uD134(\uB9E5\uB77D \uBD80\uC7AC, \uC218\uD61C\uC790 \uBD88\uBA85, \uD604\uC2E4 \uAD34\uB9AC \uB4F1) \uC2DD\uBCC4

## content \uD544\uB4DC \uC791\uC131 \uADDC\uCE59
- \uB370\uC774\uD130\uC5D0 \uC2E4\uC81C\uB85C \uC874\uC7AC\uD558\uB294 \uBC1C\uC5B8/\uC81C\uBAA9/\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC778\uC6A9\uD558\uC138\uC694
- \uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uBC1C\uC5B8\uC744 \uC0DD\uC131\uD558\uC9C0 \uB9C8\uC138\uC694
- \uC6D0\uBB38\uC774 \uAE38\uBA74 \uD575\uC2EC \uBD80\uBD84\uB9CC \uBC1C\uCDCC\uD558\uB418, \uC758\uBBF8\uAC00 \uC65C\uACE1\uB418\uC9C0 \uC54A\uB3C4\uB85D \uD558\uC138\uC694

${IMPACT_SCORE_ANCHOR}
${PLATFORM_KNOWLEDGE}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const { articles, videos, comments, dateRange } = formatInputData(data);
    return `## \uBD84\uC11D \uB300\uC0C1: "${data.keyword}"
## \uBD84\uC11D \uAE30\uAC04: ${dateRange}

### \uB274\uC2A4 \uAE30\uC0AC (${articles.length}\uAC74)
${articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}
   ${a.content}`).join("\n")}

### \uC601\uC0C1 (${videos.length}\uAC74)
${videos.map((v, i) => `${i + 1}. [${v.channel}] ${v.title} (\uC870\uD68C\uC218: ${v.viewCount}, \uC88B\uC544\uC694: ${v.likeCount})`).join("\n")}

### \uB313\uAE00 (${comments.length}\uAC74)
${comments.map((c, i) => `${i + 1}. [${c.source}] ${c.content} (\uC88B\uC544\uC694: ${c.likeCount})`).join("\n")}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uACE0\uBC18\uC751 \uCF58\uD150\uCE20 \uC2DD\uBCC4
- \uC88B\uC544\uC694 \uC218 \uC0C1\uC704 \uB313\uAE00, \uC870\uD68C\uC218 \uC0C1\uC704 \uC601\uC0C1, \uB313\uAE00 \uB9CE\uC740 \uAE30\uC0AC\uB97C "\uACE0\uBC18\uC751 \uCF58\uD150\uCE20"\uB85C \uC120\uBCC4\uD558\uC138\uC694
- \uAE0D\uC815 \uBC18\uC751 \uC720\uBC1C \uCF58\uD150\uCE20\uC640 \uBD80\uC815 \uBC18\uC751 \uC720\uBC1C \uCF58\uD150\uCE20\uB97C \uBD84\uB9AC\uD558\uC138\uC694

### Step 2: \uC131\uACF5 \uBA54\uC2DC\uC9C0 \uBD84\uC11D (3~7\uAC1C)
- \uAE0D\uC815 \uBC18\uC751\uC744 \uC720\uBC1C\uD55C \uBC1C\uC5B8/\uCF58\uD150\uCE20\uB97C \uC120\uBCC4\uD558\uC138\uC694
- \uAC01 \uBA54\uC2DC\uC9C0\uAC00 **\uC65C** \uC131\uACF5\uD588\uB294\uC9C0 \uAD6C\uCCB4\uC801 \uC774\uC720\uB97C \uAE30\uC220\uD558\uC138\uC694 (\uAC10\uC815 \uD638\uC18C? \uAD6C\uCCB4\uC801 \uC131\uACFC? \uACF5\uAC10\uB300?)
- impactScore\uB294 \uC704\uC758 \uC575\uCEE4 \uAE30\uC900\uD45C\uC5D0 \uB530\uB77C \uBD80\uC5EC\uD558\uC138\uC694

### Step 3: \uC2E4\uD328 \uBA54\uC2DC\uC9C0 \uBD84\uC11D (3~7\uAC1C)
- \uBD80\uC815 \uBC18\uC751\uC744 \uC720\uBC1C\uD55C \uBC1C\uC5B8/\uCF58\uD150\uCE20\uB97C \uC120\uBCC4\uD558\uC138\uC694
- \uAC01 \uBA54\uC2DC\uC9C0\uAC00 **\uC65C** \uC2E4\uD328\uD588\uB294\uC9C0 \uAD6C\uCCB4\uC801 \uC774\uC720\uB97C \uAE30\uC220\uD558\uC138\uC694
- damageType\uC740 \uC2E4\uC81C \uD53C\uD574 \uC591\uC0C1\uC744 \uBC18\uC601\uD558\uC138\uC694 (\uC2E0\uB8B0\uB3C4 \uD558\uB77D, \uC9C0\uC9C0\uCE35 \uC774\uD0C8, \uD504\uB808\uC784 \uC5ED\uACF5, \uC870\uB871/\uBC08\uD654 \uB4F1)

### Step 4: \uD655\uC0B0 \uC720\uD615 \uD328\uD134
- \uB370\uC774\uD130\uC5D0\uC11C \uD655\uC0B0\uB825\uC774 \uB192\uC558\uB358 \uCF58\uD150\uCE20 \uC720\uD615\uC758 \uACF5\uD1B5\uC810\uC744 \uB3C4\uCD9C\uD558\uC138\uC694
- \uC720\uD615\uBCC4 \uC0AC\uB840 \uC218\uB294 \uC2E4\uC81C \uB370\uC774\uD130\uC5D0\uC11C \uCE74\uC6B4\uD2B8\uD558\uC138\uC694`;
  }
};
var RiskMapSchema = z.object({
  topRisks: z.array(
    z.object({
      rank: z.number().catch(0),
      title: z.string().catch(""),
      description: z.string().catch(""),
      impactLevel: z.enum(["critical", "high", "medium", "low"]).catch("medium"),
      spreadProbability: z.number().catch(0).describe("0~1 \uD655\uC0B0 \uAC00\uB2A5\uC131"),
      currentStatus: z.string().catch(""),
      triggerConditions: z.array(z.string()).default([])
    })
  ).default([]).describe("Top 3~5 \uB9AC\uC2A4\uD06C (\uCD5C\uB300 5\uAC1C)"),
  overallRiskLevel: z.enum(["critical", "high", "medium", "low"]).describe("\uC804\uCCB4 \uB9AC\uC2A4\uD06C \uC218\uC900"),
  riskTrend: z.enum(["increasing", "stable", "decreasing"]).describe("\uB9AC\uC2A4\uD06C \uCD94\uC138")
});

// src/modules/risk-map.ts
var config = MODULE_MODEL_MAP["risk-map"];
var riskMapModule = {
  name: "risk-map",
  displayName: "\uB9AC\uC2A4\uD06C \uB9F5 \uBD84\uC11D",
  provider: config.provider,
  model: config.model,
  schema: RiskMapSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uB9AC\uC2A4\uD06C \uBD84\uC11D \uBC0F \uC704\uAE30 \uC608\uCE21 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC5EC\uB860 \uB370\uC774\uD130\uC5D0\uC11C **\uD604\uC7AC \uC7A0\uC7AC\uB41C \uB9AC\uC2A4\uD06C\uC640 \uD5A5\uD6C4 \uD3ED\uBC1C \uAC00\uB2A5\uC131**\uC744 \uB3C4\uCD9C\uD569\uB2C8\uB2E4.

## \uB9AC\uC2A4\uD06C \uD3C9\uAC00 \uD504\uB808\uC784\uC6CC\uD06C

\uAC01 \uB9AC\uC2A4\uD06C\uB97C \uB2E4\uC74C 4\uAC00\uC9C0 \uCC28\uC6D0\uC73C\uB85C \uD3C9\uAC00\uD558\uC138\uC694:

1. **\uBC1C\uD654\uC810(Ignition)**: \uCD5C\uCD08 \uC774\uC288\uAC00 \uC5B4\uB514\uC11C \uC81C\uAE30\uB418\uC5C8\uB294\uAC00? \uBBF8\uB514\uC5B4 \uC99D\uD3ED \uACBD\uB85C\uB294?
2. **\uD655\uC0B0\uB825(Virality)**: \uD50C\uB7AB\uD3FC \uAD50\uCC28 \uD655\uC0B0 \uAC00\uB2A5\uC131. \uB2E8\uC77C \uD50C\uB7AB\uD3FC vs \uBA40\uD2F0 \uD50C\uB7AB\uD3FC \uB9AC\uC2A4\uD06C
3. **\uC9C0\uC18D\uC131(Duration)**: \uB274\uC2A4 \uC0AC\uC774\uD074 \uB0B4 \uC0DD\uC874 \uAE30\uAC04 \uC608\uCE21. \uC77C\uD68C\uC131 vs \uAD6C\uC870\uC801 \uBB38\uC81C
4. **\uD53C\uD574 \uBC94\uC704(Blast Radius)**: \uC5B4\uB5A4 \uC9D1\uB2E8(Core/Opposition/Swing)\uC5D0 \uD30C\uAE09\uB418\uB294\uAC00?

## spreadProbability \uAE30\uC900
- 0.8~1.0: \uC774\uBBF8 \uD655\uC0B0 \uC911\uC774\uAC70\uB098 \uD2B8\uB9AC\uAC70 \uC870\uAC74\uC774 \uC784\uBC15
- 0.5~0.7: \uD2B9\uC815 \uC774\uBCA4\uD2B8 \uBC1C\uC0DD \uC2DC \uB192\uC740 \uD655\uB960\uB85C \uD655\uC0B0
- 0.3~0.4: \uC7A0\uC7AC\uC801 \uB9AC\uC2A4\uD06C\uC774\uB098 \uD604\uC7AC \uD655\uC0B0 \uB3D9\uB825 \uBD80\uC871
- 0.0~0.2: \uC774\uB860\uC801 \uAC00\uB2A5\uC131\uB9CC \uC874\uC7AC
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 20).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 30).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 30\uAC74)
${commentsSample}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uBD80\uC815 \uC2E0\uD638 \uC218\uC9D1
- \uAE30\uC0AC \uC81C\uBAA9\uACFC \uB313\uAE00\uC5D0\uC11C \uBD80\uC815\uC801 \uBC18\uC751\uC774 \uC9D1\uC911\uB41C \uD1A0\uD53D\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- \uAC01 \uD1A0\uD53D\uC758 \uBD80\uC815 \uAC10\uC815 \uAC15\uB3C4\uC640 \uBE48\uB3C4\uB97C \uD30C\uC545\uD558\uC138\uC694

### Step 2: \uB9AC\uC2A4\uD06C \uD6C4\uBCF4 \uB3C4\uCD9C
- \uBD80\uC815 \uC2E0\uD638\uAC00 \uAC15\uD55C \uD1A0\uD53D\uC744 \uB9AC\uC2A4\uD06C \uD6C4\uBCF4\uB85C \uC120\uC815\uD558\uC138\uC694 (5~7\uAC1C)
- \uAC01 \uD6C4\uBCF4\uC758 \uBC1C\uD654\uC810, \uD655\uC0B0\uB825, \uC9C0\uC18D\uC131, \uD53C\uD574 \uBC94\uC704\uB97C \uD3C9\uAC00\uD558\uC138\uC694

### Step 3: \uB9AC\uC2A4\uD06C \uC21C\uC704\uD654
- \uC601\uD5A5\uB3C4(impactLevel)\uC640 \uD655\uC0B0 \uAC00\uB2A5\uC131(spreadProbability)\uC744 \uAE30\uC900\uC73C\uB85C Top 3~5\uB97C \uC120\uC815\uD558\uC138\uC694
- \uAC01 \uB9AC\uC2A4\uD06C\uC758 \uD2B8\uB9AC\uAC70 \uC870\uAC74(\uC5B4\uB5A4 \uC774\uBCA4\uD2B8\uAC00 \uBC1C\uC0DD\uD558\uBA74 \uD604\uC2E4\uD654\uB418\uB294\uC9C0)\uC744 \uAD6C\uCCB4\uC801\uC73C\uB85C \uAE30\uC220\uD558\uC138\uC694

### Step 4: \uC804\uCCB4 \uB9AC\uC2A4\uD06C \uC218\uC900 \uD310\uB2E8
- overallRiskLevel\uACFC riskTrend\uB97C \uC885\uD569 \uD310\uB2E8\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForRiskMap(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D (Stage 1)
${distilledContext}

\uC704 \uC120\uD589 \uBD84\uC11D\uC758 \uBD80\uC815 \uD504\uB808\uC784, \uC2E4\uD328 \uBA54\uC2DC\uC9C0, \uC5EC\uB860 \uBCC0\uACE1\uC810\uC744 \uB9AC\uC2A4\uD06C \uD6C4\uBCF4\uC758 \uADFC\uAC70\uB85C \uD65C\uC6A9\uD558\uC138\uC694.
\uC120\uD589 \uACB0\uACFC\uB97C \uADF8\uB300\uB85C \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9D0\uACE0, \uB9AC\uC2A4\uD06C \uAD00\uC810\uC5D0\uC11C \uC7AC\uD574\uC11D\uD558\uC138\uC694.`;
  }
};
var OpportunitySchema = z.object({
  positiveAssets: z.array(
    z.object({
      title: z.string().catch(""),
      description: z.string().catch(""),
      expandability: z.enum(["high", "medium", "low"]).catch("medium"),
      currentUtilization: z.enum(["fully", "partially", "unused"]).catch("partially"),
      recommendation: z.string().catch("")
    })
  ).default([]).describe("\uD655\uC7A5 \uAC00\uB2A5\uD55C \uAE0D\uC815 \uC694\uC18C"),
  untappedAreas: z.array(
    z.object({
      area: z.string().catch(""),
      potential: z.string().catch(""),
      approach: z.string().catch("")
    })
  ).default([]).describe("\uBBF8\uD65C\uC6A9 \uC601\uC5ED"),
  priorityOpportunity: z.object({
    title: z.string().catch(""),
    reason: z.string().catch(""),
    actionPlan: z.string().catch("")
  }).catch({ title: "", reason: "", actionPlan: "" })
});

// src/modules/opportunity.ts
var config2 = MODULE_MODEL_MAP["opportunity"];
var opportunityModule = {
  name: "opportunity",
  displayName: "\uAE30\uD68C \uC694\uC18C \uBD84\uC11D",
  provider: config2.provider,
  model: config2.model,
  schema: OpportunitySchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC5EC\uB860 \uAE30\uBC18 \uAE30\uD68C \uBC1C\uAD74 \uBC0F \uC804\uB7B5\uC801 \uC790\uC0B0 \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uBD80\uC815\uC801 \uC5EC\uB860 \uC18D\uC5D0\uC11C\uB3C4 **\uD65C\uC6A9 \uAC00\uB2A5\uD55C \uAE0D\uC815 \uC790\uC0B0\uACFC \uBBF8\uAC1C\uBC1C \uC601\uC5ED**\uC744 \uC2DD\uBCC4\uD569\uB2C8\uB2E4.

## \uAE30\uD68C \uD3C9\uAC00 \uD504\uB808\uC784\uC6CC\uD06C

1. **\uD604\uC7AC \uC790\uC0B0(Current Assets)**: \uC774\uBBF8 \uAE0D\uC815 \uBC18\uC751\uC744 \uC5BB\uACE0 \uC788\uC9C0\uB9CC \uCDA9\uBD84\uD788 \uD65C\uC6A9\uB418\uC9C0 \uC54A\uB294 \uC694\uC18C
2. **\uBBF8\uAC1C\uBC1C \uC601\uC5ED(Untapped Areas)**: \uC544\uC9C1 \uB2E4\uB8E8\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uC7A0\uC7AC\uC801 \uD638\uC751\uC774 \uC608\uC0C1\uB418\uB294 \uC601\uC5ED
3. **\uC804\uD658 \uAE30\uD68C(Conversion Opportunities)**: Swing \uC9D1\uB2E8\uC744 \uC6B0\uD638\uC801\uC73C\uB85C \uC804\uD658\uD560 \uC218 \uC788\uB294 \uC811\uC810

## currentUtilization \uD310\uB2E8 \uAE30\uC900
- **fully**: \uC774\uBBF8 \uC801\uADF9 \uD65C\uC6A9 \uC911 (\uCD94\uAC00 \uD655\uC7A5 \uC5EC\uC9C0 \uC81C\uD55C\uC801)
- **partially**: \uD65C\uC6A9\uD558\uACE0 \uC788\uC73C\uB098 \uC77C\uBD80 \uD50C\uB7AB\uD3FC/\uC9D1\uB2E8\uC5D0\uC11C\uB9CC \uD6A8\uACFC (\uD655\uC7A5 \uAC00\uB2A5)
- **unused**: \uAE0D\uC815 \uC7A0\uC7AC\uB825\uC774 \uC788\uC73C\uB098 \uC804\uD600 \uD65C\uC6A9\uD558\uC9C0 \uC54A\uACE0 \uC788\uC74C (\uC989\uC2DC \uD65C\uC6A9 \uAD8C\uC7A5)
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 20).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 30).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 30\uAC74)
${commentsSample}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uAE0D\uC815 \uC2E0\uD638 \uC218\uC9D1
- \uAE30\uC0AC\uC640 \uB313\uAE00\uC5D0\uC11C \uAE0D\uC815\uC801 \uBC18\uC751\uC774 \uC9D1\uC911\uB41C \uD1A0\uD53D\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- \uC88B\uC544\uC694 \uC218\uAC00 \uB192\uC740 \uAE0D\uC815 \uB313\uAE00\uC758 \uACF5\uD1B5 \uC8FC\uC81C\uB97C \uD30C\uC545\uD558\uC138\uC694

### Step 2: \uD604\uC7AC \uC790\uC0B0 \uD3C9\uAC00
- \uC774\uBBF8 \uAE0D\uC815 \uBC18\uC751\uC744 \uC5BB\uACE0 \uC788\uB294 \uC694\uC18C\uB97C \uC815\uB9AC\uD558\uACE0, \uD604\uC7AC \uD65C\uC6A9 \uC218\uC900\uC744 \uD3C9\uAC00\uD558\uC138\uC694
- \uD655\uC7A5 \uAC00\uB2A5\uC131(expandability)\uC744 high/medium/low\uB85C \uD310\uB2E8\uD558\uC138\uC694

### Step 3: \uBBF8\uAC1C\uBC1C \uC601\uC5ED \uD0D0\uC0C9
- \uB370\uC774\uD130\uC5D0\uC11C \uAD00\uC2EC\uC740 \uC788\uC9C0\uB9CC \uC544\uC9C1 \uCDA9\uBD84\uD788 \uC5B4\uD544\uD558\uC9C0 \uBABB\uD55C \uC601\uC5ED\uC744 \uCC3E\uC73C\uC138\uC694
- \uAC01 \uC601\uC5ED\uC758 \uC7A0\uC7AC\uB825\uACFC \uC811\uADFC \uBC29\uBC95\uC744 \uC81C\uC548\uD558\uC138\uC694

### Step 4: \uCD5C\uC6B0\uC120 \uAE30\uD68C \uC120\uC815
- \uC704 \uBD84\uC11D\uC744 \uC885\uD569\uD558\uC5EC \uAC00\uC7A5 ROI\uAC00 \uB192\uC740 \uAE30\uD68C 1\uAC1C\uB97C \uC120\uC815\uD558\uACE0 \uAD6C\uCCB4\uC801 \uC2E4\uD589 \uACC4\uD68D\uC744 \uC81C\uC2DC\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForOpportunity(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D (Stage 1)
${distilledContext}

\uC704 \uC120\uD589 \uBD84\uC11D\uC758 \uAE0D\uC815 \uD504\uB808\uC784, \uC131\uACF5 \uBA54\uC2DC\uC9C0, \uC6B0\uD638 \uC9D1\uB2E8\uC744 \uAE30\uD68C \uD0D0\uC0C9\uC758 \uCD9C\uBC1C\uC810\uC73C\uB85C \uD65C\uC6A9\uD558\uC138\uC694.
\uC120\uD589 \uACB0\uACFC\uB97C \uADF8\uB300\uB85C \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9D0\uACE0, \uAE30\uD68C \uAD00\uC810\uC5D0\uC11C \uC7AC\uD574\uC11D\uD558\uC138\uC694.`;
  }
};
var StrategySchema = z.object({
  targetStrategy: z.object({
    primaryTarget: z.string().catch(""),
    secondaryTargets: z.array(z.string()).default([]),
    approach: z.string().catch("")
  }).catch({ primaryTarget: "", secondaryTargets: [], approach: "" }).describe("\uD0C0\uAC9F \uC804\uB7B5"),
  messageStrategy: z.object({
    coreMessage: z.string().catch(""),
    supportingMessages: z.array(z.string()).default([]),
    toneAndManner: z.string().catch("")
  }).catch({ coreMessage: "", supportingMessages: [], toneAndManner: "" }).describe("\uBA54\uC2DC\uC9C0 \uC804\uB7B5"),
  contentStrategy: z.object({
    recommendedFormats: z.array(z.string()).default([]),
    keyTopics: z.array(z.string()).default([]),
    distributionChannels: z.array(z.string()).default([])
  }).catch({ recommendedFormats: [], keyTopics: [], distributionChannels: [] }).describe("\uCF58\uD150\uCE20 \uC804\uB7B5"),
  riskResponse: z.object({
    immediateActions: z.array(z.string()).default([]),
    preventiveActions: z.array(z.string()).default([]),
    contingencyPlan: z.string().catch("")
  }).catch({ immediateActions: [], preventiveActions: [], contingencyPlan: "" }).describe("\uB9AC\uC2A4\uD06C \uB300\uC751")
});

// src/modules/strategy.ts
var config3 = MODULE_MODEL_MAP["strategy"];
var strategyModule = {
  name: "strategy",
  displayName: "\uC885\uD569 \uC804\uB7B5 \uB3C4\uCD9C",
  provider: config3.provider,
  model: config3.model,
  schema: StrategySchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uC5EC\uB860 \uC804\uB7B5 \uC218\uB9BD \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC5EC\uB860 \uBD84\uC11D\xB7\uB9AC\uC2A4\uD06C\xB7\uAE30\uD68C \uACB0\uACFC\uB97C \uC885\uD569\uD558\uC5EC **\uC2E4\uD589 \uAC00\uB2A5\uD558\uACE0 \uAD6C\uCCB4\uC801\uC778 \uC804\uB7B5**\uC744 \uB3C4\uCD9C\uD569\uB2C8\uB2E4.

## \uC804\uB7B5 \uC218\uB9BD \uC6D0\uCE59

1. **\uD0C0\uAC9F \uC804\uB7B5**: Swing \uC9D1\uB2E8 \uD3EC\uC12D\uC774 \uD575\uC2EC. Core \uC720\uC9C0 \uBE44\uC6A9\uACFC Opposition \uC804\uD658 \uBE44\uC6A9\uC744 \uBE44\uAD50\uD558\uC5EC \uC6B0\uC120\uC21C\uC704 \uC124\uC815
2. **\uBA54\uC2DC\uC9C0 \uC804\uB7B5**: \uC131\uACF5 \uBA54\uC2DC\uC9C0\uC758 \uD328\uD134\uC744 \uC7AC\uD604\uD558\uACE0, \uC2E4\uD328 \uBA54\uC2DC\uC9C0\uC758 \uD328\uD134\uC744 \uD68C\uD53C. \uD575\uC2EC \uBA54\uC2DC\uC9C0\uB294 15\uC790 \uC774\uB0B4\uB85C \uC555\uCD95 \uAC00\uB2A5\uD574\uC57C \uD568
3. **\uCF58\uD150\uCE20 \uC804\uB7B5**: \uD655\uC0B0\uB825 \uB192\uC740 \uCF58\uD150\uCE20 \uC720\uD615(\uB370\uC774\uD130 \uAE30\uBC18)\uC744 \uC6B0\uC120 \uC81C\uC791. \uD50C\uB7AB\uD3FC\uBCC4 \uCD5C\uC801 \uD3EC\uB9F7 \uC81C\uC548
4. **\uB9AC\uC2A4\uD06C \uB300\uC751**: \uC989\uAC01 \uB300\uC751(24\uC2DC\uAC04 \uB0B4), \uC608\uBC29\uC801 \uB300\uC751(1\uC8FC \uB0B4), \uBE44\uC0C1 \uACC4\uD68D(\uB9CC\uC57D\uC758 \uC0AC\uD0DC)\uC73C\uB85C 3\uB2E8\uACC4 \uAD6C\uBD84

## \uC804\uB7B5 \uD488\uC9C8 \uAE30\uC900
- \uBAA8\uB4E0 \uC804\uB7B5\uC740 "\uB204\uAC00, \uBB34\uC5C7\uC744, \uC5B8\uC81C\uAE4C\uC9C0, \uC5B4\uB5A4 \uCC44\uB110\uB85C" \uC218\uC900\uC758 \uAD6C\uCCB4\uC131\uC744 \uAC00\uC838\uC57C \uD568
- "\uC18C\uD1B5\uC744 \uAC15\uD654\uD55C\uB2E4", "\uC774\uBBF8\uC9C0\uB97C \uAC1C\uC120\uD55C\uB2E4" \uAC19\uC740 \uCD94\uC0C1\uC801 \uC81C\uC548 \uAE08\uC9C0
- \uB9AC\uC2A4\uD06C \uB300\uC751\uACFC \uAE30\uD68C \uD65C\uC6A9\uC774 \uC0C1\uCDA9\uD558\uB294 \uACBD\uC6B0, \uD2B8\uB808\uC774\uB4DC\uC624\uD504\uB97C \uBA85\uC2DC\uD558\uC138\uC694
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 15).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 20).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 15\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${commentsSample}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD604\uC7AC \uC0C1\uD669 \uC9C4\uB2E8
- \uC5EC\uB860\uC758 \uC804\uCCB4 \uBC29\uD5A5\uC131\uACFC \uD575\uC2EC \uB9AC\uC2A4\uD06C/\uAE30\uD68C\uB97C \uD55C \uBB38\uC7A5\uC73C\uB85C \uC815\uB9AC\uD558\uC138\uC694

### Step 2: \uD0C0\uAC9F \uC804\uB7B5 \uC218\uB9BD
- \uC8FC \uD0C0\uAC9F(primary)\uACFC \uBCF4\uC870 \uD0C0\uAC9F(secondary)\uC744 \uC120\uC815\uD558\uC138\uC694
- \uAC01 \uD0C0\uAC9F\uC5D0 \uB300\uD55C \uC811\uADFC \uBC29\uC2DD(approach)\uC744 \uAD6C\uCCB4\uC801\uC73C\uB85C \uAE30\uC220\uD558\uC138\uC694

### Step 3: \uBA54\uC2DC\uC9C0 \uC804\uB7B5 \uC218\uB9BD
- \uD575\uC2EC \uBA54\uC2DC\uC9C0(15\uC790 \uC774\uB0B4)\uC640 \uBCF4\uC870 \uBA54\uC2DC\uC9C0\uB97C \uC124\uACC4\uD558\uC138\uC694
- \uD1A4\uC564\uB9E4\uB108\uB97C \uC9C0\uC815\uD558\uC138\uC694 (\uC608: \uC9C4\uC815\uC131 \uC788\uB294 \uACF5\uAC10, \uB370\uC774\uD130 \uAE30\uBC18 \uC124\uB4DD, \uBE44\uC804 \uC81C\uC2DC \uB4F1)

### Step 4: \uCF58\uD150\uCE20\xB7\uB9AC\uC2A4\uD06C \uB300\uC751 \uC804\uB7B5
- \uCD94\uCC9C \uCF58\uD150\uCE20 \uD3EC\uB9F7, \uD575\uC2EC \uD1A0\uD53D, \uBC30\uD3EC \uCC44\uB110\uC744 \uAD6C\uCCB4\uC801\uC73C\uB85C \uC81C\uC548\uD558\uC138\uC694
- \uB9AC\uC2A4\uD06C \uB300\uC751\uC740 \uC989\uAC01/\uC608\uBC29/\uBE44\uC0C1 3\uB2E8\uACC4\uB85C \uAD6C\uBD84\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForStrategy(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D (Stage 1 + Stage 2)
${distilledContext}

\uC704 \uC120\uD589 \uBD84\uC11D\uC744 \uC885\uD569\uD558\uC5EC \uC804\uB7B5\uC744 \uB3C4\uCD9C\uD558\uC138\uC694:
- risk-map\uC758 \uB9AC\uC2A4\uD06C\uB97C \uBC29\uC5B4 \uC804\uB7B5\uC758 \uADFC\uAC70\uB85C \uD65C\uC6A9
- opportunity\uC758 \uAE0D\uC815 \uC790\uC0B0\uC744 \uACF5\uACA9 \uC804\uB7B5\uC758 \uAE30\uBC18\uC73C\uB85C \uD65C\uC6A9
- \uC131\uACF5/\uC2E4\uD328 \uBA54\uC2DC\uC9C0 \uD328\uD134\uC744 \uBA54\uC2DC\uC9C0 \uC804\uB7B5\uC5D0 \uC9C1\uC811 \uBC18\uC601
- \uC120\uD589 \uACB0\uACFC\uB97C \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9D0\uACE0, \uC804\uB7B5\uC801 \uD310\uB2E8\uACFC \uC2E4\uD589 \uACC4\uD68D\uC5D0 \uC9D1\uC911\uD558\uC138\uC694`;
  }
};
var FinalSummarySchema = z.object({
  oneLiner: z.string().min(1).describe("\uD604\uC7AC \uC0C1\uD0DC + \uC2B9\uBD80 \uD575\uC2EC \uD55C \uC904 \uC694\uC57D"),
  currentState: z.object({
    summary: z.string().min(1),
    sentiment: z.enum(["positive", "negative", "mixed"]),
    keyFactor: z.string().catch("")
  }).describe("\uD604\uC7AC \uC0C1\uD669 \uC694\uC57D"),
  criticalActions: z.array(
    z.object({
      priority: z.number().catch(0),
      action: z.string().catch(""),
      expectedImpact: z.string().catch(""),
      timeline: z.string().catch("")
    })
  ).default([]).describe("\uCD5C\uC6B0\uC120 \uC2E4\uD589 \uACFC\uC81C (\uCD5C\uB300 5\uAC1C)"),
  outlook: z.object({
    shortTerm: z.string().catch(""),
    mediumTerm: z.string().catch(""),
    keyVariable: z.string().catch("")
  }).catch({ shortTerm: "", mediumTerm: "", keyVariable: "" })
});

// src/modules/final-summary.ts
var config4 = MODULE_MODEL_MAP["final-summary"];
var finalSummaryModule = {
  name: "final-summary",
  displayName: "\uCD5C\uC885 \uC804\uB7B5 \uC694\uC57D",
  provider: config4.provider,
  model: config4.model,
  schema: FinalSummarySchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uC804\uB7B5 \uBE0C\uB9AC\uD551 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uBCF5\uC7A1\uD55C \uBD84\uC11D \uACB0\uACFC\uB97C **\uC758\uC0AC\uACB0\uC815\uC790\uAC00 3\uBD84 \uB0B4\uC5D0 \uD30C\uC545\uD558\uACE0 \uC989\uC2DC \uD589\uB3D9**\uD560 \uC218 \uC788\uB294 \uD615\uD0DC\uB85C \uC555\uCD95\uD569\uB2C8\uB2E4.

## oneLiner \uC791\uC131 \uADDC\uCE59
- \uD615\uC2DD: "[\uD604\uC7AC \uC0C1\uD0DC \uC9C4\uB2E8] -- [\uC2B9\uBD80 \uD575\uC2EC / \uB3CC\uD30C\uAD6C]"
- \uAE38\uC774: 30~50\uC790 (\uD55C \uC904\uC5D0 \uC77D\uD788\uB294 \uC218\uC900)
- \uC88B\uC740 \uC608: "\uC9C0\uC9C0\uC728 \uD558\uB77D\uC138 \uC18D MZ\uC138\uB300 \uC774\uD0C8\uC774 \uD575\uC2EC \uBCC0\uC218 -- \uAD50\uC721\uC815\uCC45 \uC5B4\uD544\uC774 \uB3CC\uD30C\uAD6C"
- \uC88B\uC740 \uC608: "\uCEE4\uBBA4\uB2C8\uD2F0 \uBC18\uBC1C \uD655\uC0B0 \uC911\uC774\uB098 40\uB300 \uC9C0\uC9C0 \uACAC\uACE0 -- \uACBD\uC81C \uC131\uACFC \uAC00\uC2DC\uD654\uAC00 \uAD00\uAC74"
- \uB098\uC05C \uC608: "\uC5EC\uB860\uC774 \uAE0D\uC815\uC801\uC774\uC9C0\uB9CC \uBD80\uC815\uC801\uC778 \uBA74\uB3C4 \uC788\uC2B5\uB2C8\uB2E4" (\uAD6C\uCCB4\uC131 \uBD80\uC871)
- \uB098\uC05C \uC608: "\uD604\uC7AC \uC0C1\uD669\uC740 \uBCF5\uC7A1\uD558\uBA70 \uB2E4\uC591\uD55C \uBCC0\uC218\uAC00 \uC788\uC2B5\uB2C8\uB2E4" (\uB0B4\uC6A9 \uC5C6\uC74C)

## criticalActions \uC791\uC131 \uADDC\uCE59
- \uAC01 action\uC740 "~\uD558\uB77C" \uD615\uD0DC\uC758 \uBA85\uB839\uBB38
- expectedImpact\uB294 \uCE21\uC815 \uAC00\uB2A5\uD55C \uACB0\uACFC (\uC608: "Swing \uC9D1\uB2E8 10%p \uC804\uD658 \uAE30\uB300")
- timeline\uC740 \uAD6C\uCCB4\uC801 (\uC608: "3\uC77C \uC774\uB0B4", "1\uC8FC \uB0B4", "2\uC8FC \uB0B4")
- \uCD94\uC0C1\uC801 \uC81C\uC548 \uAE08\uC9C0: "\uC18C\uD1B5 \uAC15\uD654" (X) \u2192 "\uC720\uD29C\uBE0C \uB77C\uC774\uBE0C Q&A \uC8FC 1\uD68C \uC2E4\uC2DC" (O)
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 10).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}
\uAE30\uC0AC \uC218: ${data.articles.length}\uAC74 | \uB313\uAE00 \uC218: ${data.comments.length}\uAC74 | \uC601\uC0C1 \uC218: ${data.videos.length}\uAC74

## \uC8FC\uC694 \uAE30\uC0AC (\uC0C1\uC704 10\uAC74)
${articlesSummary}

## \uC791\uC131 \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD575\uC2EC \uBC1C\uACAC \uCD94\uCD9C
- \uC804\uCCB4 \uBD84\uC11D\uC5D0\uC11C \uC758\uC0AC\uACB0\uC815\uC5D0 \uC601\uD5A5\uC744 \uBBF8\uCE58\uB294 \uD575\uC2EC \uBC1C\uACAC 3\uAC1C\uB97C \uC120\uBCC4\uD558\uC138\uC694

### Step 2: oneLiner \uC791\uC131
- \uD575\uC2EC \uBC1C\uACAC\uC744 \uC885\uD569\uD558\uC5EC "[\uD604\uC7AC \uC0C1\uD0DC] -- [\uC2B9\uBD80 \uD575\uC2EC]" \uD615\uC2DD\uC758 \uD55C \uC904 \uC694\uC57D\uC744 \uC791\uC131\uD558\uC138\uC694

### Step 3: \uC2E4\uD589 \uACFC\uC81C \uB3C4\uCD9C
- \uC989\uC2DC \uC2E4\uD589\uD574\uC57C \uD560 \uACFC\uC81C\uB97C \uC6B0\uC120\uC21C\uC704 \uC21C\uC73C\uB85C 3~5\uAC1C \uB3C4\uCD9C\uD558\uC138\uC694
- \uAC01 \uACFC\uC81C\uC758 \uAE30\uB300 \uD6A8\uACFC\uC640 \uC2E4\uD589 \uC2DC\uD55C\uC744 \uBA85\uC2DC\uD558\uC138\uC694

### Step 4: \uC804\uB9DD \uC815\uB9AC
- \uB2E8\uAE30(1~2\uC8FC)\uC640 \uC911\uAE30(1~3\uAC1C\uC6D4) \uC804\uB9DD\uC744 \uC791\uC131\uD558\uC138\uC694
- \uC804\uB9DD\uC758 \uD575\uC2EC \uBCC0\uC218(keyVariable)\uB97C \uBA85\uC2DC\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForFinalSummary(priorResults);
    return `${basePrompt}

## \uC804\uCCB4 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D (Stage 1 + Stage 2)
${distilledContext}

\uC704 \uBD84\uC11D \uACB0\uACFC\uB97C \uC885\uD569\uD558\uC5EC \uCD5C\uC885 \uC804\uB7B5 \uC694\uC57D\uC744 \uC791\uC131\uD558\uC138\uC694.
\uC120\uD589 \uBD84\uC11D \uB0B4\uC6A9\uC744 \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9D0\uACE0, \uC758\uC0AC\uACB0\uC815\uC790 \uAD00\uC810\uC5D0\uC11C \uC555\uCD95\xB7\uC7AC\uAD6C\uC131\uD558\uC138\uC694.`;
  }
};
var ApprovalRatingSchema = z.object({
  estimatedRange: z.object({
    min: z.number().describe("\uCD5C\uC18C \uC9C0\uC9C0\uC728 0~100"),
    max: z.number().describe("\uCD5C\uB300 \uC9C0\uC9C0\uC728 0~100")
  }).describe("AI \uCD94\uC815 \uC9C0\uC9C0\uC728 \uBC94\uC704 (%)"),
  confidence: z.enum(["high", "medium", "low"]).describe("\uC2E0\uB8B0\uB3C4"),
  methodology: z.object({
    sentimentRatio: z.object({
      positive: z.number().catch(0),
      neutral: z.number().catch(0),
      negative: z.number().catch(0)
    }).catch({ positive: 0, neutral: 0, negative: 0 }),
    platformBiasCorrection: z.array(
      z.object({
        platform: z.string().catch(""),
        biasDirection: z.enum(["left", "right", "neutral"]).catch("neutral"),
        correctionFactor: z.number().catch(1)
      })
    ).default([]),
    spreadFactor: z.number().catch(1).describe("\uD655\uC0B0\uB825 \uAC00\uC911\uCE58")
  }).catch({
    sentimentRatio: { positive: 0, neutral: 0, negative: 0 },
    platformBiasCorrection: [],
    spreadFactor: 1
  }),
  disclaimer: z.string().catch("AI \uCD94\uC815\uCE58\uB85C \uC2E4\uC81C \uC9C0\uC9C0\uC728\uACFC \uCC28\uC774\uAC00 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.").describe("\uBA74\uCC45 \uBB38\uAD6C -- \uBC18\uB4DC\uC2DC \uD3EC\uD568"),
  reasoning: z.string().catch("")
});

// src/modules/approval-rating.ts
var config5 = MODULE_MODEL_MAP["approval-rating"];
var approvalRatingModule = {
  name: "approval-rating",
  displayName: "AI \uC9C0\uC9C0\uC728 \uCD94\uC815",
  provider: config5.provider,
  model: config5.model,
  schema: ApprovalRatingSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC628\uB77C\uC778 \uC5EC\uB860 \uB370\uC774\uD130 \uAE30\uBC18 \uC9C0\uC9C0\uC728 \uCD94\uC815 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uB313\uAE00\xB7\uAE30\uC0AC\xB7\uC601\uC0C1 \uB370\uC774\uD130\uC5D0\uC11C **\uD50C\uB7AB\uD3FC\uBCC4 \uD3B8\uD5A5\uC744 \uBCF4\uC815\uD558\uC5EC** AI \uAE30\uBC18 \uC9C0\uC9C0\uC728 \uBC94\uC704\uB97C \uCD94\uC815\uD569\uB2C8\uB2E4.

## \uD575\uC2EC \uC6D0\uCE59
1. **\uBC18\uB4DC\uC2DC \uBC94\uC704(min~max)**\uB85C \uD45C\uD604. \uB2E8\uC77C \uC218\uCE58 \uC808\uB300 \uAE08\uC9C0
2. \uC628\uB77C\uC778 \uC5EC\uB860\uC740 \uC2E4\uC81C \uC5EC\uB860\uC758 **\uC77C\uBD80 \uD45C\uBCF8**\uC784\uC744 \uC778\uC9C0. \uACFC\uB300 \uD574\uC11D \uAE08\uC9C0
3. \uBA74\uCC45 \uBB38\uAD6C \uD544\uC218: "\uC774 \uCD94\uC815\uCE58\uB294 AI \uBD84\uC11D \uAE30\uBC18 \uCC38\uACE0\uC6A9\uC774\uBA70, \uACFC\uD559\uC801 \uC5EC\uB860\uC870\uC0AC\uB97C \uB300\uCCB4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"

## \uD50C\uB7AB\uD3FC\uBCC4 \uD3B8\uD5A5 \uBCF4\uC815 \uAC00\uC774\uB4DC\uB77C\uC778
| \uD50C\uB7AB\uD3FC | \uD3B8\uD5A5 \uBC29\uD5A5 | \uBCF4\uC815 \uBC29\uBC95 |
|--------|----------|----------|
| \uB124\uC774\uBC84 \uB274\uC2A4 \uB313\uAE00 | \uBCF4\uC218 \uC6B0\uC138 (40~60\uB300 \uACFC\uB300\uD45C) | \uBD80\uC815 \uBE44\uC728\uC744 0.7~0.85\uBC30\uB85C \uBCF4\uC815 |
| \uC720\uD29C\uBE0C \uB313\uAE00 | \uCC44\uB110\uBCC4 \uADF9\uC2EC | \uCC44\uB110 \uC131\uD5A5\uBCC4 \uAC00\uC911\uCE58 \uCC28\uB4F1 \uC801\uC6A9 |
| DC\uC778\uC0AC\uC774\uB4DC | \uC774\uC288\uBCC4 \uC0C1\uC774 | \uD48D\uC790\xB7\uBE44\uAF3C \uD45C\uD604\uC744 \uAC10\uC815 \uBD84\uB958 \uC2DC \uC8FC\uC758 |
| \uD074\uB9AC\uC559 | \uC9C4\uBCF4 \uC6B0\uC138 | \uAE0D\uC815 \uBE44\uC728\uC744 0.8~0.9\uBC30\uB85C \uBCF4\uC815 |
| FM\uCF54\uB9AC\uC544 | \uB2E4\uC591 | \uC720\uBA38 \uB9E5\uB77D \uACE0\uB824, \uAC10\uC815 \uBD84\uB958 \uC8FC\uC758 |

## confidence \uD310\uB2E8 \uAE30\uC900
- **high**: \uD50C\uB7AB\uD3FC 3\uAC1C \uC774\uC0C1, \uB313\uAE00 100\uAC74 \uC774\uC0C1, \uAC10\uC815 \uBD84\uD3EC \uC77C\uAD00
- **medium**: \uD50C\uB7AB\uD3FC 2\uAC1C, \uB313\uAE00 50~100\uAC74, \uB610\uB294 \uD50C\uB7AB\uD3FC \uAC04 \uAC10\uC815 \uD3B8\uCC28 \uC874\uC7AC
- **low**: \uB2E8\uC77C \uD50C\uB7AB\uD3FC, \uB313\uAE00 50\uAC74 \uBBF8\uB9CC, \uB610\uB294 \uD50C\uB7AB\uD3FC \uAC04 \uAC10\uC815 \uADF9\uB2E8\uC801 \uBD88\uC77C\uCE58
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 20).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 30).map((c) => `- [${c.source}] ${c.content.slice(0, 100)}`).join("\n");
    const platformDist = {};
    for (const c of data.comments) {
      platformDist[c.source] = (platformDist[c.source] ?? 0) + 1;
    }
    const platformSummary = Object.entries(platformDist).map(([src, cnt]) => `${src}: ${cnt}\uAC74`).join(", ");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 30\uAC74)
${commentsSample}

## \uD50C\uB7AB\uD3FC\uBCC4 \uB370\uC774\uD130 \uBD84\uD3EC
${platformSummary}

## \uCD94\uC815 \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD50C\uB7AB\uD3FC\uBCC4 \uC6D0\uC2DC \uAC10\uC815 \uBE44\uC728 \uC0B0\uCD9C
- \uAC01 \uD50C\uB7AB\uD3FC\uC758 \uB313\uAE00\uC5D0\uC11C \uAE0D\uC815/\uC911\uB9BD/\uBD80\uC815 \uBE44\uC728\uC744 \uC0B0\uCD9C\uD558\uC138\uC694

### Step 2: \uD3B8\uD5A5 \uBCF4\uC815
- \uC704 \uC2DC\uC2A4\uD15C \uD504\uB86C\uD504\uD2B8\uC758 \uD3B8\uD5A5 \uBCF4\uC815 \uAC00\uC774\uB4DC\uB77C\uC778\uC5D0 \uB530\uB77C \uAC01 \uD50C\uB7AB\uD3FC\uC758 \uBE44\uC728\uC744 \uBCF4\uC815\uD558\uC138\uC694
- \uBCF4\uC815 \uC804\uD6C4 \uC218\uCE58\uB97C \uBAA8\uB450 methodology\uC5D0 \uAE30\uB85D\uD558\uC138\uC694

### Step 3: \uAC00\uC911 \uD1B5\uD569
- \uD50C\uB7AB\uD3FC\uBCC4 \uB313\uAE00 \uC218\uB97C \uAC00\uC911\uCE58\uB85C \uD558\uC5EC \uC804\uCCB4 \uAC10\uC815 \uBE44\uC728\uC744 \uD1B5\uD569\uD558\uC138\uC694
- spreadFactor(\uD655\uC0B0 \uACC4\uC218)\uB97C \uBC18\uC601\uD558\uC138\uC694

### Step 4: \uBC94\uC704 \uC0B0\uCD9C
- \uBCF4\uC815\uB41C \uAE0D\uC815 \uBE44\uC728\uC744 \uAE30\uBC18\uC73C\uB85C \uCD94\uC815 \uBC94\uC704(min~max)\uB97C \uC0B0\uCD9C\uD558\uC138\uC694
- confidence \uC218\uC900\uC5D0 \uB530\uB77C \uBC94\uC704 \uD3ED\uC744 \uC870\uC815\uD558\uC138\uC694 (high=\xB13%p, medium=\xB15%p, low=\xB18%p)
- \uBA74\uCC45 \uBB38\uAD6C\uB97C \uBC18\uB4DC\uC2DC \uD3EC\uD568\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForApprovalRating(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D
${distilledContext}

\uC704 \uC120\uD589 \uBD84\uC11D\uC758 \uAC10\uC815 \uBE44\uC728\uACFC \uC9D1\uB2E8\uBCC4 \uBC18\uC751\uC744 \uBCF4\uC815 \uC694\uC778\uC73C\uB85C \uD65C\uC6A9\uD558\uC138\uC694.
\uC120\uD589 \uACB0\uACFC\uB97C \uADF8\uB300\uB85C \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9D0\uACE0, \uC9C0\uC9C0\uC728 \uCD94\uC815\uC758 \uADFC\uAC70\uB85C\uB9CC \uD65C\uC6A9\uD558\uC138\uC694.`;
  }
};
var FrameWarSchema = z.object({
  dominantFrames: z.array(
    z.object({
      name: z.string().catch(""),
      description: z.string().catch(""),
      strength: z.number().catch(0).describe("\uAC15\uB3C4 0~100"),
      supportingEvidence: z.array(z.string()).default([])
    })
  ).default([]).describe("\uC9C0\uBC30\uC801 \uD504\uB808\uC784 TOP 5 (\uCD5C\uB300 5\uAC1C)"),
  threateningFrames: z.array(
    z.object({
      name: z.string().catch(""),
      description: z.string().catch(""),
      threatLevel: z.enum(["critical", "high", "medium", "low"]).catch("medium"),
      counterStrategy: z.string().catch("")
    })
  ).default([]).describe("\uC704\uD611 \uD504\uB808\uC784 (\uCD5C\uB300 5\uAC1C)"),
  reversibleFrames: z.array(
    z.object({
      name: z.string().catch(""),
      currentPerception: z.string().catch(""),
      potentialShift: z.string().catch(""),
      requiredAction: z.string().catch("")
    })
  ).default([]).describe("\uBC18\uC804 \uAC00\uB2A5 \uD504\uB808\uC784 (\uCD5C\uB300 3\uAC1C)"),
  battlefieldSummary: z.string().min(1).describe("\uD504\uB808\uC784 \uC804\uC7C1 \uC694\uC57D")
});

// src/modules/frame-war.ts
var config6 = MODULE_MODEL_MAP["frame-war"];
var frameWarModule = {
  name: "frame-war",
  displayName: "\uD504\uB808\uC784 \uC804\uC7C1 \uBD84\uC11D",
  provider: config6.provider,
  model: config6.model,
  schema: FrameWarSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uBBF8\uB514\uC5B4 \uD504\uB808\uC784 \uC804\uC7C1(frame war) \uBC0F \uB2F4\uB860 \uC5ED\uD559 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC120\uD589 \uBD84\uC11D(sentiment-framing)\uC5D0\uC11C \uC2DD\uBCC4\uB41C \uD504\uB808\uC784\uC744 \uCD9C\uBC1C\uC810\uC73C\uB85C, **\uD504\uB808\uC784 \uAC04 \uC138\uB825 \uC5ED\uD559\uACFC \uC804\uB7B5\uC801 \uC804\uC7A5 \uAD6C\uC870**\uB97C \uC2EC\uCE35 \uBD84\uC11D\uD569\uB2C8\uB2E4.

## \uD575\uC2EC \uC6D0\uCE59 \u2014 sentiment-framing\uACFC\uC758 \uCC28\uBCC4\uD654
- sentiment-framing\uC774 "\uC5B4\uB5A4 \uD504\uB808\uC784\uC774 \uC788\uB294\uAC00"\uB97C \uC2DD\uBCC4\uD588\uB2E4\uBA74, \uC774 \uBAA8\uB4C8\uC740 "\uD504\uB808\uC784 \uAC04 \uD798\uC758 \uAD00\uACC4"\uB97C \uBD84\uC11D\uD569\uB2C8\uB2E4
- sentiment-framing\uC5D0\uC11C \uC774\uBBF8 \uC2DD\uBCC4\uD55C \uD504\uB808\uC784 \uBAA9\uB85D\uC744 \uADF8\uB300\uB85C \uBC18\uBCF5\uD558\uC9C0 \uB9C8\uC138\uC694
- \uB300\uC2E0 \uB2E4\uC74C\uC744 \uCD94\uAC00\uB85C \uBD84\uC11D\uD558\uC138\uC694:
  1. **\uC138\uB825 \uC5ED\uD559**: \uC5B4\uB5A4 \uD504\uB808\uC784\uC774 \uB2E4\uB978 \uD504\uB808\uC784\uC744 \uC57D\uD654/\uAC15\uD654\uC2DC\uD0A4\uB294\uAC00
  2. **\uC2DC\uAC04 \uCD94\uC774**: \uD504\uB808\uC784 \uAC15\uB3C4\uAC00 \uC0C1\uC2B9/\uD558\uB77D \uC911\uC778\uAC00
  3. **\uD50C\uB7AB\uD3FC \uACA9\uCC28**: \uAC19\uC740 \uD504\uB808\uC784\uC774 \uD50C\uB7AB\uD3FC\uBCC4\uB85C \uB2E4\uB978 \uAC15\uB3C4\uB97C \uAC16\uB294\uAC00
  4. **\uBC18\uC804 \uAC00\uB2A5\uC131**: \uC57D\uC138 \uD504\uB808\uC784\uC774 \uD2B9\uC815 \uC774\uBCA4\uD2B8\uB85C \uC6B0\uC138\uB85C \uC804\uD658\uB420 \uC870\uAC74

## \uD504\uB808\uC784 3\uBD84\uB958
- **\uC9C0\uBC30\uC801(dominant)**: \uD604\uC7AC \uC5EC\uB860\uC744 \uC8FC\uB3C4. \uB2E4\uC218\uAC00 \uC774 \uAD00\uC810\uC73C\uB85C \uC774\uC57C\uAE30\uD568
- **\uC704\uD611\uC801(threatening)**: \uC9C0\uBC30 \uD504\uB808\uC784\uC5D0 \uB3C4\uC804 \uC911. \uD655\uC0B0 \uC2DC \uC5EC\uB860 \uD310\uB3C4 \uBCC0\uACBD \uAC00\uB2A5
- **\uBC18\uC804 \uAC00\uB2A5(reversible)**: \uD604\uC7AC \uC57D\uC138\uC774\uB098, \uD2B9\uC815 \uC870\uAC74 \uCDA9\uC871 \uC2DC \uAE09\uBC18\uC804 \uAC00\uB2A5

${FRAME_STRENGTH_ANCHOR}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 20).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 30).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 30\uAC74)
${commentsSample}

## \uBD84\uC11D \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD504\uB808\uC784 \uC138\uB825 \uC9C0\uB3C4 \uAD6C\uC131
- \uB370\uC774\uD130\uC5D0\uC11C \uC791\uB3D9 \uC911\uC778 \uD504\uB808\uC784\uC744 \uC2DD\uBCC4\uD558\uACE0, \uAC01 \uD504\uB808\uC784\uC758 \uAC15\uB3C4(0~100)\uB97C \uC575\uCEE4 \uAE30\uC900\uC5D0 \uB530\uB77C \uD3C9\uAC00\uD558\uC138\uC694

### Step 2: \uC138\uB825 \uC5ED\uD559 \uBD84\uC11D
- \uD504\uB808\uC784 \uAC04 \uC0C1\uD638 \uC791\uC6A9\uC744 \uBD84\uC11D\uD558\uC138\uC694 (\uAC15\uD654 \uAD00\uACC4, \uC57D\uD654 \uAD00\uACC4, \uB3C5\uB9BD \uAD00\uACC4)
- \uC5B4\uB5A4 \uD504\uB808\uC784\uC774 \uC5B4\uB5A4 \uD504\uB808\uC784\uC744 \uBC00\uC5B4\uB0B4\uACE0 \uC788\uB294\uC9C0 \uAE30\uC220\uD558\uC138\uC694

### Step 3: \uC704\uD611 \uD504\uB808\uC784 \uC2DD\uBCC4
- \uD604\uC7AC \uC9C0\uBC30 \uD504\uB808\uC784\uC744 \uC704\uD611\uD558\uB294 \uB3C4\uC804 \uD504\uB808\uC784\uC744 \uC2DD\uBCC4\uD558\uC138\uC694
- \uAC01 \uC704\uD611 \uD504\uB808\uC784\uC758 \uC704\uD611 \uC218\uC900\uACFC \uAD6C\uCCB4\uC801 \uB300\uC751 \uC804\uB7B5\uC744 \uC81C\uC2DC\uD558\uC138\uC694

### Step 4: \uBC18\uC804 \uAE30\uD68C \uD0D0\uC0C9
- \uD604\uC7AC \uC57D\uC138\uC774\uB098 \uC7A0\uC7AC\uC801 \uBC18\uC804\uC774 \uAC00\uB2A5\uD55C \uD504\uB808\uC784\uC744 \uC2DD\uBCC4\uD558\uC138\uC694 (\uCD5C\uB300 3\uAC1C)
- \uBC18\uC804\uC744 \uC704\uD55C \uD544\uC694 \uC870\uAC74\uACFC \uD589\uB3D9\uC744 \uAD6C\uCCB4\uC801\uC73C\uB85C \uC81C\uC2DC\uD558\uC138\uC694

### Step 5: \uC804\uC7A5 \uC885\uD569
- battlefieldSummary\uC5D0 \uD504\uB808\uC784 \uC804\uC7A5\uC758 \uC804\uCCB4 \uAD6C\uB3C4\uB97C 3~5\uC904\uB85C \uC694\uC57D\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForFrameWar(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D
${distilledContext}

**\uC911\uC694**: sentiment-framing\uC5D0\uC11C \uC774\uBBF8 \uC2DD\uBCC4\uD55C \uD504\uB808\uC784 \uBAA9\uB85D\uC744 \uADF8\uB300\uB85C \uBC18\uBCF5\uD558\uC9C0 \uB9C8\uC138\uC694.
\uB300\uC2E0 \uD504\uB808\uC784 \uAC04 **\uC138\uB825 \uC5ED\uD559, \uC2DC\uAC04 \uCD94\uC774, \uD50C\uB7AB\uD3FC \uACA9\uCC28, \uBC18\uC804 \uAC00\uB2A5\uC131**\uC744 \uC2EC\uCE35 \uBD84\uC11D\uD558\uC138\uC694.
\uC131\uACF5/\uC2E4\uD328 \uBA54\uC2DC\uC9C0\uAC00 \uC5B4\uB5A4 \uD504\uB808\uC784\uC744 \uAC15\uD654/\uC57D\uD654\uD588\uB294\uC9C0\uB3C4 \uBD84\uC11D\uD558\uC138\uC694.`;
  }
};
var scenarioBase = {
  name: z.string().catch(""),
  probability: z.number().catch(0).describe("\uBC1C\uC0DD \uD655\uB960 0~100"),
  triggerConditions: z.array(z.string()).default([]),
  expectedOutcome: z.string().catch(""),
  responseStrategy: z.array(z.string()).default([]),
  timeframe: z.string().catch("")
};
var scenarioSchema = z.object({
  type: z.enum(["spread", "control", "reverse"]).catch("control"),
  ...scenarioBase
});
var CrisisScenarioSchema = z.object({
  scenarios: z.array(scenarioSchema).default([]).describe("\uC815\uD655\uD788 3\uAC1C \uC2DC\uB098\uB9AC\uC624: spread, control, reverse"),
  currentRiskLevel: z.enum(["critical", "high", "medium", "low"]).describe("\uD604\uC7AC \uC704\uAE30 \uC218\uC900"),
  recommendedAction: z.string().catch("")
});

// src/modules/crisis-scenario.ts
var config7 = MODULE_MODEL_MAP["crisis-scenario"];
var crisisScenarioModule = {
  name: "crisis-scenario",
  displayName: "\uC704\uAE30 \uB300\uC751 \uC2DC\uB098\uB9AC\uC624",
  provider: config7.provider,
  model: config7.model,
  schema: CrisisScenarioSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC815\uCE58 \uC704\uAE30 \uAD00\uB9AC \uBC0F \uC2DC\uB098\uB9AC\uC624 \uD50C\uB798\uB2DD \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uB9AC\uC2A4\uD06C \uBD84\uC11D\uACFC \uC9C0\uC9C0\uC728 \uCD94\uC815\uC744 \uAE30\uBC18\uC73C\uB85C **3\uAC00\uC9C0 \uC2DC\uB098\uB9AC\uC624(\uD655\uC0B0/\uD1B5\uC81C/\uC5ED\uC804)**\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uC2DC\uBBAC\uB808\uC774\uC158\uD569\uB2C8\uB2E4.

## \uC2DC\uB098\uB9AC\uC624 \uC720\uD615 (\uC815\uD655\uD788 3\uAC1C, \uC21C\uC11C \uACE0\uC815)

1. **spread** (\uD655\uC0B0 - worst case): \uD604\uC7AC \uB9AC\uC2A4\uD06C\uAC00 \uD1B5\uC81C \uBD88\uB2A5\uC73C\uB85C \uD655\uB300\uB418\uB294 \uC2DC\uB098\uB9AC\uC624
2. **control** (\uD1B5\uC81C - moderate case): \uB9AC\uC2A4\uD06C\uB97C \uD604 \uC218\uC900\uC5D0\uC11C \uBD09\uC1C4\xB7\uAD00\uB9AC\uD558\uB294 \uC2DC\uB098\uB9AC\uC624
3. **reverse** (\uC5ED\uC804 - best case): \uC704\uAE30\uB97C \uAE30\uD68C\uB85C \uC804\uD658\uD558\uC5EC \uC5EC\uB860 \uBC18\uC804\uC5D0 \uC131\uACF5\uD558\uB294 \uC2DC\uB098\uB9AC\uC624

## \uD575\uC2EC \uC6D0\uCE59 \u2014 risk-map\uACFC\uC758 \uCC28\uBCC4\uD654
- risk-map\uC5D0\uC11C \uC774\uBBF8 \uC2DD\uBCC4\uD55C \uB9AC\uC2A4\uD06C \uBAA9\uB85D\uC744 \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9C8\uC138\uC694
- \uB300\uC2E0 "\uB9AC\uC2A4\uD06C\uAC00 \uD604\uC2E4\uD654\uB418\uBA74 \uC5B4\uB5A4 \uACBD\uB85C\uB85C \uC804\uAC1C\uB418\uB294\uAC00"\uB97C \uC2DC\uB098\uB9AC\uC624\uB85C \uC804\uAC1C\uD558\uC138\uC694
- \uAC01 \uC2DC\uB098\uB9AC\uC624\uC758 \uD2B8\uB9AC\uAC70 \u2192 \uC804\uAC1C \uACBD\uB85C \u2192 \uACB0\uACFC\uB97C \uC778\uACFC\uC801\uC73C\uB85C \uC11C\uC220\uD558\uC138\uC694

## \uC2DC\uB098\uB9AC\uC624 \uD488\uC9C8 \uAE30\uC900
- triggerConditions: \uAD6C\uCCB4\uC801 \uC774\uBCA4\uD2B8 (\uC608: "\uC8FC\uC694 \uC5B8\uB860 1\uBA74 \uBCF4\uB3C4", "\uC57C\uB2F9 \uAD6D\uC815\uC870\uC0AC \uC694\uAD6C" \uB4F1)
- expectedOutcome: \uC815\uB7C9\uC801 \uACB0\uACFC \uD3EC\uD568 (\uC608: "\uC9C0\uC9C0\uC728 3~5%p \uD558\uB77D", "Swing \uC9D1\uB2E8 \uC774\uD0C8 \uAC00\uC18D")
- responseStrategy: "\uB204\uAC00, \uBB34\uC5C7\uC744, \uC5B8\uC81C\uAE4C\uC9C0" \uC218\uC900\uC758 \uC2E4\uD589 \uACC4\uD68D
- timeframe: \uAD6C\uCCB4\uC801 \uAE30\uAC04 (\uC608: "48\uC2DC\uAC04 \uB0B4", "1\uC8FC", "2~4\uC8FC")

${PROBABILITY_ANCHOR}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 15).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 20).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 15\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${commentsSample}

## \uC2DC\uB098\uB9AC\uC624 \uAD6C\uC131 \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uD604\uC7AC \uC704\uAE30 \uC218\uC900 \uC9C4\uB2E8
- \uD604\uC7AC \uC0C1\uD669\uC774 \uC704\uAE30\uC758 \uC5B4\uB290 \uB2E8\uACC4\uC5D0 \uC788\uB294\uC9C0 \uD310\uB2E8\uD558\uC138\uC694 (\uC7A0\uBCF5\uAE30/\uBC1C\uD654\uAE30/\uD655\uC0B0\uAE30/\uC218\uC2B5\uAE30)

### Step 2: Spread \uC2DC\uB098\uB9AC\uC624 (worst case)
- \uAC00\uC7A5 \uC704\uD5D8\uD55C \uB9AC\uC2A4\uD06C\uAC00 \uD604\uC2E4\uD654\uB418\uBA74 \uC5B4\uB5A4 \uACBD\uB85C\uB85C \uD655\uC0B0\uB418\uB294\uC9C0 \uC2DC\uBBAC\uB808\uC774\uC158\uD558\uC138\uC694
- \uD2B8\uB9AC\uAC70 \u2192 \uBBF8\uB514\uC5B4 \uBC18\uC751 \u2192 \uC5EC\uB860 \uBCC0\uD654 \u2192 \uACB0\uACFC\uC758 \uC778\uACFC \uCCB4\uC778\uC744 \uAE30\uC220\uD558\uC138\uC694

### Step 3: Control \uC2DC\uB098\uB9AC\uC624 (moderate case)
- \uC801\uC808\uD55C \uB300\uC751\uC73C\uB85C \uB9AC\uC2A4\uD06C\uB97C \uD604 \uC218\uC900\uC5D0\uC11C \uBD09\uC1C4\uD558\uB294 \uACBD\uB85C\uB97C \uC2DC\uBBAC\uB808\uC774\uC158\uD558\uC138\uC694
- \uC5B4\uB5A4 \uB300\uC751\uC774 \uD544\uC694\uD558\uACE0, \uADF8 \uACB0\uACFC \uC5B4\uB5A4 \uC0C1\uD0DC\uAC00 \uB418\uB294\uC9C0 \uAE30\uC220\uD558\uC138\uC694

### Step 4: Reverse \uC2DC\uB098\uB9AC\uC624 (best case)
- \uC704\uAE30\uB97C \uAE30\uD68C\uB85C \uC804\uD658\uD558\uC5EC \uC5EC\uB860\uC744 \uBC18\uC804\uC2DC\uD0A4\uB294 \uACBD\uB85C\uB97C \uC2DC\uBBAC\uB808\uC774\uC158\uD558\uC138\uC694
- \uBC18\uC804\uC744 \uC704\uD55C \uAD6C\uCCB4\uC801 \uC870\uAC74\uACFC \uD589\uB3D9\uC744 \uAE30\uC220\uD558\uC138\uC694

### Step 5: \uC885\uD569 \uAD8C\uC7A5 \uC870\uCE58
- 3\uAC1C \uC2DC\uB098\uB9AC\uC624\uB97C \uC885\uD569\uD558\uC5EC \uD604\uC7AC \uAC00\uC7A5 \uC801\uD569\uD55C \uB300\uC751 \uBC29\uD5A5\uC744 \uC81C\uC2DC\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForCrisisScenario(priorResults);
    return `${basePrompt}

## \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D
${distilledContext}

**\uC911\uC694**: risk-map\uC758 \uB9AC\uC2A4\uD06C \uBAA9\uB85D\uC744 \uC7AC\uAE30\uC220\uD558\uC9C0 \uB9C8\uC138\uC694.
\uB9AC\uC2A4\uD06C\uAC00 "\uD604\uC2E4\uD654\uB418\uBA74 \uC5B4\uB5BB\uAC8C \uC804\uAC1C\uB418\uB294\uAC00"\uB97C \uC2DC\uB098\uB9AC\uC624\uB85C \uC804\uAC1C\uD558\uC138\uC694.
approval-rating\uC758 \uC9C0\uC9C0\uC728 \uBC94\uC704\uB97C \uAE30\uBC18\uC120\uC73C\uB85C \uC0BC\uC544, \uAC01 \uC2DC\uB098\uB9AC\uC624\uBCC4 \uBCC0\uB3D9\uC744 \uC608\uCE21\uD558\uC138\uC694.`;
  }
};
var WinSimulationSchema = z.object({
  winProbability: z.number().describe("\uC2B9\uB9AC \uD655\uB960 0~100"),
  confidenceLevel: z.enum(["high", "medium", "low"]).describe("\uC2E0\uB8B0\uB3C4"),
  winConditions: z.array(
    z.object({
      condition: z.string().catch(""),
      currentStatus: z.enum(["met", "partial", "unmet"]).catch("unmet"),
      importance: z.enum(["critical", "high", "medium"]).catch("medium")
    })
  ).default([]).describe("\uC2B9\uB9AC \uC870\uAC74 3~7\uAC1C"),
  loseConditions: z.array(
    z.object({
      condition: z.string().catch(""),
      currentRisk: z.enum(["high", "medium", "low"]).catch("medium"),
      mitigation: z.string().catch("")
    })
  ).default([]).describe("\uD328\uBC30 \uC870\uAC74 2~5\uAC1C"),
  keyStrategies: z.array(
    z.object({
      strategy: z.string().catch(""),
      expectedImpact: z.string().catch(""),
      priority: z.number().catch(0)
    })
  ).default([]).describe("\uD575\uC2EC \uC804\uB7B5 3~5\uAC1C"),
  simulationSummary: z.string().min(1).describe("\uC2DC\uBBAC\uB808\uC774\uC158 \uC885\uD569 \uC694\uC57D")
});

// src/modules/win-simulation.ts
var config8 = MODULE_MODEL_MAP["win-simulation"];
var winSimulationModule = {
  name: "win-simulation",
  displayName: "\uC2B9\uB9AC \uD655\uB960 \uC2DC\uBBAC\uB808\uC774\uC158",
  provider: config8.provider,
  model: config8.model,
  schema: WinSimulationSchema,
  buildSystemPrompt() {
    return `\uB2F9\uC2E0\uC740 \uC120\uAC70/\uC5EC\uB860 \uC804\uB7B5 \uC2DC\uBBAC\uB808\uC774\uC158 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
11\uAC1C \uC120\uD589 \uBD84\uC11D \uACB0\uACFC\uB97C \uC885\uD569\uD558\uC5EC **\uC2B9\uB9AC \uD655\uB960, \uC2B9\uD328 \uC870\uAC74, \uD575\uC2EC \uC804\uB7B5**\uC744 \uB3C4\uCD9C\uD569\uB2C8\uB2E4.

## \uC2DC\uBBAC\uB808\uC774\uC158 \uD504\uB808\uC784\uC6CC\uD06C

### winProbability \uC0B0\uCD9C \uADFC\uAC70
- approval-rating\uC758 \uC9C0\uC9C0\uC728 \uBC94\uC704\uB97C \uAE30\uBC18\uC120\uC73C\uB85C \uC0AC\uC6A9
- \uB9AC\uC2A4\uD06C(risk-map) \uD604\uC2E4\uD654 \uAC00\uB2A5\uC131\uC744 \uAC10\uC810 \uC694\uC778\uC73C\uB85C \uBC18\uC601
- \uAE30\uD68C(opportunity) \uD65C\uC6A9 \uAC00\uB2A5\uC131\uC744 \uAC00\uC810 \uC694\uC778\uC73C\uB85C \uBC18\uC601
- \uD504\uB808\uC784 \uC804\uC7C1(frame-war)\uC5D0\uC11C \uC6B0\uC138/\uC5F4\uC138\uB97C \uBC18\uC601
- \uC704\uAE30 \uC2DC\uB098\uB9AC\uC624(crisis-scenario)\uC758 \uD655\uC0B0 \uD655\uB960\uC744 \uB9AC\uC2A4\uD06C \uAC00\uC911\uCE58\uB85C \uBC18\uC601

### \uC2B9\uB9AC \uC870\uAC74 \uB3C4\uCD9C \uADDC\uCE59
- \uAC01 \uC870\uAC74\uC758 currentStatus\uB294 \uB370\uC774\uD130 \uADFC\uAC70\uB97C \uAE30\uBC18\uC73C\uB85C \uD310\uB2E8
  - met: \uC774\uBBF8 \uCDA9\uC871\uB41C \uC870\uAC74 (\uB370\uC774\uD130\uC5D0\uC11C \uD655\uC778 \uAC00\uB2A5)
  - partial: \uBD80\uBD84\uC801\uC73C\uB85C \uCDA9\uC871 (\uC77C\uBD80 \uD50C\uB7AB\uD3FC/\uC9D1\uB2E8\uC5D0\uC11C\uB9CC)
  - unmet: \uC544\uC9C1 \uBBF8\uCDA9\uC871 (\uD5A5\uD6C4 \uCDA9\uC871\uD574\uC57C \uD568)
- importance\uB294 "\uC774 \uC870\uAC74\uC774 \uBBF8\uCDA9\uC871\uB418\uBA74 \uC2B9\uB9AC\uAC00 \uBD88\uAC00\uB2A5\uD55C\uAC00?"\uB85C \uD310\uB2E8

### \uD328\uBC30 \uC870\uAC74 \uB3C4\uCD9C \uADDC\uCE59
- \uAC01 \uC870\uAC74\uC758 currentRisk\uB294 crisis-scenario\uC758 \uC2DC\uB098\uB9AC\uC624 \uD655\uB960\uACFC \uC5F0\uB3D9
- mitigation\uC740 strategy\uC758 \uB9AC\uC2A4\uD06C \uB300\uC751\uACFC \uC5F0\uACC4\uD558\uB418, \uC0C8\uB85C\uC6B4 \uAD00\uC810\uC744 \uCD94\uAC00

### \uD575\uC2EC \uC804\uB7B5 \uB3C4\uCD9C \uADDC\uCE59
- strategy\uC758 \uAE30\uC874 \uC804\uB7B5\uC744 \uADF8\uB300\uB85C \uBC18\uBCF5\uD558\uC9C0 \uB9D0\uACE0, \uC2DC\uBBAC\uB808\uC774\uC158 \uACB0\uACFC\uB97C \uBC18\uC601\uD558\uC5EC \uC6B0\uC120\uC21C\uC704\uB97C \uC7AC\uBC30\uCE58
- expectedImpact\uB294 \uC815\uB7C9\uC801 \uD45C\uD604 (\uC608: "Swing 5%p \uC804\uD658", "\uC9C0\uC9C0\uC728 2~3%p \uC0C1\uC2B9 \uAE30\uB300")

${PROBABILITY_ANCHOR}
${ANALYSIS_CONSTRAINTS}`;
  },
  buildPrompt(data) {
    const articlesSummary = data.articles.slice(0, 15).map((a) => `- [${a.publisher ?? "\uC54C \uC218 \uC5C6\uC74C"}] ${a.title}`).join("\n");
    const commentsSample = data.comments.slice(0, 20).map((c) => `- ${c.content.slice(0, 100)}`).join("\n");
    return `\uD0A4\uC6CC\uB4DC: "${data.keyword}"
\uBD84\uC11D \uAE30\uAC04: ${data.dateRange.start.toISOString().split("T")[0]} ~ ${data.dateRange.end.toISOString().split("T")[0]}

## \uC8FC\uC694 \uAE30\uC0AC (${data.articles.length}\uAC74 \uC911 \uC0C1\uC704 15\uAC74)
${articlesSummary}

## \uB300\uD45C \uB313\uAE00 (${data.comments.length}\uAC74 \uC911 \uC0C1\uC704 20\uAC74)
${commentsSample}

## \uC2DC\uBBAC\uB808\uC774\uC158 \uC808\uCC28 (\uBC18\uB4DC\uC2DC \uC774 \uC21C\uC11C\uB85C \uC218\uD589)

### Step 1: \uAE30\uBC18\uC120 \uC124\uC815
- \uD604\uC7AC \uC9C0\uC9C0\uC728 \uCD94\uC815 \uBC94\uC704\uC640 \uC5EC\uB860 \uBC29\uD5A5\uC131\uC744 \uAE30\uBC18\uC120\uC73C\uB85C \uC124\uC815\uD558\uC138\uC694

### Step 2: \uC2B9\uB9AC \uC870\uAC74 \uB3C4\uCD9C (3~7\uAC1C)
- \uC2B9\uB9AC\uC5D0 \uD544\uC694\uD55C \uD575\uC2EC \uC870\uAC74\uC744 \uB3C4\uCD9C\uD558\uC138\uC694
- \uAC01 \uC870\uAC74\uC758 \uD604\uC7AC \uCDA9\uC871 \uC0C1\uD0DC(met/partial/unmet)\uB97C \uB370\uC774\uD130 \uADFC\uAC70\uB85C \uD310\uB2E8\uD558\uC138\uC694

### Step 3: \uD328\uBC30 \uC870\uAC74 \uB3C4\uCD9C (2~5\uAC1C)
- \uD328\uBC30\uB85C \uC774\uC5B4\uC9C8 \uC218 \uC788\uB294 \uC870\uAC74\uC744 \uB3C4\uCD9C\uD558\uC138\uC694
- \uAC01 \uC870\uAC74\uC758 \uD604\uC7AC \uB9AC\uC2A4\uD06C \uC218\uC900\uACFC \uC644\uD654 \uBC29\uC548\uC744 \uAE30\uC220\uD558\uC138\uC694

### Step 4: \uC2B9\uB9AC \uD655\uB960 \uC0B0\uCD9C
- Step 1~3\uC744 \uC885\uD569\uD558\uC5EC \uC2B9\uB9AC \uD655\uB960(0~100%)\uC744 \uC0B0\uCD9C\uD558\uC138\uC694
- confidenceLevel\uC744 \uD310\uB2E8\uD558\uC138\uC694

### Step 5: \uD575\uC2EC \uC804\uB7B5 \uB3C4\uCD9C (3~5\uAC1C)
- \uC2B9\uB9AC \uD655\uB960\uC744 \uB192\uC774\uAE30 \uC704\uD55C \uD575\uC2EC \uC804\uB7B5\uC744 \uC6B0\uC120\uC21C\uC704 \uC21C\uC73C\uB85C \uC81C\uC2DC\uD558\uC138\uC694
- \uAC01 \uC804\uB7B5\uC758 \uAE30\uB300 \uD6A8\uACFC\uB97C \uC815\uB7C9\uC801\uC73C\uB85C \uD45C\uD604\uD558\uC138\uC694

### Step 6: \uC885\uD569 \uC694\uC57D
- simulationSummary\uC5D0 \uC804\uCCB4 \uC2DC\uBBAC\uB808\uC774\uC158 \uACB0\uACFC\uB97C 3~5\uC904\uB85C \uC694\uC57D\uD558\uC138\uC694`;
  },
  buildPromptWithContext(data, priorResults) {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForWinSimulation(priorResults);
    return `${basePrompt}

## \uC804\uCCB4 \uC120\uD589 \uBD84\uC11D \uD575\uC2EC \uC694\uC57D
${distilledContext}

\uC704 \uBD84\uC11D \uACB0\uACFC\uB97C \uC885\uD569\uD558\uC5EC \uC2DC\uBBAC\uB808\uC774\uC158\uC744 \uC218\uD589\uD558\uC138\uC694.
\uC120\uD589 \uC804\uB7B5(strategy)\uC744 \uADF8\uB300\uB85C \uBC18\uBCF5\uD558\uC9C0 \uB9D0\uACE0, \uC2DC\uBBAC\uB808\uC774\uC158 \uACB0\uACFC\uC5D0 \uAE30\uBC18\uD55C \uC0C8\uB85C\uC6B4 \uC6B0\uC120\uC21C\uC704\uB97C \uC81C\uC2DC\uD558\uC138\uC694.`;
  }
};

// src/gateway/provider-meta.ts
var PROVIDER_REGISTRY = {
  // --- 직접 API ---
  anthropic: {
    type: "anthropic",
    displayName: "Anthropic (Claude)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-orange-500"
  },
  openai: {
    type: "openai",
    displayName: "OpenAI (ChatGPT)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-green-500"
  },
  gemini: {
    type: "gemini",
    displayName: "Google (Gemini)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-blue-500"
  },
  deepseek: {
    type: "deepseek",
    displayName: "DeepSeek",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-purple-500"
  },
  xai: {
    type: "xai",
    displayName: "xAI (Grok)",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    supportsStructuredOutput: true,
    requiresJsonMode: false,
    color: "bg-red-500"
  },
  openrouter: {
    type: "openrouter",
    displayName: "OpenRouter",
    accessMethod: "direct-api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsStructuredOutput: true,
    // generateObject + mode:'json' 사용
    requiresJsonMode: true,
    color: "bg-cyan-500"
  },
  // --- Proxy CLI ---
  "claude-cli": {
    type: "claude-cli",
    displayName: "Claude CLI (Proxy)",
    accessMethod: "proxy-cli",
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: "http://localhost:8317",
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-amber-500"
  },
  "gemini-cli": {
    type: "gemini-cli",
    displayName: "Gemini CLI (Proxy)",
    accessMethod: "proxy-cli",
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-teal-500"
  },
  // --- 로컬 ---
  ollama: {
    type: "ollama",
    displayName: "Ollama (Local)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: "http://localhost:11434",
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-gray-500"
  },
  custom: {
    type: "custom",
    displayName: "Custom (OpenAI Compatible)",
    accessMethod: "local",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsStructuredOutput: false,
    requiresJsonMode: false,
    color: "bg-zinc-500"
  }
};
var AI_PROVIDER_VALUES = Object.keys(PROVIDER_REGISTRY);
function getProvidersByAccess(method) {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.accessMethod === method);
}
function isProxyCli(provider) {
  return PROVIDER_REGISTRY[provider]?.accessMethod === "proxy-cli";
}
function needsTextFallback(provider) {
  return !PROVIDER_REGISTRY[provider]?.supportsStructuredOutput;
}
function needsJsonMode(provider) {
  return PROVIDER_REGISTRY[provider]?.requiresJsonMode ?? false;
}

// src/gateway/gateway.ts
function normalizeUsage(usage) {
  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const inputTokens = (typeof usage.promptTokens === "number" ? usage.promptTokens : 0) || (typeof usage.inputTokens === "number" ? usage.inputTokens : 0);
  const outputTokens = (typeof usage.completionTokens === "number" ? usage.completionTokens : 0) || (typeof usage.outputTokens === "number" ? usage.outputTokens : 0);
  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
var DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-nano",
  gemini: "gemini-2.5-flash",
  deepseek: "deepseek-chat"
};
var DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1"
};
async function getModel(provider, model, baseUrl, apiKey) {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? "gpt-4.1-nano";
  console.log(
    `[ai-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? "none"}, hasApiKey=${!!apiKey}`
  );
  switch (provider) {
    case "anthropic": {
      const client = createAnthropic({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
    case "gemini": {
      const client = createGoogleGenerativeAI({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
    case "gemini-cli": {
      const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
      const client = createGeminiProvider({
        authType: "oauth-personal"
      });
      return client(modelName);
    }
    case "claude-cli": {
      const proxyBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : "http://localhost:8317";
      const resolvedUrl = proxyBaseUrl.endsWith("/v1") ? proxyBaseUrl : `${proxyBaseUrl}/v1`;
      const client = createOpenAI({
        baseURL: resolvedUrl,
        apiKey: apiKey || "cli-proxy"
      });
      return client.chat(modelName);
    }
    case "ollama":
    case "deepseek":
    case "xai":
    case "openrouter":
    case "custom": {
      let resolvedBaseUrl;
      if (baseUrl) {
        const cleaned = baseUrl.replace(/\/+$/, "");
        resolvedBaseUrl = cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`;
      } else {
        resolvedBaseUrl = DEFAULT_BASE_URLS[provider] ?? "http://localhost:11434/v1";
      }
      const client = createOpenAI({
        baseURL: resolvedBaseUrl,
        apiKey: apiKey || "ollama"
      });
      return client.chat(modelName);
    }
    case "openai":
    default: {
      const client = createOpenAI({
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseURL: baseUrl } : {}
      });
      return client(modelName);
    }
  }
}
function mergeAbortSignals(external, timeoutMs) {
  const timeout = timeoutMs ?? 3e5;
  if (!external) return AbortSignal.timeout(timeout);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeout);
  external.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      controller.abort(external.reason);
    },
    { once: true }
  );
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}
async function analyzeText(prompt, options = {}) {
  const provider = options.provider ?? "anthropic";
  const result = await generateText({
    model: await getModel(provider, options.model, options.baseUrl, options.apiKey),
    ...options.systemPrompt ? { system: options.systemPrompt } : {},
    prompt,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal: mergeAbortSignals(options.abortSignal, options.timeoutMs)
  });
  return {
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason
  };
}
async function analyzeStructured(prompt, schema, options = {}) {
  const provider = options.provider ?? "anthropic";
  const model = await getModel(provider, options.model, options.baseUrl, options.apiKey);
  const abortSignal = mergeAbortSignals(options.abortSignal, options.timeoutMs);
  if (needsTextFallback(provider)) {
    return analyzeStructuredViaText(prompt, schema, model, options, abortSignal);
  }
  const needsJsonMode2 = needsJsonMode(provider);
  const result = await generateObject({
    model,
    ...options.systemPrompt ? { system: options.systemPrompt } : {},
    prompt,
    schema,
    ...needsJsonMode2 ? { mode: "json" } : {},
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    abortSignal
  });
  return {
    object: result.object,
    usage: result.usage,
    finishReason: result.finishReason
  };
}
function extractJson(text) {
  let json;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    json = jsonMatch ? jsonMatch[1].trim() : text.trim();
  }
  try {
    JSON.parse(json);
    return json;
  } catch {
    return repairTruncatedJson(json);
  }
}
function repairTruncatedJson(json) {
  let trimmed = json;
  const quoteCount = (trimmed.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    const lastQuote = trimmed.lastIndexOf('"');
    const beforeLastQuote = trimmed.lastIndexOf('"', lastQuote - 1);
    if (beforeLastQuote > 0) {
      trimmed = trimmed.substring(0, beforeLastQuote);
    }
  }
  const lastCloseBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(",")) {
      trimmed = trimmed.substring(0, lastCloseBrace + 1);
    }
  }
  trimmed = trimmed.replace(/,\s*$/, "");
  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  while (stack.length > 0) {
    const open = stack.pop();
    trimmed += open === "{" ? "}" : "]";
  }
  return trimmed;
}
async function analyzeStructuredViaText(prompt, schema, model, options, abortSignal) {
  let schemaBlock = "";
  try {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
    schemaBlock = `

\uC751\uB2F5 JSON Schema:
${JSON.stringify(jsonSchema, null, 2)}`;
  } catch {
  }
  const jsonInstruction = `${schemaBlock}

\uBC18\uB4DC\uC2DC \uC704 JSON Schema \uAD6C\uC870\uC5D0 \uC815\uD655\uD788 \uB9DE\uB294 \uC720\uD6A8\uD55C JSON\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694. \uB9C8\uD06C\uB2E4\uC6B4 \uCF54\uB4DC\uBE14\uB85D, \uC124\uBA85 \uD14D\uC2A4\uD2B8, \uC8FC\uC11D \uC5C6\uC774 \uC21C\uC218 JSON \uAC1D\uCCB4\uB9CC \uCD9C\uB825\uD558\uC138\uC694. \uBAA8\uB4E0 \uD544\uC218 \uD544\uB4DC\uB97C \uBE60\uC9D0\uC5C6\uC774 \uD3EC\uD568\uD558\uB418, \uAC01 \uD14D\uC2A4\uD2B8 \uD544\uB4DC\uB294 2~3\uBB38\uC7A5 \uC774\uB0B4\uB85C \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD558\uC138\uC694. JSON\uC774 \uC798\uB9AC\uC9C0 \uC54A\uB3C4\uB85D \uC804\uCCB4 \uC751\uB2F5\uC744 \uC644\uACB0\uB41C \uD615\uD0DC\uB85C \uCD9C\uB825\uD558\uC138\uC694.`;
  const systemWithJson = (options.systemPrompt ?? "") + jsonInstruction;
  let result;
  try {
    result = await generateText({
      model,
      system: systemWithJson,
      prompt,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      abortSignal
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ai-gateway] analyzeStructuredViaText: generateText \uD638\uCD9C \uC2E4\uD328 \u2014 ${msg}`);
    throw e;
  }
  console.log(
    `[ai-gateway] analyzeStructuredViaText: \uC751\uB2F5 \uC218\uC2E0 (finishReason=${result.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length})`
  );
  if (result.finishReason === "length") {
    console.warn(
      `[ai-gateway] \uC751\uB2F5\uC774 \uD1A0\uD070 \uC81C\uD55C\uC73C\uB85C \uC798\uB9BC (finishReason=length, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length}) \u2014 JSON \uBCF5\uAD6C \uC2DC\uB3C4`
    );
  }
  const jsonStr = extractJson(result.text);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    const truncatedHint = result.finishReason === "length" ? " [\uC6D0\uC778: \uC751\uB2F5\uC774 \uD1A0\uD070 \uC81C\uD55C(maxOutputTokens)\uC73C\uB85C \uC798\uB9BC \u2014 maxOutputTokens \uC99D\uAC00 \uAD8C\uC7A5]" : "";
    console.error(
      `[ai-gateway] JSON \uD30C\uC2F1 \uC2E4\uD328 \u2014 finishReason=${result.finishReason}, \uD14D\uC2A4\uD2B8 \uAE38\uC774=${result.text.length}${truncatedHint}`
    );
    console.error(`[ai-gateway] \uCD94\uCD9C\uB41C JSON (\uCC98\uC74C 500\uC790): ${jsonStr.substring(0, 500)}`);
    console.error(`[ai-gateway] \uC6D0\uBCF8 \uC751\uB2F5 (\uCC98\uC74C 500\uC790): ${result.text.substring(0, 500)}`);
    throw new Error(
      `JSON \uD30C\uC2F1 \uC2E4\uD328${truncatedHint}: ${e instanceof Error ? e.message : String(e)}
\uC751\uB2F5 \uD14D\uC2A4\uD2B8 (\uCC98\uC74C 500\uC790): ${result.text.substring(0, 500)}`,
      { cause: e }
    );
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    console.error(`[ai-gateway] Zod \uAC80\uC99D \uC2E4\uD328 \u2014 ${issues}`);
    console.error(
      `[ai-gateway] \uD30C\uC2F1\uB41C JSON \uD0A4: ${typeof parsed === "object" && parsed ? Object.keys(parsed).join(", ") : "N/A"}`
    );
    throw new Error(`JSON \uC2A4\uD0A4\uB9C8 \uAC80\uC99D \uC2E4\uD328: ${issues}`);
  }
  return {
    object: validated.data,
    usage: result.usage,
    finishReason: result.finishReason
  };
}

// src/adapters/model-config.ts
function createInMemoryModelConfig(options = {}) {
  const { overrides = {}, providerDefaults = {} } = options;
  return {
    async resolve(moduleName) {
      const base = MODULE_MODEL_MAP[moduleName];
      if (!base) {
        throw new Error(`[model-config] Unknown module: ${moduleName}`);
      }
      const providerDefault = providerDefaults[base.provider] ?? {};
      const override = overrides[moduleName] ?? {};
      const provider = override.provider ?? base.provider;
      const model = override.model ?? providerDefault.model ?? base.model;
      const apiKey = override.apiKey ?? providerDefault.apiKey ?? resolveApiKeyFromEnv(provider);
      const baseUrl = override.baseUrl ?? providerDefault.baseUrl;
      const maxOutputTokens = override.maxOutputTokens;
      return {
        provider,
        model,
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...maxOutputTokens ? { maxOutputTokens } : {}
      };
    }
  };
}
function resolveApiKeyFromEnv(provider) {
  const env = (typeof process !== "undefined" ? process.env : {}) ?? {};
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "gemini":
      return env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
    case "deepseek":
      return env.DEEPSEEK_API_KEY;
    case "xai":
      return env.XAI_API_KEY;
    case "openrouter":
      return env.OPENROUTER_API_KEY;
    default:
      return void 0;
  }
}

// src/adapters/pipeline-control.ts
var noopPipelineControl = {
  async isCancelled() {
    return false;
  },
  async waitIfPaused() {
  },
  async checkCostLimit() {
    return true;
  },
  async appendEvent() {
  }
};

// src/adapters/concurrency.ts
var DEFAULT_LIMITS = {
  gemini: 2,
  anthropic: 3,
  openai: 2,
  "gemini-cli": 1,
  "claude-cli": 1,
  ollama: 1,
  deepseek: 2,
  xai: 2,
  openrouter: 2,
  custom: 1
};
function createStaticConcurrency(limits = {}) {
  return {
    async getLimit(provider) {
      return limits[provider] ?? DEFAULT_LIMITS[provider] ?? 1;
    }
  };
}

// src/runner/retry-utils.ts
function isRateLimitError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /rate\s*limit|429|quota\s*exceeded|RESOURCE_EXHAUSTED|[TR]PM/i.test(msg) || // Gemini 서버 용량 부족 (구체적 문구만 매칭)
  msg.includes("No capacity available") || // 프로바이더가 명시한 재시도 안내
  /please\s+retry\s+in|try\s+again\s+in/i.test(msg);
}
function isServerOverloadError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("503") || msg.includes("overloaded") || msg.includes("temporarily unavailable");
}
function parseRetryAfter(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/(?:try again|retry) in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var MAX_RATE_LIMIT_RETRIES = 5;

// src/runner/run-module.ts
async function runModule(module, input, options, priorResults) {
  const pipelineControl = options.pipelineControl ?? noopPipelineControl;
  const onPersist = options.onPersist ?? (async () => void 0);
  const onProgress = options.onProgress ?? (() => void 0);
  const totalItems = input.articles.length + input.videos.length + input.comments.length;
  if (totalItems === 0) {
    onProgress({ module: module.name, phase: "skip", message: "\uC218\uC9D1 \uB370\uC774\uD130 0\uAC74" });
    await onPersist({
      jobId: input.jobId,
      module: module.name,
      status: "skipped",
      errorMessage: "\uC218\uC9D1 \uB370\uC774\uD130 \uC5C6\uC74C \u2014 \uBD84\uC11D \uC2A4\uD0B5"
    });
    return { module: module.name, status: "skipped", errorMessage: "\uC218\uC9D1 \uB370\uC774\uD130 \uC5C6\uC74C" };
  }
  try {
    await onPersist({ jobId: input.jobId, module: module.name, status: "running" });
    onProgress({ module: module.name, phase: "start" });
    const config9 = await options.configAdapter.resolve(module.name);
    const prompt = priorResults && module.buildPromptWithContext ? module.buildPromptWithContext(input, priorResults) : module.buildPrompt(input);
    const gatewayOptions = {
      provider: config9.provider,
      model: config9.model,
      ...config9.baseUrl ? { baseUrl: config9.baseUrl } : {},
      ...config9.apiKey ? { apiKey: config9.apiKey } : {},
      systemPrompt: module.buildSystemPrompt(),
      maxOutputTokens: config9.maxOutputTokens ?? 8192
    };
    let lastError;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      if (await pipelineControl.isCancelled(input.jobId)) {
        onProgress({
          module: module.name,
          phase: "fail",
          message: "\uCDE8\uC18C\uB428"
        });
        return {
          module: module.name,
          status: "failed",
          errorMessage: "\uC0AC\uC6A9\uC790\uC5D0 \uC758\uD574 \uC911\uC9C0\uB428"
        };
      }
      await pipelineControl.waitIfPaused(input.jobId);
      try {
        const result = await analyzeStructured(prompt, module.schema, gatewayOptions);
        const moduleResult = {
          module: module.name,
          status: "completed",
          result: result.object,
          usage: {
            ...normalizeUsage(result.usage),
            provider: config9.provider,
            model: config9.model
          }
        };
        await onPersist({
          jobId: input.jobId,
          module: module.name,
          status: "completed",
          result: moduleResult.result,
          usage: moduleResult.usage
        });
        onProgress({ module: module.name, phase: "complete" });
        return moduleResult;
      } catch (error) {
        lastError = error;
        if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
          const retryAfterSec = parseRetryAfter(error);
          const backoffMs = Math.max(retryAfterSec * 1e3, (attempt + 1) * 3e3);
          const msg = `${module.name}: Rate limit, ${Math.round(backoffMs / 1e3)}\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4 (${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`;
          onProgress({
            module: module.name,
            phase: "retry",
            message: msg,
            attempt: attempt + 1
          });
          await pipelineControl.appendEvent(input.jobId, "warn", msg).catch(() => void 0);
          await sleep(backoffMs);
          continue;
        }
        if (isServerOverloadError(error) && attempt < 1) {
          const msg = `${module.name}: \uC11C\uBC84 \uACFC\uBD80\uD558, 15\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4`;
          onProgress({ module: module.name, phase: "retry", message: msg, attempt: 1 });
          await pipelineControl.appendEvent(input.jobId, "warn", msg).catch(() => void 0);
          await sleep(15e3);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : void 0;
    onProgress({ module: module.name, phase: "fail", message: errorMessage });
    if (errorStack) {
      console.error(`[run-module] ${module.name}: ${errorMessage}
${errorStack}`);
    }
    await onPersist({
      jobId: input.jobId,
      module: module.name,
      status: "failed",
      errorMessage
    });
    await pipelineControl.appendEvent(input.jobId, "error", `${module.name} \uBD84\uC11D \uC2E4\uD328: ${errorMessage}`).catch(() => void 0);
    return { module: module.name, status: "failed", errorMessage };
  }
}

// src/runner/concurrency.ts
async function runWithProviderGrouping(modules, runner, concurrency) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of modules) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }
  const groupPromises = Array.from(groups.entries()).map(async ([provider, mods]) => {
    const limit = await concurrency.getLimit(provider);
    const results = [];
    for (let i = 0; i < mods.length; i += limit) {
      const batch = mods.slice(i, i + limit);
      const batchResults = await Promise.allSettled(batch.map((m) => runner(m)));
      results.push(...batchResults);
    }
    return { provider, results };
  });
  const allResults = await Promise.all(groupPromises);
  const moduleNameToResult = /* @__PURE__ */ new Map();
  for (const { provider, results } of allResults) {
    const groupModules = groups.get(provider);
    groupModules.forEach((m, idx) => {
      moduleNameToResult.set(m.name, results[idx]);
    });
  }
  return modules.map(
    (m) => moduleNameToResult.get(m.name) ?? {
      status: "rejected",
      reason: new Error(`module ${m.name} produced no result`)
    }
  );
}

// src/runner/stages.ts
var STAGE1_MODULES = [
  macroViewModule,
  segmentationModule,
  sentimentFramingModule,
  messageImpactModule
];
var STAGE2_MODULES = [
  riskMapModule,
  opportunityModule,
  strategyModule
];
var STAGE3_MODULES = [finalSummaryModule];
var STAGE4_PARALLEL = [approvalRatingModule, frameWarModule];
var STAGE4_SEQUENTIAL = [
  crisisScenarioModule,
  winSimulationModule
];
var ALL_MODULES = [
  ...STAGE1_MODULES,
  ...STAGE2_MODULES,
  ...STAGE3_MODULES,
  ...STAGE4_PARALLEL,
  ...STAGE4_SEQUENTIAL
];
function getModuleByName(name) {
  return ALL_MODULES.find((m) => m.name === name);
}

export { AI_PROVIDER_VALUES, ALL_MODULES, ApprovalRatingSchema, CrisisScenarioSchema, FinalSummarySchema, FrameWarSchema, MAX_RATE_LIMIT_RETRIES, MODULE_MODEL_MAP, MODULE_NAMES, MacroViewSchema, MessageImpactSchema, OpportunitySchema, PROVIDER_REGISTRY, RiskMapSchema, STAGE1_MODULES, STAGE2_MODULES, STAGE3_MODULES, STAGE4_PARALLEL, STAGE4_SEQUENTIAL, SegmentationSchema, SentimentFramingSchema, StrategySchema, WinSimulationSchema, analyzeStructured, analyzeText, approvalRatingModule, createInMemoryModelConfig, createStaticConcurrency, crisisScenarioModule, finalSummaryModule, frameWarModule, getModuleByName, getProvidersByAccess, isProxyCli, isRateLimitError, isServerOverloadError, macroViewModule, messageImpactModule, needsJsonMode, needsTextFallback, noopPipelineControl, normalizeUsage, opportunityModule, parseRetryAfter, riskMapModule, runModule, runWithProviderGrouping, segmentationModule, sentimentFramingModule, sleep, strategyModule, winSimulationModule };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map