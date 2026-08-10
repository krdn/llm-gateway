// `ai-sdk-provider-gemini-cli`의 최소 타입 선언.
//
// 이 패키지는 **선택적 peer dependency**이고 `model-factory.ts`가 dynamic import로만
// 쓴다. 그런데 타입을 얻으려고 devDependency로 설치하면 `@google/gemini-cli-core`가
// 딸려 오는데, 그 트리 하나가 이 저장소 Dependabot alert의 development scope
// 대부분(critical 2건 포함)을 만든다 — hono·protobufjs·simple-git·shell-quote 등
// CLI 런타임 전체가 들어온다. 우리가 실제로 쓰는 표면은 아래 함수 하나뿐이라
// 그 트리를 유지할 이유가 없다.
//
// 반환을 `unknown`으로 두는 것은 의도적이다. `model-factory.ts`는 이미
// `as LanguageModel` 캐스트를 하고 있고(그 패키지의 LanguageModel과 우리가 쓰는
// `ai` 버전 사이의 seam), 여기서 더 정확한 타입을 흉내 내봤자 실제 패키지와
// 어긋날 때 조용히 틀릴 뿐이다. 없는 정확성을 주장하지 않는다.
declare module 'ai-sdk-provider-gemini-cli' {
  export function createGeminiProvider(options: {
    authType: 'oauth-personal' | (string & {});
  }): (modelId: string) => unknown;
}
