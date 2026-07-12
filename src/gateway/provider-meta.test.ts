import { describe, expect, it } from 'vitest';
import { PROVIDER_REGISTRY } from './provider-meta';

// 주석으로만 존재하던 레지스트리 불변식을 테스트로 강제한다.
// (이전에 claude-cli가 '키 미검사 프록시'로 오분류돼 defaultApiKey 'cli-proxy'를
//  갖고 있었고, 실제 cli-proxy-api는 api-keys를 검증해 무조건 401이 났다.)
describe('PROVIDER_REGISTRY 불변식', () => {
  const entries = Object.values(PROVIDER_REGISTRY);

  it('requiresApiKey인 프로바이더는 defaultApiKey를 갖지 않는다 (가짜 키 전송 방지)', () => {
    for (const meta of entries) {
      if (meta.requiresApiKey) {
        expect(meta.defaultApiKey, `${meta.type}에 defaultApiKey가 있으면 안 됨`).toBeUndefined();
      }
    }
  });

  it('chat 방식 + 키 불요구 프로바이더는 defaultApiKey가 있다 (OpenAI 호환 경로는 키 문자열 필수)', () => {
    for (const meta of entries) {
      if (meta.callMethod === 'chat' && !meta.requiresApiKey) {
        expect(meta.defaultApiKey, `${meta.type}에 defaultApiKey 필요`).toBeDefined();
      }
    }
  });

  it('type 필드는 레지스트리 키와 일치한다', () => {
    for (const [key, meta] of Object.entries(PROVIDER_REGISTRY)) {
      expect(meta.type).toBe(key);
    }
  });
});
