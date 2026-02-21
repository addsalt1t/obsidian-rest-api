/**
 * Autolink 서비스 상수
 */

/** 한국어 조사 패턴 (엔티티명 뒤에 붙는 조사 매칭) */
export const KO_PARTICLES = '가|를|은|는|의|와|과|야|이|에게|에서|로|으로|도|만|까지|부터|라고|이라고|라는|이라는';

/** 매칭 컨텍스트 윈도우 크기 (앞) */
export const CONTEXT_WINDOW_BEFORE = 25;

/** 매칭 컨텍스트 윈도우 크기 (뒤) */
export const CONTEXT_WINDOW_AFTER = 25;

/** 엔티티당 최대 별칭 수 */
export const MAX_ALIASES = 20;
