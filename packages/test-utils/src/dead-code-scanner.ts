import * as fs from 'fs';
import * as path from 'path';

export interface DeadCodeScanConfig {
  srcDir: string;
  testsDir: string;
  entryPoints: string[];
  exportOnlyFiles: ExportOnlyRule[];
}

export interface ExportOnlyRule {
  file: string;
  reason: string;
}

export interface UnusedExport {
  file: string;
  symbol: string;
}

export interface DeadCodeScanResult {
  unusedFiles: string[];
  unusedExports: UnusedExport[];
  staleAllowlistEntries: string[];
  circularDependencies: string[][];
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeRelative(srcDir: string, filePath: string): string {
  return toPosixPath(path.relative(srcDir, filePath));
}

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function resolveModulePath(baseDir: string, modulePath: string): string | null {
  const withoutJs = modulePath.replace(/\.js$/, '');
  const fullPath = path.resolve(baseDir, withoutJs);

  const fileCandidate = `${fullPath}.ts`;
  if (fs.existsSync(fileCandidate)) {
    return fileCandidate;
  }

  const indexCandidate = path.join(fullPath, 'index.ts');
  if (fs.existsSync(indexCandidate)) {
    return indexCandidate;
  }

  return null;
}

function parseNamedBindings(bindings: string): string[] {
  const noComments = bindings.replace(/\/\/[^\n]*/g, '');

  return noComments
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const parts = token.split(/\s+as\s+/);
      return (parts[0] || '').trim();
    })
    .filter((token) => token.length > 0);
}

function addImport(
  imports: Map<string, string[]>,
  importedFile: string,
  symbols: string[]
): void {
  const existing = imports.get(importedFile) || [];
  const merged = [...existing, ...symbols];
  imports.set(importedFile, Array.from(new Set(merged)));
}

function parseImportSymbols(clause: string): string[] {
  const trimmed = clause.trim();
  const withoutTypeKeyword = trimmed.startsWith('type ') ? trimmed.slice('type '.length).trim() : trimmed;
  if (!trimmed) {
    return [];
  }

  if (!withoutTypeKeyword) {
    return [];
  }

  if (withoutTypeKeyword.startsWith('* as ')) {
    return ['*'];
  }

  if (withoutTypeKeyword.startsWith('{') && withoutTypeKeyword.endsWith('}')) {
    return parseNamedBindings(withoutTypeKeyword.slice(1, -1));
  }

  const commaIndex = withoutTypeKeyword.indexOf(',');
  if (commaIndex !== -1) {
    const defaultPart = withoutTypeKeyword.slice(0, commaIndex).trim();
    const namedPart = withoutTypeKeyword.slice(commaIndex + 1).trim();
    const symbols: string[] = [];

    if (defaultPart) {
      symbols.push('default');
    }

    if (namedPart.startsWith('{') && namedPart.endsWith('}')) {
      symbols.push(...parseNamedBindings(namedPart.slice(1, -1)));
    } else if (namedPart.startsWith('* as ')) {
      symbols.push('*');
    }

    return symbols;
  }

  // import foo from './bar'
  return ['default'];
}

type PathResolver = (dir: string, modulePath: string) => string | null;

function processImportFromStatements(
  content: string,
  dir: string,
  srcDir: string,
  resolvePath: PathResolver,
  options?: { skipTypeOnly?: boolean }
): Map<string, string[]> {
  const imports = new Map<string, string[]>();
  const importFromRegex = /import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importFromRegex.exec(content)) !== null) {
    const clause = match[1] || '';
    const modulePath = match[2] || '';
    const trimmedClause = clause.trim();

    if (options?.skipTypeOnly && trimmedClause.startsWith('type ')) {
      continue;
    }

    const actualPath = resolvePath(dir, modulePath);
    if (!actualPath) {
      continue;
    }

    const relativePath = normalizeRelative(srcDir, actualPath);
    addImport(imports, relativePath, parseImportSymbols(clause));
  }

  return imports;
}

interface ExtractImportOptions {
  includeTypeOnly: boolean;
}

function extractImports(
  filePath: string,
  srcDir: string,
  options: ExtractImportOptions
): Map<string, string[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const dir = path.dirname(filePath);

  const srcResolvePath: PathResolver = (d, modulePath) => {
    if (!modulePath.startsWith('.')) {
      return null;
    }
    return resolveModulePath(d, modulePath);
  };

  const imports = processImportFromStatements(
    content,
    dir,
    srcDir,
    srcResolvePath,
    { skipTypeOnly: !options.includeTypeOnly }
  );

  let match: RegExpExecArray | null;

  // side-effect import: import './module'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(content)) !== null) {
    const modulePath = match[1] || '';
    if (!modulePath.startsWith('.')) {
      continue;
    }

    const actualPath = resolveModulePath(dir, modulePath);
    if (!actualPath) {
      continue;
    }

    const relativePath = normalizeRelative(srcDir, actualPath);
    addImport(imports, relativePath, []);
  }

  const typeImportRegex = /import\s+type\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  if (options.includeTypeOnly) {
    while ((match = typeImportRegex.exec(content)) !== null) {
      const namedImports = match[1] || '';
      const modulePath = match[2] || '';

      if (!modulePath.startsWith('.')) {
        continue;
      }

      const actualPath = resolveModulePath(dir, modulePath);
      if (!actualPath) {
        continue;
      }

      const relativePath = normalizeRelative(srcDir, actualPath);
      addImport(imports, relativePath, parseNamedBindings(namedImports));
    }
  }

  const reexportNamedRegex = /export\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reexportNamedRegex.exec(content)) !== null) {
    const exportedBindings = match[1] || '';
    const modulePath = match[2] || '';

    if (!modulePath.startsWith('.')) {
      continue;
    }

    const actualPath = resolveModulePath(dir, modulePath);
    if (!actualPath) {
      continue;
    }

    const relativePath = normalizeRelative(srcDir, actualPath);
    addImport(imports, relativePath, parseNamedBindings(exportedBindings));
  }

  if (options.includeTypeOnly) {
    const reexportTypeRegex = /export\s+type\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = reexportTypeRegex.exec(content)) !== null) {
      const exportedBindings = match[1] || '';
      const modulePath = match[2] || '';

      if (!modulePath.startsWith('.')) {
        continue;
      }

      const actualPath = resolveModulePath(dir, modulePath);
      if (!actualPath) {
        continue;
      }

      const relativePath = normalizeRelative(srcDir, actualPath);
      addImport(imports, relativePath, parseNamedBindings(exportedBindings));
    }
  }

  const reexportStarRegex = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reexportStarRegex.exec(content)) !== null) {
    const modulePath = match[1] || '';

    if (!modulePath.startsWith('.')) {
      continue;
    }

    const actualPath = resolveModulePath(dir, modulePath);
    if (!actualPath) {
      continue;
    }

    const relativePath = normalizeRelative(srcDir, actualPath);
    addImport(imports, relativePath, ['*']);
  }

  return imports;
}

function extractTestImports(testsDir: string, srcDir: string): Map<string, string[]>[] {
  const testFiles = getAllTsFiles(testsDir);
  const testImports: Map<string, string[]>[] = [];

  const testResolvePath: PathResolver = (dir, modulePath) => {
    if (modulePath.startsWith('.')) {
      const resolved = resolveModulePath(dir, modulePath);
      if (resolved && (resolved === srcDir || resolved.startsWith(`${srcDir}${path.sep}`))) {
        return resolved;
      }
      return null;
    }

    if (modulePath.includes('/src/')) {
      const srcMatch = modulePath.match(/\/src\/(.+)$/);
      if (srcMatch) {
        let relativePath = srcMatch[1];
        relativePath = relativePath.replace(/\.js$/, '');
        if (!relativePath.endsWith('.ts')) {
          relativePath = `${relativePath}.ts`;
        }

        const fullPath = path.join(srcDir, relativePath);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    return null;
  };

  for (const testFile of testFiles) {
    const content = fs.readFileSync(testFile, 'utf-8');
    const dir = path.dirname(testFile);

    const imports = processImportFromStatements(
      content,
      dir,
      srcDir,
      testResolvePath
    );

    testImports.push(imports);
  }

  return testImports;
}

function extractExports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exports: string[] = [];

  const namedExportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  const bracketExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = bracketExportRegex.exec(content)) !== null) {
    const names = match[1].split(',').map((token) => {
      const parts = token.trim().split(/\s+as\s+/);
      return (parts[parts.length - 1] || '').trim();
    });
    exports.push(...names.filter((name) => name.length > 0 && name !== 'default'));
  }

  if (/export\s+default\s+/.test(content)) {
    exports.push('default');
  }

  return Array.from(new Set(exports));
}

function getReachableFiles(
  entryPoints: string[],
  srcDir: string,
  importsByFile: Map<string, Map<string, string[]>>
): Set<string> {
  const reachable = new Set<string>();
  const queue = entryPoints.map((entryPoint) => toPosixPath(entryPoint));

  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (!relativePath) {
      continue;
    }

    if (reachable.has(relativePath)) {
      continue;
    }

    const fullPath = path.join(srcDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    reachable.add(relativePath);

    const imports = importsByFile.get(relativePath);
    if (!imports) {
      continue;
    }

    for (const importedFile of imports.keys()) {
      if (!reachable.has(importedFile)) {
        queue.push(importedFile);
      }
    }
  }

  return reachable;
}

function findCircularDependencies(
  importsByFile: Map<string, Map<string, string[]>>
): string[][] {
  const dependencyGraph = new Map<string, Set<string>>();

  for (const [file, imports] of importsByFile) {
    dependencyGraph.set(file, new Set(imports.keys()));
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const currentPath: string[] = [];

  function dfs(node: string): void {
    if (stack.has(node)) {
      const cycleStart = currentPath.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(currentPath.slice(cycleStart));
      }
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    stack.add(node);
    currentPath.push(node);

    const deps = dependencyGraph.get(node) || new Set<string>();
    for (const dep of deps) {
      dfs(dep);
    }

    currentPath.pop();
    stack.delete(node);
  }

  for (const file of dependencyGraph.keys()) {
    dfs(file);
  }

  return cycles;
}

export function scanDeadCode(config: DeadCodeScanConfig): DeadCodeScanResult {
  const allFiles = getAllTsFiles(config.srcDir);
  const allRelativeFiles = allFiles.map((file) => normalizeRelative(config.srcDir, file));

  const importsByFile = new Map<string, Map<string, string[]>>();
  for (const file of allFiles) {
    const relativePath = normalizeRelative(config.srcDir, file);
    importsByFile.set(relativePath, extractImports(file, config.srcDir, { includeTypeOnly: true }));
  }

  const runtimeImportsByFile = new Map<string, Map<string, string[]>>();
  for (const file of allFiles) {
    const relativePath = normalizeRelative(config.srcDir, file);
    runtimeImportsByFile.set(relativePath, extractImports(file, config.srcDir, { includeTypeOnly: false }));
  }

  const reachableFiles = getReachableFiles(config.entryPoints, config.srcDir, importsByFile);
  const unusedFiles = allRelativeFiles.filter((file) => !reachableFiles.has(file));

  const importedSymbols = new Map<string, Set<string>>();

  for (const [ownerFile, imports] of importsByFile) {
    for (const [importedFile, symbols] of imports) {
      if (ownerFile === importedFile) {
        continue;
      }

      const existing = importedSymbols.get(importedFile) || new Set<string>();
      for (const symbol of symbols) {
        existing.add(symbol);
      }
      importedSymbols.set(importedFile, existing);
    }
  }

  const testImports = extractTestImports(config.testsDir, config.srcDir);
  for (const imports of testImports) {
    for (const [importedFile, symbols] of imports) {
      const existing = importedSymbols.get(importedFile) || new Set<string>();
      for (const symbol of symbols) {
        existing.add(symbol);
      }
      importedSymbols.set(importedFile, existing);
    }
  }

  const exportOnlySet = new Set(config.exportOnlyFiles.map((rule) => toPosixPath(rule.file)));
  const entryPointSet = new Set(config.entryPoints.map((file) => toPosixPath(file)));

  const unusedExports: UnusedExport[] = [];

  for (const file of allFiles) {
    const relativePath = normalizeRelative(config.srcDir, file);

    if (entryPointSet.has(relativePath) || exportOnlySet.has(relativePath)) {
      continue;
    }

    const exports = extractExports(file);
    const imported = importedSymbols.get(relativePath) || new Set<string>();

    for (const symbol of exports) {
      if (!imported.has(symbol) && !imported.has('*')) {
        unusedExports.push({ file: relativePath, symbol });
      }
    }
  }

  const staleAllowlistEntries = config.exportOnlyFiles
    .map((rule) => toPosixPath(rule.file))
    .filter((file) => !allRelativeFiles.includes(file));

  return {
    unusedFiles,
    unusedExports,
    staleAllowlistEntries,
    circularDependencies: findCircularDependencies(runtimeImportsByFile),
  };
}
