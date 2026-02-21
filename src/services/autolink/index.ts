/**
 * Autolink service unified exports
 */
export { buildEntityPattern, extractEntitiesFromPaths, scan, linkify } from './autolink-service';
export { prepareEntityMatching } from './matcher';
export { runScanEngine, runLinkifyEngine } from './scan-engine';
export type { AutolinkEntityInternal, NameEntry } from './types';
export { KO_PARTICLES, CONTEXT_WINDOW_BEFORE, CONTEXT_WINDOW_AFTER, MAX_ALIASES } from './constants';
