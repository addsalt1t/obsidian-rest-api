import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import https from 'https';
import http from 'http';
import forge from 'node-forge';
import { App } from 'obsidian';
import { createAuthMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { createTagsRouter } from './routes/tags';
import { createDataviewRouter } from './routes/dataview';
import { createVaultRouter, createFolderRouter, createMoveRenameRouter } from './routes/vault';
import { createSearchRouter } from './routes/search';
import { createActiveRouter } from './routes/active';
import { createPeriodicRouter } from './routes/periodic';
import { createCommandsRouter, createOpenRouter } from './routes/commands';
import { createGraphRouter } from './routes/graph';
import { createBatchRouter } from './routes/batch';
import { createMetadataRouter } from './routes/metadata';
import { createOpenApiRouter } from './routes/openapi';
import { createAutolinkRouter } from './routes/autolink';
import { createVectorRouter } from './routes/vector';
import type { CorsOptions } from 'cors';
import type { ExtendedRestApiSettings } from './settings';
import { createLogger } from './utils/logger';
import {
  SERVER_HOST,
  LOCALHOST,
  RSA_KEY_SIZE,
  CERT_VALIDITY_YEARS,
  CERT_ORG_NAME,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  JSON_BODY_LIMIT,
  TEXT_BODY_LIMIT,
  API_VERSION,
  HTTP_STATUS,
  ERROR_CODE,
  ERROR_MSG,
  MIME_TYPE,
  HTTP_HEADER,
  HTTP_METHODS,
  DEFAULT_CORS_ORIGINS,
} from './constants';

export interface Server {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

const serverLogger = createLogger('Server');
const corsLogger = createLogger('CORS');

/**
 * CORS origin 설정 파싱 및 검증
 * - 와일드카드 '*' 사용 시 경고 로깅
 * - 유효하지 않은 origin 필터링
 */
function parseCorsOrigins(corsOrigins: string): CorsOptions['origin'] {
  const trimmed = corsOrigins.trim();

  // 빈 문자열이면 기본 localhost origins 사용
  if (!trimmed) {
    corsLogger.info('CORS origin 미설정 - 기본 localhost origins 사용');
    return [...DEFAULT_CORS_ORIGINS];
  }

  // 와일드카드 처리 - 보안 경고와 함께 기본값으로 대체
  if (trimmed === '*') {
    corsLogger.warn('⚠️ 와일드카드(*) origin은 보안상 권장되지 않습니다 - 기본 localhost origins로 대체됨');
    corsLogger.warn('⚠️ 외부 접근이 필요하면 명시적 origin 목록을 설정하세요 (예: http://localhost:3000,https://myapp.com)');
    return [...DEFAULT_CORS_ORIGINS];
  }

  // origin 목록 파싱 및 검증
  const origins = trimmed.split(',')
    .map(s => s.trim())
    .filter(origin => {
      if (!origin) return false;

      // URL 형식 검증 (http:// 또는 https://로 시작해야 함)
      if (!/^https?:\/\//i.test(origin)) {
        corsLogger.warn(`⚠️ 유효하지 않은 origin 무시됨: "${origin}" (http:// 또는 https://로 시작해야 함)`);
        return false;
      }

      try {
        new URL(origin);
        return true;
      } catch {
        corsLogger.warn(`⚠️ 유효하지 않은 origin 무시됨: "${origin}"`);
        return false;
      }
    });

  if (origins.length === 0) {
    corsLogger.warn('⚠️ 유효한 origin이 없음 - 기본값 사용');
    return [...DEFAULT_CORS_ORIGINS];
  }

  return origins;
}

// 자체 서명 인증서 동적 생성
function generateSelfSignedCert(): { key: string; cert: string } {
  const keys = forge.pki.rsa.generateKeyPair(RSA_KEY_SIZE);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16) + Math.floor(Math.random() * 0xFFFF).toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + CERT_VALIDITY_YEARS);

  const attrs = [
    { name: 'commonName', value: LOCALHOST },
    { name: 'organizationName', value: CERT_ORG_NAME }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // localhost 및 127.0.0.1에 대한 SAN (Subject Alternative Name) 추가
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: LOCALHOST },  // DNS
        { type: 7, ip: SERVER_HOST }    // IP
      ]
    }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

export function createServer(
  obsidianApp: App,
  getSettings: () => ExtendedRestApiSettings
): Server {
  let httpServer: http.Server | https.Server | null = null;
  let running = false;

  const createExpressApp = (): Express => {
    const app = express();
    const settings = getSettings();

    // CORS 설정
    const corsOrigins = parseCorsOrigins(settings.corsOrigins);
    const corsOptions: cors.CorsOptions = {
      origin: corsOrigins,
      methods: [...HTTP_METHODS],
      allowedHeaders: [
        HTTP_HEADER.CONTENT_TYPE,
        HTTP_HEADER.AUTHORIZATION,
        HTTP_HEADER.ACCEPT,
        HTTP_HEADER.OPERATION,
        HTTP_HEADER.TARGET_TYPE,
        HTTP_HEADER.TARGET,
      ],
      // credentials 항상 활성화 (와일드카드 사용 불가로 안전)
      credentials: true,
    };
    app.use(cors(corsOptions));

    // 보안 헤더 설정 (localhost API 서버에 적합한 최소 설정)
    app.use(helmet({
      // CSP는 API 서버라 비활성화 (HTML 응답 없음)
      contentSecurityPolicy: false,
      // HSTS는 localhost라 비활성화
      strictTransportSecurity: false,
      // 기본 보안 헤더 활성화
      xContentTypeOptions: true,        // MIME 스니핑 방지
      xFrameOptions: { action: 'deny' }, // 클릭재킹 방지
      xPoweredBy: false,                // Express 버전 정보 숨김
    }));

    // Body 파싱 (크기 제한 적용 - DoS 방지)
    // JSON: 기본 application/json + Obsidian REST API의 커스텀 JSON 타입
    app.use(express.json({ type: [MIME_TYPE.JSON, MIME_TYPE.JSONLOGIC], limit: JSON_BODY_LIMIT }));
    // Text: markdown, plain text + Dataview DQL (마크다운 파일 전체 업로드 지원)
    app.use(express.text({ type: [MIME_TYPE.TEXT_MARKDOWN, MIME_TYPE.TEXT_PLAIN, MIME_TYPE.DATAVIEW_DQL], limit: TEXT_BODY_LIMIT }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: ERROR_MSG.TOO_MANY_REQUESTS }
    });
    app.use(limiter);

    // 헬스 체크 (인증 불필요)
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', version: API_VERSION });
    });

    // OpenAPI 문서 (인증 불필요)
    app.use('/', createOpenApiRouter());

    // 인증 미들웨어 (위의 라우트 이후에 적용)
    app.use(createAuthMiddleware(() => getSettings().apiKey));

    // 라우트 등록
    app.use('/tags', createTagsRouter(obsidianApp));
    app.use('/dataview', createDataviewRouter(obsidianApp));
    // 폴더/이동 라우터는 vault 라우터보다 먼저 등록 (더 구체적인 경로 우선)
    app.use('/vault/folder', createFolderRouter(obsidianApp));
    app.use('/vault', createMoveRenameRouter(obsidianApp));
    app.use('/vault', createVaultRouter(obsidianApp));
    app.use('/search', createSearchRouter(obsidianApp));
    app.use('/active', createActiveRouter(obsidianApp));
    app.use('/periodic', createPeriodicRouter(obsidianApp));
    app.use('/commands', createCommandsRouter(obsidianApp));
    app.use('/open', createOpenRouter(obsidianApp));
    app.use('/graph', createGraphRouter(obsidianApp));
    app.use('/batch', createBatchRouter(obsidianApp));
    app.use('/metadata', createMetadataRouter(obsidianApp));
    app.use('/autolink', createAutolinkRouter(obsidianApp));
    app.use('/vector', createVectorRouter(obsidianApp));

    // 404 핸들러
    app.use((_req, res) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_CODE.NOT_FOUND, message: ERROR_MSG.ENDPOINT_NOT_FOUND });
    });

    // 에러 핸들러
    app.use(errorHandler);

    return app;
  };

  return {
    async start(): Promise<void> {
      if (running) {
        serverLogger.info('Server is already running');
        return;
      }

      const settings = getSettings();
      const app = createExpressApp();

      return new Promise((resolve, reject) => {
        try {
          if (settings.enableHttps) {
            const { key, cert } = generateSelfSignedCert();
            httpServer = https.createServer({ key, cert }, app);
          } else {
            httpServer = http.createServer(app);
          }

          httpServer.listen(settings.port, SERVER_HOST, () => {
            running = true;
            const protocol = settings.enableHttps ? 'https' : 'http';
            serverLogger.info(`Started on ${protocol}://${SERVER_HOST}:${settings.port}`);
            resolve();
          });

          httpServer.on('error', (error: NodeJS.ErrnoException) => {
            running = false;
            if (error.code === 'EADDRINUSE') {
              serverLogger.error(`Port ${settings.port} is already in use`);
            }
            reject(error);
          });
        } catch (error) {
          running = false;
          reject(error);
        }
      });
    },

    async stop(): Promise<void> {
      if (!httpServer || !running) {
        return;
      }

      const SHUTDOWN_TIMEOUT_MS = 5000;

      return new Promise((resolve) => {
        const forceTimeout = setTimeout(() => {
          serverLogger.warn('Forced shutdown after timeout');
          // closeAllConnections is available in Node 18.2+
          (httpServer as http.Server & { closeAllConnections?: () => void })
            .closeAllConnections?.();
          running = false;
          httpServer = null;
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);

        httpServer!.close(() => {
          clearTimeout(forceTimeout);
          running = false;
          httpServer = null;
          serverLogger.info('Stopped');
          resolve();
        });
      });
    },

    isRunning(): boolean {
      return running;
    }
  };
}
