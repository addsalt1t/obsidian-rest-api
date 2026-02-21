import { App, Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ExtendedRestApiPlugin from './main';
import { generateApiKey } from './utils/crypto';
import {
  DEFAULT_PORT,
  DEFAULT_CORS_ORIGINS,
  SERVER_HOST,
} from './constants';

export { generateApiKey };

function confirmDialog(app: App, title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const modal = new Modal(app);
    modal.titleEl.setText(title);
    modal.contentEl.createEl('p', { text: message });

    new Setting(modal.contentEl)
      .addButton(button => {
        button.setButtonText('Cancel');
        button.onClick(() => {
          resolved = true;
          resolve(false);
          modal.close();
        });
      })
      .addButton(button => {
        button.setButtonText('Generate');
        button.setWarning();
        button.onClick(() => {
          resolved = true;
          resolve(true);
          modal.close();
        });
      });

    modal.onClose = () => { if (!resolved) resolve(false); };
    modal.open();
  });
}

export interface ExtendedRestApiSettings {
  port: number;
  apiKey: string;
  enableHttps: boolean;
  corsOrigins: string;
}

export const DEFAULT_SETTINGS: ExtendedRestApiSettings = {
  port: DEFAULT_PORT,
  apiKey: '',
  enableHttps: true,
  corsOrigins: DEFAULT_CORS_ORIGINS.join(','),
};

export class ExtendedRestApiSettingTab extends PluginSettingTab {
  plugin: ExtendedRestApiPlugin;
  private isKeyVisible = false;

  constructor(app: App, plugin: ExtendedRestApiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    // 서버 상태 표시
    const statusEl = containerEl.createDiv({ cls: 'setting-item' });
    const statusDesc = statusEl.createDiv({ cls: 'setting-item-info' });
    statusDesc.createDiv({ cls: 'setting-item-name', text: 'Server status' });
    const serverRunning = this.plugin.isServerRunning();
    statusDesc.createDiv({
      cls: 'setting-item-description',
      text: serverRunning
        ? `✅ Running on ${this.plugin.settings.enableHttps ? 'https' : 'http'}://${SERVER_HOST}:${this.plugin.settings.port}`
        : '❌ Not running'
    });

    // 포트 설정
    new Setting(containerEl)
      .setName('Port')
      .setDesc('Port number for the REST API server (requires restart)')
      .addText(text => text
        .setPlaceholder(String(DEFAULT_PORT))
        .setValue(String(this.plugin.settings.port))
        .onChange(async (value) => {
          const port = parseInt(value, 10);
          if (!isNaN(port) && port > 0 && port < 65536) {
            this.plugin.settings.port = port;
            await this.plugin.saveSettings();
          }
        }));

    // API 키 설정
    const apiKeySetting = new Setting(containerEl)
      .setName('API key')
      .setDesc('Bearer token for authentication');
    apiKeySetting.settingEl.addClass('extended-rest-api-key-setting');
    apiKeySetting
      .addText(text => {
        text
          .setPlaceholder('Your API key')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = this.isKeyVisible ? 'text' : 'password';
        text.inputEl.addClass('extended-rest-api-input-wide');
      })
      .addButton(button => {
        button.setButtonText(this.isKeyVisible ? 'Hide' : 'Show');
        button.onClick(() => {
          this.isKeyVisible = !this.isKeyVisible;
          this.display();
        });
      })
      .addButton(button => {
        button.setButtonText('Generate');
        button.onClick(async () => {
          if (this.plugin.settings.apiKey) {
            const confirmed = await confirmDialog(
              this.app,
              'Generate new API key?',
              'The current key will be replaced. Any clients using the old key will need to be updated.'
            );
            if (!confirmed) return;
          }
          this.plugin.settings.apiKey = generateApiKey();
          await this.plugin.saveSettings();
          this.isKeyVisible = false;
          this.display();
        });
      })
      .addButton(button => {
        button.setButtonText('Copy');
        button.onClick(async () => {
          await navigator.clipboard.writeText(this.plugin.settings.apiKey);
          new Notice('API key copied to clipboard');
        });
      });

    // HTTPS 설정
    new Setting(containerEl)
      .setName('Enable HTTPS')
      .setDesc('Use HTTPS with self-signed certificate (requires restart)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableHttps)
        .onChange(async (value) => {
          this.plugin.settings.enableHttps = value;
          await this.plugin.saveSettings();
        }));

    // CORS 설정
    new Setting(containerEl)
      .setName('CORS origins')
      .setDesc('Allowed origins for CORS (comma-separated). Default: localhost only')
      .addText(text => text
        .setPlaceholder('*')
        .setValue(this.plugin.settings.corsOrigins)
        .onChange(async (value) => {
          this.plugin.settings.corsOrigins = value;
          await this.plugin.saveSettings();
        }));

    // 서버 재시작 버튼
    new Setting(containerEl)
      .setName('Restart server')
      .setDesc('Apply changes by restarting the server')
      .addButton(button => {
        button.setButtonText('Restart');
        button.onClick(async () => {
          button.setButtonText('Restarting...');
          button.setDisabled(true);
          try {
            await this.plugin.restartServer();
          } finally {
            this.display();
          }
        });
      });

    // API 문서 링크
    const protocol = this.plugin.settings.enableHttps ? 'https' : 'http';
    const docsUrl = `${protocol}://${SERVER_HOST}:${this.plugin.settings.port}/docs`;

    new Setting(containerEl)
      .setName('Available endpoints')
      .setHeading();

    const docsLink = containerEl.createEl('p', { cls: 'setting-item-description' });
    docsLink.appendText('Full interactive documentation: ');
    docsLink.createEl('a', { text: docsUrl, href: docsUrl });

    const list = containerEl.createEl('ul');
    const endpoints: [string, string][] = [
      ['Vault', 'GET/PUT/POST/PATCH/DELETE /vault/{path}, move, rename'],
      ['Active file', 'GET/PUT/POST/PATCH/DELETE /active/'],
      ['Periodic notes', 'GET/PUT/POST/PATCH /periodic/{period}/'],
      ['Batch', 'POST /batch/read, write, metadata, delete'],
      ['Search', 'POST /search/, simple, glob, jsonlogic'],
      ['Dataview', 'POST /dataview/list, table, task, query'],
      ['Tags', 'GET /tags/, /tags/:tag/files'],
      ['Metadata', 'GET /metadata/{path}'],
      ['Graph', 'GET /graph/links, backlinks, orphans, hubs'],
      ['Commands', 'GET/POST /commands/'],
      ['Autolink', 'POST /autolink/scan, linkify'],
      ['Vector', 'GET /vector/status, POST /vector/embed, search'],
    ];
    for (const [category, desc] of endpoints) {
      const li = list.createEl('li');
      li.createEl('strong', { text: category });
      li.appendText(` — ${desc}`);
    }
  }
}
