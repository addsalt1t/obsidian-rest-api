import { Notice, Plugin } from 'obsidian';
import { createServer, Server } from './server';
import {
  ExtendedRestApiSettings,
  DEFAULT_SETTINGS,
  ExtendedRestApiSettingTab,
  generateApiKey
} from './settings';
import { SERVER_HOST } from './constants';
import { disposeFileListCache } from './services/fileListCache';
import { clearGlobCache } from './routes/search';
import { disposeTagCache } from './services/tagCache';
import { disposeBacklinkCache } from './services/backlinkCache';
import { clearEmbeddingCache } from './services/vector';
import { createLogger } from './utils/logger';
import { toErrorMessage } from './utils/errors';

const logger = createLogger('Plugin');

export default class ExtendedRestApiPlugin extends Plugin {
  settings: ExtendedRestApiSettings = DEFAULT_SETTINGS;
  private server: Server | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // API 키가 없으면 자동 생성
    if (!this.settings.apiKey) {
      this.settings.apiKey = generateApiKey();
      await this.saveSettings();
    }

    // 설정 탭 추가
    this.addSettingTab(new ExtendedRestApiSettingTab(this.app, this));

    // 서버 생성 및 시작
    this.server = createServer(this.app, () => this.settings);

    // Obsidian이 완전히 로드된 후 서버 시작
    this.app.workspace.onLayoutReady(async () => {
      try {
        await this.server?.start();
        new Notice('Extended REST API server started');
      } catch (error) {
        logger.error('Failed to start server:', error);
        new Notice(`Failed to start Extended REST API server: ${toErrorMessage(error)}`);
      }
    });

    // 명령어: 서버 재시작
    this.addCommand({
      id: 'restart-server',
      name: 'Restart Extended REST API server',
      callback: async () => {
        await this.restartServer();
      }
    });

    // 명령어: API 키 복사
    this.addCommand({
      id: 'copy-api-key',
      name: 'Copy API key to clipboard',
      callback: async () => {
        await navigator.clipboard.writeText(this.settings.apiKey);
        new Notice('API key copied to clipboard');
      }
    });

    // 명령어: 서버 상태 표시
    this.addCommand({
      id: 'show-server-status',
      name: 'Show server status',
      callback: () => {
        const running = this.isServerRunning();
        const protocol = this.settings.enableHttps ? 'https' : 'http';
        if (running) {
          new Notice(`Server running on ${protocol}://${SERVER_HOST}:${this.settings.port}`);
        } else {
          new Notice('Server is not running');
        }
      }
    });
  }

  async onunload(): Promise<void> {
    try {
      await this.server?.stop();
    } finally {
      disposeFileListCache();
      clearGlobCache();
      disposeTagCache();
      disposeBacklinkCache();
      clearEmbeddingCache();
      new Notice('Extended REST API server stopped');
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async restartServer(): Promise<void> {
    try {
      await this.server?.stop();
      // 서버 인스턴스 재생성 (새 설정 반영)
      this.server = createServer(this.app, () => this.settings);
      await this.server.start();
      new Notice('Extended REST API server restarted');
    } catch (error) {
      logger.error('Failed to restart server:', error);
      new Notice(`Failed to restart server: ${toErrorMessage(error)}`);
    }
  }

  isServerRunning(): boolean {
    return this.server?.isRunning() ?? false;
  }
}
