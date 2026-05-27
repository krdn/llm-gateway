import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { PROVIDER_REGISTRY, type AIProvider } from './provider-meta';

export const DEFAULT_MODELS: Partial<Record<AIProvider, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1-nano',
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
};

type SdkFactory = (opts: { apiKey?: string; baseURL?: string }) => unknown;

const SDK_MAP: Partial<Record<AIProvider, SdkFactory>> = {
  anthropic: (opts) => createAnthropic(opts),
  gemini: (opts) => createGoogleGenerativeAI(opts),
  openai: (opts) => createOpenAI(opts),
};

function resolveBaseUrlForChat(provider: AIProvider, baseUrl?: string): string {
  if (baseUrl) {
    const cleaned = baseUrl.replace(/\/+$/, '');
    return cleaned.endsWith('/v1') ? cleaned : `${cleaned}/v1`;
  }
  const defaultUrl = PROVIDER_REGISTRY[provider].defaultBaseUrl ?? 'http://localhost:11434';
  return defaultUrl.endsWith('/v1') ? defaultUrl : `${defaultUrl}/v1`;
}

export async function getModel(
  provider: AIProvider,
  model?: string,
  baseUrl?: string,
  apiKey?: string,
): Promise<LanguageModel> {
  const modelName = model ?? DEFAULT_MODELS[provider] ?? 'gpt-4.1-nano';
  console.log(
    `[llm-gateway] getModel: provider=${provider}, model=${modelName}, baseUrl=${baseUrl ?? 'none'}, hasApiKey=${!!apiKey}`,
  );

  if (provider === 'gemini-cli') {
    const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
    return createGeminiProvider({ authType: 'oauth-personal' })(modelName) as LanguageModel;
  }

  const meta = PROVIDER_REGISTRY[provider];
  const sdkFactory: SdkFactory = SDK_MAP[provider] ?? ((opts) => createOpenAI(opts));

  const sdkOpts: { apiKey?: string; baseURL?: string } = {};

  if (meta.callMethod === 'chat') {
    sdkOpts.baseURL = resolveBaseUrlForChat(provider, baseUrl);
    sdkOpts.apiKey = apiKey || meta.defaultApiKey;
  } else {
    if (apiKey) sdkOpts.apiKey = apiKey;
    if (baseUrl) sdkOpts.baseURL = baseUrl;
  }

  const client = sdkFactory(sdkOpts) as ReturnType<typeof createOpenAI>;

  return (meta.callMethod === 'chat'
    ? client.chat(modelName)
    : (client as unknown as (m: string) => LanguageModel)(modelName)) as LanguageModel;
}
