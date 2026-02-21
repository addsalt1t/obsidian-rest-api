/**
 * Periodic Notes 관련 타입 정의
 */

/** 주기적 노트 기간 유형 */
export type PeriodicNotePeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** 주기적 노트 날짜 지정 */
export interface PeriodicNoteDate {
  /** 연도 */
  year: number;
  /** 월 (1-12) */
  month?: number;
  /** 일 (1-31) */
  day?: number;
}
