import { z } from 'zod';
import { A as AIProvider } from './provider-meta-Bo9sv1xo.js';

type ProviderType = AIProvider;
interface AnalysisModule<T = unknown> {
    readonly name: string;
    readonly displayName: string;
    readonly provider: AIProvider;
    readonly model: string;
    readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    buildPrompt(data: AnalysisInput): string;
    buildSystemPrompt(): string;
    buildPromptWithContext?(data: AnalysisInput, priorResults: Record<string, unknown>): string;
}
interface AnalysisInput {
    jobId: number;
    keyword: string;
    articles: Array<{
        title: string;
        content: string | null;
        publisher: string | null;
        publishedAt: Date | null;
        source: string;
    }>;
    videos: Array<{
        title: string;
        description: string | null;
        channelTitle: string | null;
        viewCount: number | null;
        likeCount: number | null;
        publishedAt: Date | null;
    }>;
    comments: Array<{
        content: string;
        source: string;
        author: string | null;
        likeCount: number | null;
        dislikeCount: number | null;
        publishedAt: Date | null;
    }>;
    dateRange: {
        start: Date;
        end: Date;
    };
}
interface AnalysisModuleResult<T = unknown> {
    module: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: T;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        provider: string;
        model: string;
    };
    errorMessage?: string;
}
declare const MODULE_MODEL_MAP: Record<string, {
    provider: AIProvider;
    model: string;
}>;
declare const MODULE_NAMES: {
    readonly MACRO_VIEW: "macro-view";
    readonly SEGMENTATION: "segmentation";
    readonly SENTIMENT_FRAMING: "sentiment-framing";
    readonly MESSAGE_IMPACT: "message-impact";
    readonly RISK_MAP: "risk-map";
    readonly OPPORTUNITY: "opportunity";
    readonly STRATEGY: "strategy";
    readonly FINAL_SUMMARY: "final-summary";
    readonly APPROVAL_RATING: "approval-rating";
    readonly FRAME_WAR: "frame-war";
    readonly CRISIS_SCENARIO: "crisis-scenario";
    readonly WIN_SIMULATION: "win-simulation";
};

export { type AnalysisInput as A, MODULE_MODEL_MAP as M, type ProviderType as P, type AnalysisModule as a, type AnalysisModuleResult as b, MODULE_NAMES as c };
