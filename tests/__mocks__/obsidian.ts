// Mock for obsidian module in tests
export function normalizePath(path: string): string {
  // Basic implementation matching Obsidian's behavior
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

interface MockMomentInput {
  year?: number;
  month?: number;
  day?: number;
}

function toIsoWeek(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function moment(input?: MockMomentInput): { format: (format: string) => string } {
  const date = input
    ? new Date(Date.UTC(input.year ?? 1970, input.month ?? 0, input.day ?? 1))
    : new Date();

  return {
    format(format: string): string {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();

      switch (format) {
        case 'YYYY-MM-DD':
          return `${year}-${pad2(month)}-${pad2(day)}`;
        case 'YYYY-[W]ww':
          return `${year}-W${pad2(toIsoWeek(date))}`;
        case 'YYYY-MM':
          return `${year}-${pad2(month)}`;
        case 'YYYY-[Q]Q':
          return `${year}-Q${Math.ceil(month / 3)}`;
        case 'YYYY':
          return `${year}`;
        default:
          return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    },
  };
}

export type TAbstractFile = TFile | TFolder;

export class TFile {
  path: string;
  name: string;
  extension: string;
  basename: string;
  stat: { size: number; ctime: number; mtime: number };
  vault: unknown;
  parent: TFolder | null;

  constructor(path: string, options?: { size?: number; ctime?: number; mtime?: number }) {
    this.path = path;
    const name = path.split('/').pop() || '';
    this.name = name;
    this.extension = name.includes('.') ? name.split('.').pop() || '' : '';
    this.basename = name.replace(/\.[^/.]+$/, '');
    this.stat = {
      size: options?.size ?? 100,
      ctime: options?.ctime ?? 1000,
      mtime: options?.mtime ?? 2000,
    };
    this.vault = {};
    this.parent = null;
  }
}

export class TFolder {
  path: string;
  name: string;
  children: TAbstractFile[];
  vault: unknown;
  parent: TFolder | null;

  constructor(path: string, children: TAbstractFile[] = []) {
    this.path = path;
    this.name = path.split('/').pop() || path || 'vault';
    this.children = children;
    this.vault = {};
    this.parent = null;

    // Set parent reference for children
    children.forEach((child) => {
      (child as TAbstractFile & { parent: unknown }).parent = this;
    });
  }

  isRoot() {
    return this.path === '' || this.path === '/';
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  loadData(): Promise<unknown> {
    return Promise.resolve({});
  }

  saveData(_data: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export interface App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;
}

export interface Vault {
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getMarkdownFiles(): TFile[];
  read(file: TFile): Promise<string>;
  modify(file: TFile, content: string): Promise<void>;
  create(path: string, content: string): Promise<TFile>;
  delete(file: TFile): Promise<void>;
}

export interface MetadataCache {
  resolvedLinks: Record<string, Record<string, number>>;
  getFileCache(file: TFile): CachedMetadata | null;
  getTags(): Record<string, number>;
}

export interface CachedMetadata {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{ tag: string }>;
  links?: Array<{ link: string }>;
}

export interface WorkspaceLeaf {
  openFile(file: TFile): Promise<void>;
}

export interface Workspace {
  getActiveFile(): TFile | null;
  getActiveViewOfType(type: unknown): unknown;
  getLeaf(newLeaf?: boolean): WorkspaceLeaf;
}

export class MarkdownView {
  file: TFile | null = null;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}

  setName(_name: string): this {
    return this;
  }

  setDesc(_desc: string): this {
    return this;
  }

  addText(_cb: (text: TextComponent) => void): this {
    return this;
  }

  addToggle(_cb: (toggle: ToggleComponent) => void): this {
    return this;
  }

  addDropdown(_cb: (dropdown: DropdownComponent) => void): this {
    return this;
  }
}

export interface TextComponent {
  setPlaceholder(placeholder: string): this;
  setValue(value: string): this;
  onChange(callback: (value: string) => void): this;
}

export interface ToggleComponent {
  setValue(value: boolean): this;
  onChange(callback: (value: boolean) => void): this;
}

export interface DropdownComponent {
  addOption(value: string, display: string): this;
  setValue(value: string): this;
  onChange(callback: (value: string) => void): this;
}

export function requestUrl(_options: unknown): Promise<{ json: unknown; text: string; status: number }> {
  return Promise.resolve({ json: {}, text: '', status: 200 });
}
