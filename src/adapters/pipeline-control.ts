/**
 * 파이프라인 제어 인터페이스 — 취소/일시정지/비용 한도 검사를
 * 분리 패키지가 호출할 수 있도록 추상화한다.
 *
 * ai-signalcraft는 DB 기반 구현체를 주입하고,
 * 다른 프로젝트는 noopPipelineControl만 써도 정상 동작한다.
 */
export interface PipelineControlAdapter {
  isCancelled(jobId: number): Promise<boolean>;
  waitIfPaused(jobId: number): Promise<void>;
  /** true 면 진행 가능, false 면 비용 한도 초과로 중단 */
  checkCostLimit(jobId: number, additionalEstimatedCost?: number): Promise<boolean>;
  /** 모듈 진행 이벤트 기록 (info / warn / error) */
  appendEvent(
    jobId: number,
    level: 'info' | 'warn' | 'error',
    message: string,
  ): Promise<void>;
}

export const noopPipelineControl: PipelineControlAdapter = {
  async isCancelled() {
    return false;
  },
  async waitIfPaused() {
    /* noop */
  },
  async checkCostLimit() {
    return true;
  },
  async appendEvent() {
    /* noop */
  },
};
