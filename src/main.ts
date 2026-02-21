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

    // Auto-generate API key if not set
    if (!this.settings.apiKey) {
      this.settings.apiKey = generateApiKey();
      await this.saveSettings();
    }

    // Add settings tab
    this.addSettingTab(new ExtendedRestApiSettingTab(this.app, this));

    // Create and start server
    this.server = createServer(this.app, () => this.settings);

    // Start server after Obsidian is fully loaded
    this.app.workspace.onLayoutReady(async () => {
      try {
        await this.server?.start();
        new Notice('Extended REST API server started');
      } catch (error) {
        logger.error('Failed to start server:', error);
        new Notice(`Failed to start Extended REST API server: ${toErrorMessage(error)}`);
      }
    });

    // Command: restart server
    this.addCommand({
      id: 'restart-server',
      name: 'Restart Extended REST API server',
      callback: async () => {
        await this.restartServer();
      }
    });

    // Command: copy API key
    this.addCommand({
      id: 'copy-api-key',
      name: 'Copy API key to clipboard',
      callback: async () => {
        await navigator.clipboard.writeText(this.settings.apiKey);
        new Notice('API key copied to clipboard');
      }
    });

    // Command: show server status
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
      // Recreate server instance (apply new settings)
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
