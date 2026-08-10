import { asSchema, type FlexibleSchema } from 'ai';

/**
 * LLM 텍스트 응답에서 JSON 문자열을 추출한다.
 *
 * 추출 우선순위:
 *   1. ```json ... ``` 또는 ``` ... ``` 코드블록 내부
 *   2. 첫 여는 `{`/`[`부터 괄호 균형이 0이 되는 지점까지 (이스케이프 인지
 *      스캔 — 문자열 값 안의 `}`/`]`를 경계로 오인하지 않음). 끝까지 균형이
 *      안 맞으면(토큰 절단) 문자열 끝까지 취해 복구 단계로 넘긴다.
 *   3. 여는 괄호가 없으면 입력 문자열 전체 (trim)
 *
 * 추출 후 `JSON.parse`로 유효성을 검사하고, 실패 시
 * `repairTruncatedJson()`으로 토큰 초과로 잘린 응답을 복구한다.
 */
export function extractJson(text: string): string {
  let json: string;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    json = extractBalancedSlice(text);
  }

  try {
    JSON.parse(json);
    return json;
  } catch {
    return repairTruncatedJson(json);
  }
}

/**
 * 첫 여는 `{`/`[`부터 이스케이프 인지 스캔으로 괄호 균형이 0으로 돌아오는
 * 지점까지를 추출한다. 탐욕적 정규식(첫 `{` ~ 마지막 `}`)과 달리 문자열 값
 * 안의 괄호나 JSON 뒤에 오는 산문의 괄호에 오염되지 않는다.
 * 균형이 끝까지 안 맞으면(절단된 응답) 문자열 끝까지 반환하고,
 * 여는 괄호가 없으면 전체를 trim해 반환한다.
 */
function extractBalancedSlice(text: string): string {
  const start = text.search(/[{[]/);
  if (start === -1) return text.trim();

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/** 이스케이프 인지 단일 전방 스캔 결과 */
interface JsonScan {
  /** 입력 끝에서 문자열 내부인지 (미종결 따옴표) */
  inString: boolean;
  /** 문자열 밖 마지막 구조 문자(`,` `{` `[`)의 인덱스. 없으면 -1 */
  lastSafeCut: number;
  /** 닫히지 않은 여는 괄호들 (여는 순서대로) */
  openStack: string[];
}

function scanJson(text: string): JsonScan {
  const openStack: string[] = [];
  let inString = false;
  let escape = false;
  let lastSafeCut = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      openStack.push(ch);
      lastSafeCut = i;
      continue;
    }
    if (ch === '}' || ch === ']') {
      openStack.pop();
      continue;
    }
    if (ch === ',') lastSafeCut = i;
  }

  return { inString, lastSafeCut, openStack };
}

/**
 * 토큰 초과로 잘린 JSON 문자열을 복구한다.
 *
 * 알고리즘 (모든 단계가 이스케이프 인지 스캔 기반 — 따옴표 개수 세기 아님):
 *   1. 문자열 중간에서 잘렸으면 마지막 안전 지점(문자열 밖 `,` `{` `[`)까지
 *      잘라 미완성 키/값 전체를 제거
 *   2. 마지막 `}`/`]` 뒤 잔여물이 `,`로 시작하면 잘라냄
 *   3. 미완성 꼬리를 반복 제거: 콜론 없는 단독 키(`"summary"`), 값이 미완성인
 *      키-값 쌍(`"b": tr`, `"b": `), 미완성 배열 리터럴 원소(`[t`)를 잘라낸다.
 *      완전해 보이는 값(`85`, `true`)은 보존
 *   4. 트레일링 쉼표 제거
 *   5. 남은 여는 `{`/`[`를 역순으로 닫아 균형 맞춤
 */
export function repairTruncatedJson(json: string): string {
  let trimmed = json;

  // 1. 문자열 중간 절단 — 토큰 제한 절단의 가장 흔한 형태
  const scan = scanJson(trimmed);
  if (scan.inString && scan.lastSafeCut >= 0) {
    const cutCh = trimmed[scan.lastSafeCut];
    // `,`면 쉼표까지 제거, `{`/`[`면 여는 괄호는 보존
    trimmed =
      cutCh === ',' ? trimmed.slice(0, scan.lastSafeCut) : trimmed.slice(0, scan.lastSafeCut + 1);
  }

  // 2. 마지막 닫는 괄호 뒤 잔여물 제거 — 잘라낸 결과가 균형 잡힌(완결된)
  //    JSON일 때만 적용한다. 중첩 내부의 `]`/`}` 뒤에 오는 유효한 키-값
  //    (예: `..., "empty_arr": [], "value": 1`)을 잘라내지 않기 위함.
  const lastCloseBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(',')) {
      const candidate = trimmed.substring(0, lastCloseBrace + 1);
      if (scanJson(candidate).openStack.length === 0) {
        trimmed = candidate;
      }
    }
  }

  // 3. 미완성 꼬리를 반복 제거 (제거할 것이 없을 때까지)
  trimmed = stripIncompleteTail(trimmed);

  // 4. 트레일링 쉼표 제거
  trimmed = trimmed.replace(/,\s*$/, '');

  // 5. 재스캔으로 남은 여는 괄호를 역순으로 닫음
  const { openStack } = scanJson(trimmed);
  while (openStack.length > 0) {
    const open = openStack.pop();
    trimmed += open === '{' ? '}' : ']';
  }

  return trimmed;
}

/** 값 토큰이 완결된 JSON 값이면 true (`85`, `true`, `-1.5e3` 등) */
function isCompleteValueToken(token: string): boolean {
  if (token.length === 0) return false;
  try {
    JSON.parse(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * 미완성 꼬리를 반복 제거한다:
 *   - 콜론 없는 단독 키:        `{"a": 1, "b"`        → `{"a": 1, `
 *   - 값이 미완성인 키-값 쌍:   `{"a": 1, "b": tr`   → `{"a": 1, `
 *   - 미완성 배열 리터럴 원소:  `[1, 2, tr`          → `[1, 2, `
 * 완결된 값(`85`, `true`)은 보존한다. 트레일링 `,`는 이후 단계에서 정리된다.
 */
function stripIncompleteTail(input: string): string {
  let s = input;
  for (;;) {
    // 값이 미완성인 키-값 쌍 (`"b": tr`, `"b": `)
    const pair = s.match(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*([^,{}[\]\s"]*)\s*$/);
    if (pair && pair.index !== undefined && !isCompleteValueToken(pair[1])) {
      s = s.slice(0, pair.index);
      continue;
    }
    // 콜론 없는 단독 객체 키(`{"a": 1, "b"`) — 뒤에 값이 없으니 미완성.
    // 맨 끝 문자열이 값 위치(바로 앞이 `:`)면 완결된 값이므로 건드리지 않는다.
    // 앞이 `,`/`{`이면 컨테이너로 구분: 객체 안(`{"a":1, "b"`)이면 미완성 키,
    // 배열 안(`["a", "b"`)이면 완결된 원소이므로 보존한다.
    const bareKey = s.match(/([:{[,])\s*"(?:[^"\\]|\\.)*"\s*$/);
    if (bareKey && bareKey.index !== undefined) {
      const prevCh = bareKey[1];
      const container = scanJson(s.slice(0, bareKey.index + 1)).openStack.at(-1);
      const isObjectKey = prevCh === '{' || (prevCh === ',' && container === '{');
      if (isObjectKey) {
        s = s.slice(0, bareKey.index + (prevCh === '{' ? 1 : 0)).replace(/,\s*$/, '');
        continue;
      }
    }
    // 미완성 배열 리터럴 원소 (여는 `[`/`,` 뒤 미완성 토큰)
    const elem = s.match(/([[,])\s*([^,{}[\]\s"]+)\s*$/);
    if (elem && elem.index !== undefined && !isCompleteValueToken(elem[2])) {
      // 여는 괄호/쉼표는 보존하고 미완성 토큰만 제거
      s = s.slice(0, elem.index + elem[1].length);
      continue;
    }
    return s;
  }
}

/** tryParseAndValidate 결과 — 실패 시 원인(reason)을 보존한다 */
export type ParseValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

/** Zod 에러에서 `필드: 사유` 요약을 뽑는다. v3·v4 모두 `issues[]` 형태가 같다. */
function summarizeIssues(error: unknown): string | undefined {
  const issues: unknown = (error as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;
  return issues
    .map((i) => {
      const { path, message } = i as { path?: readonly PropertyKey[]; message?: string };
      return `${(path ?? []).map(String).join('.')}: ${message ?? '검증 실패'}`;
    })
    .join(', ');
}

/**
 * JSON 추출 → 파싱 → 스키마 검증.
 * 실패 시 `{ ok: false, reason }`으로 원인을 호출자에게 전달한다
 * (JSON.parse 에러 메시지 또는 검증 issue 요약).
 *
 * 검증은 `safeParse` 직접 호출이 아니라 AI SDK의 `asSchema().validate`를 거친다 —
 * zod v3·v4를 한 경로로 다루기 위해서다. 반환 에러는 여전히 ZodError이므로
 * `issues` 기반 요약은 그대로 유지된다.
 */
export async function tryParseAndValidate<T>(
  text: string,
  schema: FlexibleSchema<T>,
): Promise<ParseValidateResult<T>> {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: '빈 응답' };
  }

  const jsonStr = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      ok: false,
      reason: `JSON.parse 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const validate = asSchema(schema).validate;
  if (!validate) {
    // 검증기 없는 스키마(JSON Schema만 가진 Schema 등)를 조용히 통과시키지 않는다.
    return { ok: false, reason: '스키마에 validate가 없어 검증할 수 없음' };
  }

  const validated = await validate(parsed);
  if (!validated.success) {
    const reason = summarizeIssues(validated.error) ?? validated.error.message;
    return { ok: false, reason: `Zod 검증 실패: ${reason}` };
  }
  return { ok: true, data: validated.value };
}
