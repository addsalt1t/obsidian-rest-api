export type ParityTier = 'core' | 'optional';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ParityEntry {
  id: string;
  tier: ParityTier;
  rest: {
    method: HttpMethod;
    path: string;
    openApiPath: string;
  };
  mcp?: {
    namespace: string;
    method: string;
  };
}

export const PARITY_CATALOG: readonly ParityEntry[] = [
  {
    id: 'vault.listAll',
    tier: 'core',
    rest: { method: 'GET', path: '/vault/:path', openApiPath: '/vault/{path}' },
    mcp: { namespace: 'vault', method: 'listAll' },
  },
  {
    id: 'vault.batchRead',
    tier: 'core',
    rest: { method: 'POST', path: '/batch/read', openApiPath: '/batch/read' },
    mcp: { namespace: 'vault', method: 'batchRead' },
  },
  {
    id: 'search.text',
    tier: 'core',
    rest: { method: 'POST', path: '/search/simple/', openApiPath: '/search/simple/' },
    mcp: { namespace: 'search', method: 'search' },
  },
  {
    id: 'search.jsonLogic',
    tier: 'core',
    rest: { method: 'POST', path: '/search/', openApiPath: '/search/' },
    mcp: { namespace: 'search', method: 'jsonLogicQuery' },
  },
  {
    id: 'tags.list',
    tier: 'core',
    rest: { method: 'GET', path: '/tags', openApiPath: '/tags' },
    mcp: { namespace: 'metadata', method: 'getTags' },
  },
  {
    id: 'tags.files',
    tier: 'core',
    rest: { method: 'GET', path: '/tags/:tag/files', openApiPath: '/tags/{tag}/files' },
    mcp: { namespace: 'search', method: 'searchByTag' },
  },
  {
    id: 'metadata.file',
    tier: 'core',
    rest: { method: 'GET', path: '/metadata/{path}', openApiPath: '/metadata/{path}' },
    mcp: { namespace: 'vault', method: 'getFileMetadata' },
  },
  {
    id: 'commands.list',
    tier: 'core',
    rest: { method: 'GET', path: '/commands', openApiPath: '/commands' },
    mcp: { namespace: 'commands', method: 'listCommands' },
  },
  {
    id: 'active.read',
    tier: 'core',
    rest: { method: 'GET', path: '/active', openApiPath: '/active' },
    mcp: { namespace: 'activeFile', method: 'getActiveFile' },
  },
  {
    id: 'dataview.query',
    tier: 'optional',
    rest: { method: 'POST', path: '/search/', openApiPath: '/search/' },
    mcp: { namespace: 'search', method: 'dataviewQuery' },
  },
  {
    id: 'periodic.daily',
    tier: 'optional',
    rest: { method: 'GET', path: '/periodic/daily/', openApiPath: '/periodic/{period}' },
    mcp: { namespace: 'periodicNotes', method: 'getPeriodicNote' },
  },
  {
    id: 'graph.orphans',
    tier: 'optional',
    rest: { method: 'GET', path: '/graph/orphans', openApiPath: '/graph/orphans' },
    mcp: { namespace: 'graph', method: 'getOrphans' },
  },
  {
    id: 'autolink.scan',
    tier: 'optional',
    rest: { method: 'POST', path: '/autolink/scan', openApiPath: '/autolink/scan' },
    mcp: { namespace: 'autolink', method: 'scan' },
  },
  {
    id: 'vector.status',
    tier: 'optional',
    rest: { method: 'GET', path: '/vector/status', openApiPath: '/vector/status' },
    mcp: { namespace: 'vector', method: 'getEmbeddingStatus' },
  },
];
