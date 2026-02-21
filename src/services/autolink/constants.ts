/**
 * Autolink service constants
 */

/** Korean particle pattern (matches particles appended after entity names) */
export const KO_PARTICLES = '가|를|은|는|의|와|과|야|이|에게|에서|로|으로|도|만|까지|부터|라고|이라고|라는|이라는';

/** Match context window size (before) */
export const CONTEXT_WINDOW_BEFORE = 25;

/** Match context window size (after) */
export const CONTEXT_WINDOW_AFTER = 25;

/** Maximum number of aliases per entity */
export const MAX_ALIASES = 20;
