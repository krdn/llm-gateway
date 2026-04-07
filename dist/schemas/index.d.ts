import { z } from 'zod';

declare const MacroViewSchema: z.ZodObject<{
    overallDirection: z.ZodEnum<["positive", "negative", "mixed"]>;
    summary: z.ZodString;
    timeline: z.ZodDefault<z.ZodArray<z.ZodObject<{
        date: z.ZodCatch<z.ZodString>;
        event: z.ZodCatch<z.ZodString>;
        impact: z.ZodCatch<z.ZodEnum<["positive", "negative", "neutral", "mixed"]>>;
        description: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        event: string;
        impact: "positive" | "negative" | "mixed" | "neutral";
        description: string;
    }, {
        date?: unknown;
        event?: unknown;
        impact?: unknown;
        description?: unknown;
    }>, "many">>;
    inflectionPoints: z.ZodDefault<z.ZodArray<z.ZodObject<{
        date: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        beforeSentiment: z.ZodCatch<z.ZodEnum<["positive", "negative", "neutral"]>>;
        afterSentiment: z.ZodCatch<z.ZodEnum<["positive", "negative", "neutral"]>>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        description: string;
        beforeSentiment: "positive" | "negative" | "neutral";
        afterSentiment: "positive" | "negative" | "neutral";
    }, {
        date?: unknown;
        description?: unknown;
        beforeSentiment?: unknown;
        afterSentiment?: unknown;
    }>, "many">>;
    dailyMentionTrend: z.ZodDefault<z.ZodArray<z.ZodObject<{
        date: z.ZodCatch<z.ZodString>;
        count: z.ZodCatch<z.ZodNumber>;
        sentimentRatio: z.ZodCatch<z.ZodObject<{
            positive: z.ZodCatch<z.ZodNumber>;
            negative: z.ZodCatch<z.ZodNumber>;
            neutral: z.ZodCatch<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            positive: number;
            negative: number;
            neutral: number;
        }, {
            positive?: unknown;
            negative?: unknown;
            neutral?: unknown;
        }>>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        count: number;
        sentimentRatio: {
            positive: number;
            negative: number;
            neutral: number;
        };
    }, {
        date?: unknown;
        count?: unknown;
        sentimentRatio?: unknown;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    overallDirection: "positive" | "negative" | "mixed";
    summary: string;
    timeline: {
        date: string;
        event: string;
        impact: "positive" | "negative" | "mixed" | "neutral";
        description: string;
    }[];
    inflectionPoints: {
        date: string;
        description: string;
        beforeSentiment: "positive" | "negative" | "neutral";
        afterSentiment: "positive" | "negative" | "neutral";
    }[];
    dailyMentionTrend: {
        date: string;
        count: number;
        sentimentRatio: {
            positive: number;
            negative: number;
            neutral: number;
        };
    }[];
}, {
    overallDirection: "positive" | "negative" | "mixed";
    summary: string;
    timeline?: {
        date?: unknown;
        event?: unknown;
        impact?: unknown;
        description?: unknown;
    }[] | undefined;
    inflectionPoints?: {
        date?: unknown;
        description?: unknown;
        beforeSentiment?: unknown;
        afterSentiment?: unknown;
    }[] | undefined;
    dailyMentionTrend?: {
        date?: unknown;
        count?: unknown;
        sentimentRatio?: unknown;
    }[] | undefined;
}>;
type MacroViewResult = z.infer<typeof MacroViewSchema>;

declare const SegmentationSchema: z.ZodObject<{
    platformSegments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        platform: z.ZodCatch<z.ZodString>;
        sentiment: z.ZodCatch<z.ZodEnum<["positive", "negative", "mixed"]>>;
        keyTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        volume: z.ZodCatch<z.ZodNumber>;
        characteristics: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: string;
        sentiment: "positive" | "negative" | "mixed";
        keyTopics: string[];
        volume: number;
        characteristics: string;
    }, {
        platform?: unknown;
        sentiment?: unknown;
        keyTopics?: string[] | undefined;
        volume?: unknown;
        characteristics?: unknown;
    }>, "many">>;
    audienceGroups: z.ZodDefault<z.ZodArray<z.ZodObject<{
        groupName: z.ZodCatch<z.ZodString>;
        type: z.ZodCatch<z.ZodEnum<["core", "opposition", "swing"]>>;
        characteristics: z.ZodCatch<z.ZodString>;
        sentiment: z.ZodCatch<z.ZodEnum<["positive", "negative", "mixed"]>>;
        influence: z.ZodCatch<z.ZodEnum<["high", "medium", "low"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "core" | "opposition" | "swing";
        sentiment: "positive" | "negative" | "mixed";
        characteristics: string;
        groupName: string;
        influence: "high" | "medium" | "low";
    }, {
        type?: unknown;
        sentiment?: unknown;
        characteristics?: unknown;
        groupName?: unknown;
        influence?: unknown;
    }>, "many">>;
    highInfluenceGroup: z.ZodCatch<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        reason: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        reason: string;
    }, {
        name?: unknown;
        reason?: unknown;
    }>>;
}, "strip", z.ZodTypeAny, {
    audienceGroups: {
        type: "core" | "opposition" | "swing";
        sentiment: "positive" | "negative" | "mixed";
        characteristics: string;
        groupName: string;
        influence: "high" | "medium" | "low";
    }[];
    highInfluenceGroup: {
        name: string;
        reason: string;
    };
    platformSegments: {
        platform: string;
        sentiment: "positive" | "negative" | "mixed";
        keyTopics: string[];
        volume: number;
        characteristics: string;
    }[];
}, {
    audienceGroups?: {
        type?: unknown;
        sentiment?: unknown;
        characteristics?: unknown;
        groupName?: unknown;
        influence?: unknown;
    }[] | undefined;
    highInfluenceGroup?: unknown;
    platformSegments?: {
        platform?: unknown;
        sentiment?: unknown;
        keyTopics?: string[] | undefined;
        volume?: unknown;
        characteristics?: unknown;
    }[] | undefined;
}>;
type SegmentationResult = z.infer<typeof SegmentationSchema>;

declare const SentimentFramingSchema: z.ZodObject<{
    sentimentRatio: z.ZodObject<{
        positive: z.ZodNumber;
        negative: z.ZodNumber;
        neutral: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        positive: number;
        negative: number;
        neutral: number;
    }, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
    topKeywords: z.ZodDefault<z.ZodArray<z.ZodObject<{
        keyword: z.ZodCatch<z.ZodString>;
        count: z.ZodCatch<z.ZodNumber>;
        sentiment: z.ZodCatch<z.ZodEnum<["positive", "negative", "neutral"]>>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        sentiment: "positive" | "negative" | "neutral";
        keyword: string;
    }, {
        count?: unknown;
        sentiment?: unknown;
        keyword?: unknown;
    }>, "many">>;
    relatedKeywords: z.ZodDefault<z.ZodArray<z.ZodObject<{
        keyword: z.ZodString;
        relatedTo: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        coOccurrenceScore: z.ZodCatch<z.ZodNumber>;
        context: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        keyword: string;
        relatedTo: string[];
        coOccurrenceScore: number;
        context: string;
    }, {
        keyword: string;
        relatedTo?: string[] | undefined;
        coOccurrenceScore?: unknown;
        context?: unknown;
    }>, "many">>;
    positiveFrames: z.ZodDefault<z.ZodArray<z.ZodObject<{
        frame: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        strength: z.ZodCatch<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        frame: string;
        strength: number;
    }, {
        description?: unknown;
        frame?: unknown;
        strength?: unknown;
    }>, "many">>;
    negativeFrames: z.ZodDefault<z.ZodArray<z.ZodObject<{
        frame: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        strength: z.ZodCatch<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        frame: string;
        strength: number;
    }, {
        description?: unknown;
        frame?: unknown;
        strength?: unknown;
    }>, "many">>;
    frameConflict: z.ZodCatch<z.ZodObject<{
        description: z.ZodCatch<z.ZodString>;
        dominantFrame: z.ZodCatch<z.ZodString>;
        challengingFrame: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        dominantFrame: string;
        challengingFrame: string;
    }, {
        description?: unknown;
        dominantFrame?: unknown;
        challengingFrame?: unknown;
    }>>;
}, "strip", z.ZodTypeAny, {
    sentimentRatio: {
        positive: number;
        negative: number;
        neutral: number;
    };
    negativeFrames: {
        description: string;
        frame: string;
        strength: number;
    }[];
    frameConflict: {
        description: string;
        dominantFrame: string;
        challengingFrame: string;
    };
    positiveFrames: {
        description: string;
        frame: string;
        strength: number;
    }[];
    topKeywords: {
        count: number;
        sentiment: "positive" | "negative" | "neutral";
        keyword: string;
    }[];
    relatedKeywords: {
        keyword: string;
        relatedTo: string[];
        coOccurrenceScore: number;
        context: string;
    }[];
}, {
    sentimentRatio: {
        positive: number;
        negative: number;
        neutral: number;
    };
    negativeFrames?: {
        description?: unknown;
        frame?: unknown;
        strength?: unknown;
    }[] | undefined;
    frameConflict?: unknown;
    positiveFrames?: {
        description?: unknown;
        frame?: unknown;
        strength?: unknown;
    }[] | undefined;
    topKeywords?: {
        count?: unknown;
        sentiment?: unknown;
        keyword?: unknown;
    }[] | undefined;
    relatedKeywords?: {
        keyword: string;
        relatedTo?: string[] | undefined;
        coOccurrenceScore?: unknown;
        context?: unknown;
    }[] | undefined;
}>;
type SentimentFramingResult = z.infer<typeof SentimentFramingSchema>;

declare const MessageImpactSchema: z.ZodObject<{
    successMessages: z.ZodDefault<z.ZodArray<z.ZodObject<{
        content: z.ZodCatch<z.ZodString>;
        source: z.ZodCatch<z.ZodString>;
        impactScore: z.ZodCatch<z.ZodNumber>;
        reason: z.ZodCatch<z.ZodString>;
        spreadType: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        content: string;
        source: string;
        impactScore: number;
        spreadType: string;
    }, {
        reason?: unknown;
        content?: unknown;
        source?: unknown;
        impactScore?: unknown;
        spreadType?: unknown;
    }>, "many">>;
    failureMessages: z.ZodDefault<z.ZodArray<z.ZodObject<{
        content: z.ZodCatch<z.ZodString>;
        source: z.ZodCatch<z.ZodString>;
        negativeScore: z.ZodCatch<z.ZodNumber>;
        reason: z.ZodCatch<z.ZodString>;
        damageType: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        content: string;
        source: string;
        negativeScore: number;
        damageType: string;
    }, {
        reason?: unknown;
        content?: unknown;
        source?: unknown;
        negativeScore?: unknown;
        damageType?: unknown;
    }>, "many">>;
    highSpreadContentTypes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        exampleCount: z.ZodCatch<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        description: string;
        exampleCount: number;
    }, {
        type?: unknown;
        description?: unknown;
        exampleCount?: unknown;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    failureMessages: {
        reason: string;
        content: string;
        source: string;
        negativeScore: number;
        damageType: string;
    }[];
    highSpreadContentTypes: {
        type: string;
        description: string;
        exampleCount: number;
    }[];
    successMessages: {
        reason: string;
        content: string;
        source: string;
        impactScore: number;
        spreadType: string;
    }[];
}, {
    failureMessages?: {
        reason?: unknown;
        content?: unknown;
        source?: unknown;
        negativeScore?: unknown;
        damageType?: unknown;
    }[] | undefined;
    highSpreadContentTypes?: {
        type?: unknown;
        description?: unknown;
        exampleCount?: unknown;
    }[] | undefined;
    successMessages?: {
        reason?: unknown;
        content?: unknown;
        source?: unknown;
        impactScore?: unknown;
        spreadType?: unknown;
    }[] | undefined;
}>;
type MessageImpactResult = z.infer<typeof MessageImpactSchema>;

declare const RiskMapSchema: z.ZodObject<{
    topRisks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        rank: z.ZodCatch<z.ZodNumber>;
        title: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        impactLevel: z.ZodCatch<z.ZodEnum<["critical", "high", "medium", "low"]>>;
        spreadProbability: z.ZodCatch<z.ZodNumber>;
        currentStatus: z.ZodCatch<z.ZodString>;
        triggerConditions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        rank: number;
        title: string;
        impactLevel: "high" | "medium" | "low" | "critical";
        spreadProbability: number;
        currentStatus: string;
        triggerConditions: string[];
    }, {
        description?: unknown;
        rank?: unknown;
        title?: unknown;
        impactLevel?: unknown;
        spreadProbability?: unknown;
        currentStatus?: unknown;
        triggerConditions?: string[] | undefined;
    }>, "many">>;
    overallRiskLevel: z.ZodEnum<["critical", "high", "medium", "low"]>;
    riskTrend: z.ZodEnum<["increasing", "stable", "decreasing"]>;
}, "strip", z.ZodTypeAny, {
    topRisks: {
        description: string;
        rank: number;
        title: string;
        impactLevel: "high" | "medium" | "low" | "critical";
        spreadProbability: number;
        currentStatus: string;
        triggerConditions: string[];
    }[];
    overallRiskLevel: "high" | "medium" | "low" | "critical";
    riskTrend: "increasing" | "stable" | "decreasing";
}, {
    overallRiskLevel: "high" | "medium" | "low" | "critical";
    riskTrend: "increasing" | "stable" | "decreasing";
    topRisks?: {
        description?: unknown;
        rank?: unknown;
        title?: unknown;
        impactLevel?: unknown;
        spreadProbability?: unknown;
        currentStatus?: unknown;
        triggerConditions?: string[] | undefined;
    }[] | undefined;
}>;
type RiskMapResult = z.infer<typeof RiskMapSchema>;

declare const OpportunitySchema: z.ZodObject<{
    positiveAssets: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        expandability: z.ZodCatch<z.ZodEnum<["high", "medium", "low"]>>;
        currentUtilization: z.ZodCatch<z.ZodEnum<["fully", "partially", "unused"]>>;
        recommendation: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
        expandability: "high" | "medium" | "low";
        currentUtilization: "fully" | "partially" | "unused";
        recommendation: string;
    }, {
        description?: unknown;
        title?: unknown;
        expandability?: unknown;
        currentUtilization?: unknown;
        recommendation?: unknown;
    }>, "many">>;
    untappedAreas: z.ZodDefault<z.ZodArray<z.ZodObject<{
        area: z.ZodCatch<z.ZodString>;
        potential: z.ZodCatch<z.ZodString>;
        approach: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        area: string;
        potential: string;
        approach: string;
    }, {
        area?: unknown;
        potential?: unknown;
        approach?: unknown;
    }>, "many">>;
    priorityOpportunity: z.ZodCatch<z.ZodObject<{
        title: z.ZodCatch<z.ZodString>;
        reason: z.ZodCatch<z.ZodString>;
        actionPlan: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        title: string;
        actionPlan: string;
    }, {
        reason?: unknown;
        title?: unknown;
        actionPlan?: unknown;
    }>>;
}, "strip", z.ZodTypeAny, {
    positiveAssets: {
        description: string;
        title: string;
        expandability: "high" | "medium" | "low";
        currentUtilization: "fully" | "partially" | "unused";
        recommendation: string;
    }[];
    priorityOpportunity: {
        reason: string;
        title: string;
        actionPlan: string;
    };
    untappedAreas: {
        area: string;
        potential: string;
        approach: string;
    }[];
}, {
    positiveAssets?: {
        description?: unknown;
        title?: unknown;
        expandability?: unknown;
        currentUtilization?: unknown;
        recommendation?: unknown;
    }[] | undefined;
    priorityOpportunity?: unknown;
    untappedAreas?: {
        area?: unknown;
        potential?: unknown;
        approach?: unknown;
    }[] | undefined;
}>;
type OpportunityResult = z.infer<typeof OpportunitySchema>;

declare const StrategySchema: z.ZodObject<{
    targetStrategy: z.ZodCatch<z.ZodObject<{
        primaryTarget: z.ZodCatch<z.ZodString>;
        secondaryTargets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        approach: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        approach: string;
        primaryTarget: string;
        secondaryTargets: string[];
    }, {
        approach?: unknown;
        primaryTarget?: unknown;
        secondaryTargets?: string[] | undefined;
    }>>;
    messageStrategy: z.ZodCatch<z.ZodObject<{
        coreMessage: z.ZodCatch<z.ZodString>;
        supportingMessages: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        toneAndManner: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        coreMessage: string;
        supportingMessages: string[];
        toneAndManner: string;
    }, {
        coreMessage?: unknown;
        supportingMessages?: string[] | undefined;
        toneAndManner?: unknown;
    }>>;
    contentStrategy: z.ZodCatch<z.ZodObject<{
        recommendedFormats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keyTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        distributionChannels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        keyTopics: string[];
        recommendedFormats: string[];
        distributionChannels: string[];
    }, {
        keyTopics?: string[] | undefined;
        recommendedFormats?: string[] | undefined;
        distributionChannels?: string[] | undefined;
    }>>;
    riskResponse: z.ZodCatch<z.ZodObject<{
        immediateActions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        preventiveActions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        contingencyPlan: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        immediateActions: string[];
        preventiveActions: string[];
        contingencyPlan: string;
    }, {
        immediateActions?: string[] | undefined;
        preventiveActions?: string[] | undefined;
        contingencyPlan?: unknown;
    }>>;
}, "strip", z.ZodTypeAny, {
    targetStrategy: {
        approach: string;
        primaryTarget: string;
        secondaryTargets: string[];
    };
    messageStrategy: {
        coreMessage: string;
        supportingMessages: string[];
        toneAndManner: string;
    };
    riskResponse: {
        immediateActions: string[];
        preventiveActions: string[];
        contingencyPlan: string;
    };
    contentStrategy: {
        keyTopics: string[];
        recommendedFormats: string[];
        distributionChannels: string[];
    };
}, {
    targetStrategy?: unknown;
    messageStrategy?: unknown;
    riskResponse?: unknown;
    contentStrategy?: unknown;
}>;
type StrategyResult = z.infer<typeof StrategySchema>;

declare const FinalSummarySchema: z.ZodObject<{
    oneLiner: z.ZodString;
    currentState: z.ZodObject<{
        summary: z.ZodString;
        sentiment: z.ZodEnum<["positive", "negative", "mixed"]>;
        keyFactor: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        summary: string;
        sentiment: "positive" | "negative" | "mixed";
        keyFactor: string;
    }, {
        summary: string;
        sentiment: "positive" | "negative" | "mixed";
        keyFactor?: unknown;
    }>;
    criticalActions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        priority: z.ZodCatch<z.ZodNumber>;
        action: z.ZodCatch<z.ZodString>;
        expectedImpact: z.ZodCatch<z.ZodString>;
        timeline: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timeline: string;
        priority: number;
        action: string;
        expectedImpact: string;
    }, {
        timeline?: unknown;
        priority?: unknown;
        action?: unknown;
        expectedImpact?: unknown;
    }>, "many">>;
    outlook: z.ZodCatch<z.ZodObject<{
        shortTerm: z.ZodCatch<z.ZodString>;
        mediumTerm: z.ZodCatch<z.ZodString>;
        keyVariable: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        shortTerm: string;
        mediumTerm: string;
        keyVariable: string;
    }, {
        shortTerm?: unknown;
        mediumTerm?: unknown;
        keyVariable?: unknown;
    }>>;
}, "strip", z.ZodTypeAny, {
    oneLiner: string;
    currentState: {
        summary: string;
        sentiment: "positive" | "negative" | "mixed";
        keyFactor: string;
    };
    criticalActions: {
        timeline: string;
        priority: number;
        action: string;
        expectedImpact: string;
    }[];
    outlook: {
        shortTerm: string;
        mediumTerm: string;
        keyVariable: string;
    };
}, {
    oneLiner: string;
    currentState: {
        summary: string;
        sentiment: "positive" | "negative" | "mixed";
        keyFactor?: unknown;
    };
    criticalActions?: {
        timeline?: unknown;
        priority?: unknown;
        action?: unknown;
        expectedImpact?: unknown;
    }[] | undefined;
    outlook?: unknown;
}>;
type FinalSummaryResult = z.infer<typeof FinalSummarySchema>;

declare const ApprovalRatingSchema: z.ZodObject<{
    estimatedRange: z.ZodObject<{
        min: z.ZodNumber;
        max: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        min: number;
        max: number;
    }, {
        min: number;
        max: number;
    }>;
    confidence: z.ZodEnum<["high", "medium", "low"]>;
    methodology: z.ZodCatch<z.ZodObject<{
        sentimentRatio: z.ZodCatch<z.ZodObject<{
            positive: z.ZodCatch<z.ZodNumber>;
            neutral: z.ZodCatch<z.ZodNumber>;
            negative: z.ZodCatch<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            positive: number;
            negative: number;
            neutral: number;
        }, {
            positive?: unknown;
            negative?: unknown;
            neutral?: unknown;
        }>>;
        platformBiasCorrection: z.ZodDefault<z.ZodArray<z.ZodObject<{
            platform: z.ZodCatch<z.ZodString>;
            biasDirection: z.ZodCatch<z.ZodEnum<["left", "right", "neutral"]>>;
            correctionFactor: z.ZodCatch<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            platform: string;
            biasDirection: "neutral" | "left" | "right";
            correctionFactor: number;
        }, {
            platform?: unknown;
            biasDirection?: unknown;
            correctionFactor?: unknown;
        }>, "many">>;
        spreadFactor: z.ZodCatch<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sentimentRatio: {
            positive: number;
            negative: number;
            neutral: number;
        };
        platformBiasCorrection: {
            platform: string;
            biasDirection: "neutral" | "left" | "right";
            correctionFactor: number;
        }[];
        spreadFactor: number;
    }, {
        sentimentRatio?: unknown;
        platformBiasCorrection?: {
            platform?: unknown;
            biasDirection?: unknown;
            correctionFactor?: unknown;
        }[] | undefined;
        spreadFactor?: unknown;
    }>>;
    disclaimer: z.ZodCatch<z.ZodString>;
    reasoning: z.ZodCatch<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    estimatedRange: {
        min: number;
        max: number;
    };
    confidence: "high" | "medium" | "low";
    methodology: {
        sentimentRatio: {
            positive: number;
            negative: number;
            neutral: number;
        };
        platformBiasCorrection: {
            platform: string;
            biasDirection: "neutral" | "left" | "right";
            correctionFactor: number;
        }[];
        spreadFactor: number;
    };
    disclaimer: string;
    reasoning: string;
}, {
    estimatedRange: {
        min: number;
        max: number;
    };
    confidence: "high" | "medium" | "low";
    methodology?: unknown;
    disclaimer?: unknown;
    reasoning?: unknown;
}>;
type ApprovalRatingResult = z.infer<typeof ApprovalRatingSchema>;

declare const FrameWarSchema: z.ZodObject<{
    dominantFrames: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        strength: z.ZodCatch<z.ZodNumber>;
        supportingEvidence: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        strength: number;
        supportingEvidence: string[];
    }, {
        description?: unknown;
        name?: unknown;
        strength?: unknown;
        supportingEvidence?: string[] | undefined;
    }>, "many">>;
    threateningFrames: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        description: z.ZodCatch<z.ZodString>;
        threatLevel: z.ZodCatch<z.ZodEnum<["critical", "high", "medium", "low"]>>;
        counterStrategy: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        threatLevel: "high" | "medium" | "low" | "critical";
        counterStrategy: string;
    }, {
        description?: unknown;
        name?: unknown;
        threatLevel?: unknown;
        counterStrategy?: unknown;
    }>, "many">>;
    reversibleFrames: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        currentPerception: z.ZodCatch<z.ZodString>;
        potentialShift: z.ZodCatch<z.ZodString>;
        requiredAction: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        currentPerception: string;
        potentialShift: string;
        requiredAction: string;
    }, {
        name?: unknown;
        currentPerception?: unknown;
        potentialShift?: unknown;
        requiredAction?: unknown;
    }>, "many">>;
    battlefieldSummary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    dominantFrames: {
        description: string;
        name: string;
        strength: number;
        supportingEvidence: string[];
    }[];
    threateningFrames: {
        description: string;
        name: string;
        threatLevel: "high" | "medium" | "low" | "critical";
        counterStrategy: string;
    }[];
    battlefieldSummary: string;
    reversibleFrames: {
        name: string;
        currentPerception: string;
        potentialShift: string;
        requiredAction: string;
    }[];
}, {
    battlefieldSummary: string;
    dominantFrames?: {
        description?: unknown;
        name?: unknown;
        strength?: unknown;
        supportingEvidence?: string[] | undefined;
    }[] | undefined;
    threateningFrames?: {
        description?: unknown;
        name?: unknown;
        threatLevel?: unknown;
        counterStrategy?: unknown;
    }[] | undefined;
    reversibleFrames?: {
        name?: unknown;
        currentPerception?: unknown;
        potentialShift?: unknown;
        requiredAction?: unknown;
    }[] | undefined;
}>;
type FrameWarResult = z.infer<typeof FrameWarSchema>;

declare const CrisisScenarioSchema: z.ZodObject<{
    scenarios: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        probability: z.ZodCatch<z.ZodNumber>;
        triggerConditions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        expectedOutcome: z.ZodCatch<z.ZodString>;
        responseStrategy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        timeframe: z.ZodCatch<z.ZodString>;
        type: z.ZodCatch<z.ZodEnum<["spread", "control", "reverse"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "reverse" | "spread" | "control";
        name: string;
        triggerConditions: string[];
        probability: number;
        expectedOutcome: string;
        responseStrategy: string[];
        timeframe: string;
    }, {
        type?: unknown;
        name?: unknown;
        triggerConditions?: string[] | undefined;
        probability?: unknown;
        expectedOutcome?: unknown;
        responseStrategy?: string[] | undefined;
        timeframe?: unknown;
    }>, "many">>;
    currentRiskLevel: z.ZodEnum<["critical", "high", "medium", "low"]>;
    recommendedAction: z.ZodCatch<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scenarios: {
        type: "reverse" | "spread" | "control";
        name: string;
        triggerConditions: string[];
        probability: number;
        expectedOutcome: string;
        responseStrategy: string[];
        timeframe: string;
    }[];
    currentRiskLevel: "high" | "medium" | "low" | "critical";
    recommendedAction: string;
}, {
    currentRiskLevel: "high" | "medium" | "low" | "critical";
    scenarios?: {
        type?: unknown;
        name?: unknown;
        triggerConditions?: string[] | undefined;
        probability?: unknown;
        expectedOutcome?: unknown;
        responseStrategy?: string[] | undefined;
        timeframe?: unknown;
    }[] | undefined;
    recommendedAction?: unknown;
}>;
type CrisisScenarioResult = z.infer<typeof CrisisScenarioSchema>;

declare const WinSimulationSchema: z.ZodObject<{
    winProbability: z.ZodNumber;
    confidenceLevel: z.ZodEnum<["high", "medium", "low"]>;
    winConditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodCatch<z.ZodString>;
        currentStatus: z.ZodCatch<z.ZodEnum<["met", "partial", "unmet"]>>;
        importance: z.ZodCatch<z.ZodEnum<["critical", "high", "medium"]>>;
    }, "strip", z.ZodTypeAny, {
        currentStatus: "met" | "partial" | "unmet";
        condition: string;
        importance: "high" | "medium" | "critical";
    }, {
        currentStatus?: unknown;
        condition?: unknown;
        importance?: unknown;
    }>, "many">>;
    loseConditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodCatch<z.ZodString>;
        currentRisk: z.ZodCatch<z.ZodEnum<["high", "medium", "low"]>>;
        mitigation: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        condition: string;
        currentRisk: "high" | "medium" | "low";
        mitigation: string;
    }, {
        condition?: unknown;
        currentRisk?: unknown;
        mitigation?: unknown;
    }>, "many">>;
    keyStrategies: z.ZodDefault<z.ZodArray<z.ZodObject<{
        strategy: z.ZodCatch<z.ZodString>;
        expectedImpact: z.ZodCatch<z.ZodString>;
        priority: z.ZodCatch<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        strategy: string;
        priority: number;
        expectedImpact: string;
    }, {
        strategy?: unknown;
        priority?: unknown;
        expectedImpact?: unknown;
    }>, "many">>;
    simulationSummary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    winProbability: number;
    confidenceLevel: "high" | "medium" | "low";
    winConditions: {
        currentStatus: "met" | "partial" | "unmet";
        condition: string;
        importance: "high" | "medium" | "critical";
    }[];
    loseConditions: {
        condition: string;
        currentRisk: "high" | "medium" | "low";
        mitigation: string;
    }[];
    keyStrategies: {
        strategy: string;
        priority: number;
        expectedImpact: string;
    }[];
    simulationSummary: string;
}, {
    winProbability: number;
    confidenceLevel: "high" | "medium" | "low";
    simulationSummary: string;
    winConditions?: {
        currentStatus?: unknown;
        condition?: unknown;
        importance?: unknown;
    }[] | undefined;
    loseConditions?: {
        condition?: unknown;
        currentRisk?: unknown;
        mitigation?: unknown;
    }[] | undefined;
    keyStrategies?: {
        strategy?: unknown;
        priority?: unknown;
        expectedImpact?: unknown;
    }[] | undefined;
}>;
type WinSimulationResult = z.infer<typeof WinSimulationSchema>;

export { type ApprovalRatingResult, ApprovalRatingSchema, type CrisisScenarioResult, CrisisScenarioSchema, type FinalSummaryResult, FinalSummarySchema, type FrameWarResult, FrameWarSchema, type MacroViewResult, MacroViewSchema, type MessageImpactResult, MessageImpactSchema, type OpportunityResult, OpportunitySchema, type RiskMapResult, RiskMapSchema, type SegmentationResult, SegmentationSchema, type SentimentFramingResult, SentimentFramingSchema, type StrategyResult, StrategySchema, type WinSimulationResult, WinSimulationSchema };
