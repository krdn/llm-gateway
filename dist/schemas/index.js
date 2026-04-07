import { z } from 'zod';

// src/schemas/macro-view.schema.ts
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

export { ApprovalRatingSchema, CrisisScenarioSchema, FinalSummarySchema, FrameWarSchema, MacroViewSchema, MessageImpactSchema, OpportunitySchema, RiskMapSchema, SegmentationSchema, SentimentFramingSchema, StrategySchema, WinSimulationSchema };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map