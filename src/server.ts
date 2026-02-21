import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
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
 * Parse and validate CORS origin configuration.
 * - Logs a warning when wildcard '*' is used
 * - Filters out invalid origins
 */
function parseCorsOrigins(corsOrigins: string): CorsOptions['origin'] {
  const trimmed = corsOrigins.trim();

  // Use default localhost origins if empty
  if (!trimmed) {
    corsLogger.info('No CORS origin configured - using default localhost origins');
    return [...DEFAULT_CORS_ORIGINS];
  }

  // Handle wildcard - replace with defaults along with a security warning
  if (trimmed === '*') {
    corsLogger.warn('Wildcard (*) origin is not recommended for security - falling back to default localhost origins');
    corsLogger.warn('If external access is needed, specify an explicit origin list (e.g., http://localhost:3000,https://myapp.com)');
    return [...DEFAULT_CORS_ORIGINS];
  }

  // Parse and validate origin list
  const origins = trimmed.split(',')
    .map(s => s.trim())
    .filter(origin => {
      if (!origin) return false;

      // Validate URL format (must start with http:// or https://)
      if (!/^https?:\/\//i.test(origin)) {
        corsLogger.warn(`Invalid origin ignored: "${origin}" (must start with http:// or https://)`);
        return false;
      }

      try {
        new URL(origin);
        return true;
      } catch {
        corsLogger.warn(`Invalid origin ignored: "${origin}"`);
        return false;
      }
    });

  if (origins.length === 0) {
    corsLogger.warn('No valid origins found - using defaults');
    return [...DEFAULT_CORS_ORIGINS];
  }

  return origins;
}

// Generate a self-signed certificate dynamically
function generateSelfSignedCert(): { key: string; cert: string } {
  const keys = forge.pki.rsa.generateKeyPair(RSA_KEY_SIZE);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = crypto.randomBytes(16).toString('hex');
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + CERT_VALIDITY_YEARS);

  const attrs = [
    { name: 'commonName', value: LOCALHOST },
    { name: 'organizationName', value: CERT_ORG_NAME }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Add SAN (Subject Alternative Name) for localhost and 127.0.0.1
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

    // CORS configuration
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
      // Always enable credentials (safe since wildcard is not used)
      credentials: true,
    };
    app.use(cors(corsOptions));

    // Security headers (minimal configuration suitable for a localhost API server)
    app.use(helmet({
      // Disable CSP since this is an API server (no HTML responses)
      contentSecurityPolicy: false,
      // Disable HSTS since this runs on localhost
      strictTransportSecurity: false,
      // Enable default security headers
      xContentTypeOptions: true,        // Prevent MIME sniffing
      xFrameOptions: { action: 'deny' }, // Prevent clickjacking
      xPoweredBy: false,                // Hide Express version info
    }));

    // Body parsing (with size limits to prevent DoS)
    // JSON: standard application/json + Obsidian REST API custom JSON types
    app.use(express.json({ type: [MIME_TYPE.JSON, MIME_TYPE.JSONLOGIC], limit: JSON_BODY_LIMIT }));
    // Text: markdown, plain text + Dataview DQL (supports full markdown file uploads)
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

    // Health check (no authentication required)
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', version: API_VERSION });
    });

    // OpenAPI docs (no authentication required)
    app.use('/', createOpenApiRouter());

    // Authentication middleware (applied after the routes above)
    app.use(createAuthMiddleware(() => getSettings().apiKey));

    // Register routes
    app.use('/tags', createTagsRouter(obsidianApp));
    app.use('/dataview', createDataviewRouter(obsidianApp));
    // Register folder/move routers before vault router (more specific paths first)
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

    // 404 handler
    app.use((_req, res) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_CODE.NOT_FOUND, message: ERROR_MSG.ENDPOINT_NOT_FOUND });
    });

    // Error handler
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
