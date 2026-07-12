import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_REGISTRY,
  AI_PROVIDER_VALUES,
  type AIProvider,
} from './provider-meta';

export const DEFAULT_MODELS: Partial<Record<AIProvider, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1-nano',
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
};

/** SDK 팩토리가 반환하는 클라이언트 — client(model) 직접 호출 또는 client.chat(model) */
type SdkClient = ((modelId: string) => LanguageModel) & {
  chat(modelId: string): LanguageModel;
};
type SdkFactory = (opts: { apiKey?: string; baseURL?: string }) => SdkClient;

const SDK_MAP: Partial<Record<AIProvider, SdkFactory>> = {
  anthropic: (opts) => createAnthropic(opts),
  gemini: (opts) => createGoogleGenerativeAI(opts),
  openai: (opts) => createOpenAI(opts),
};

/** OpenAI 호환 Chat API용 baseURL 정규화 (트레일링 슬래시 제거 + /v1 보장) */
function ensureV1Suffix(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, '');
  return cleaned.endsWith('/v1') ? cleaned : `${cleaned}/v1`;
}

/**
 * provider/model/baseUrl/apiKey를 해석해 AI SDK `LanguageModel`을 생성한다.
 *
 * 레지스트리(PROVIDER_REGISTRY)가 선언한 불변식을 이 지점에서 강제한다:
 *   - 알 수 없는 provider → 즉시 에러 (as-cast로 들어온 잘못된 문자열 차단)
 *   - 기본 모델이 없는 provider에 model 미지정 → 에러 (임의 모델명 폴백 금지)
 *   - chat 방식 provider의 apiKey/baseUrl 누락 → 에러
 *     (가짜 키를 유료 API에 보내거나 localhost로 폴백하는 침묵 오동작 방지)
 *
 * direct 방식 provider(anthropic/openai/gemini)는 apiKey를 생략하면
 * AI SDK의 환경변수 폴백(ANTHROPIC_API_KEY 등)을 그대로 사용한다.
 */
export async function getModel(
  provider: AIProvider,
  model?: string,
  baseUrl?: string,
  apiKey?: string,
): Promise<LanguageModel> {
  const meta = PROVIDER_REGISTRY[provider];
  if (!meta) {
    throw new Error(
      `[llm-gateway] 알 수 없는 provider: '${provider}'. 사용 가능: ${AI_PROVIDER_VALUES.join(', ')}`,
    );
  }

  const modelName = model ?? DEFAULT_MODELS[provider];
  if (!modelName) {
    throw new Error(
      `[llm-gateway] provider '${provider}'는 기본 모델이 없습니다 — options.model을 지정하세요`,
    );
  }

  // gemini-cli는 로컬 ~/.gemini OAuth 전용 경로 — baseUrl/apiKey 인자는 사용되지
  // 않는다 (cli-proxy-api 등 프록시와 무관한 별도 크레덴셜/쿼터).
  // 프록시의 Gemini 모델이 필요하면 custom 프로바이더 + baseUrl + 프록시 키를 쓸 것.
  if (provider === 'gemini-cli') {
    const mod = await import('ai-sdk-provider-gemini-cli').catch((err: unknown) => {
      throw new Error(
        `[llm-gateway] provider 'gemini-cli'는 선택적 peer dependency가 필요합니다 — ` +
          `소비자 프로젝트에 설치하세요: pnpm add ai-sdk-provider-gemini-cli`,
        { cause: err },
      );
    });
    // ai-sdk-provider-gemini-cli의 LanguageModel과 ai 패키지 버전 간 seam — 캐스트 유지
    return mod.createGeminiProvider({ authType: 'oauth-personal' })(modelName) as LanguageModel;
  }

  const sdkFactory: SdkFactory = SDK_MAP[provider] ?? ((opts) => createOpenAI(opts));
  const sdkOpts: { apiKey?: string; baseURL?: string } = {};

  if (meta.callMethod === 'chat') {
    const resolvedBaseUrl = baseUrl ?? meta.defaultBaseUrl;
    if (!resolvedBaseUrl) {
      throw new Error(
        `[llm-gateway] provider '${provider}'는 baseUrl이 필요합니다 — options.baseUrl을 지정하세요`,
      );
    }
    sdkOpts.baseURL = ensureV1Suffix(resolvedBaseUrl);

    const resolvedApiKey = apiKey || meta.defaultApiKey;
    if (!resolvedApiKey) {
      throw new Error(
        `[llm-gateway] provider '${provider}'는 apiKey가 필요합니다 — options.apiKey를 지정하세요`,
      );
    }
    sdkOpts.apiKey = resolvedApiKey;
  } else {
    if (apiKey) sdkOpts.apiKey = apiKey;
    if (baseUrl) sdkOpts.baseURL = baseUrl;
  }

  const client = sdkFactory(sdkOpts);
  return meta.callMethod === 'chat' ? client.chat(modelName) : client(modelName);
}
