import express from 'express';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { createAuthMiddleware } from './auth.js';
import { createEmailSender } from './lib/email.js';
import { ApiError, sendError } from './lib/errors.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createUploadsRouter } from './routes/uploads.routes.js';
import { createEngagementRouter } from './routes/engagement.routes.js';
import { createFounderBrandRouter } from './routes/founder-brand.routes.js';
import { createLaunchRouter } from './routes/launch.routes.js';
import { createReportsRouter } from './routes/reports.routes.js';
import { createAnalyticsRouter } from './routes/analytics.routes.js';
import { createProductsRouter } from './routes/products.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createCommunityRouter } from './routes/community.routes.js';
import { createReviewsRouter } from './routes/reviews.routes.js';
import { createDiscoveryRouter } from './routes/discovery.routes.js';
import { createInsightsRouter } from './routes/insights.routes.js';
import { createRecommendationsRouter } from './routes/recommendations.routes.js';

const previewGetPaths = [
  /^\/api\/(?:health|categories|launches|leaderboard)\/?$/,
  /^\/api\/categories\/popular\/?$/,
  /^\/api\/businesses\/leaderboard\/?$/,
  /^\/api\/founders\/?$/,
  /^\/api\/discover\/businesses\/?$/,
  /^\/api\/trending(?:\/dashboard)?\/?$/,
  /^\/api\/launches\/(?:upcoming|anniversaries)\/?$/,
  /^\/api\/launches\/[^/]+\/lifecycle\/?$/,
  /^\/api\/brands\/[^/]+\/reviews\/?$/,
  /^\/api\/collections\/public\/?$/,
  /^\/api\/collections\/share\/[^/]+\/?$/,
  /^\/api\/launches\/[^/]+\/?$/,
  /^\/api\/brands\/[^/]+\/?$/,
  /^\/api\/founders\/[^/]+\/?$/,
  /^\/api\/for-you\/?$/,
  /^\/api\/media\/[^/]+\/?$/
];

function isInside(candidate, parent) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  return resolvedCandidate === resolvedParent || resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`);
}

function matchesTestPreviewKey(expected, supplied) {
  if (typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function previewReadOnlyMiddleware(config) {
  return (req, res, next) => {
    if (!config.previewReadOnly) return next();

    // Preview requests are always anonymous. Ignore credentials before cookie parsing or auth middleware.
    delete req.headers.cookie;
    delete req.headers.authorization;
    req.cookies = undefined;
    const setHeader = res.setHeader;
    res.setHeader = function (name, value) {
      if (String(name).toLowerCase() === 'set-cookie') return this;
      return setHeader.call(this, name, value);
    };
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      this.removeHeader('Set-Cookie');
      const safeArgs = args.map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).filter(([name]) => name.toLowerCase() !== 'set-cookie'));
      });
      return writeHead.apply(this, safeArgs);
    };

    if (req.method !== 'GET' || !previewGetPaths.some(pattern => pattern.test(req.path))) {
      return sendError(res, 403, 'DEMO_READ_ONLY', 'This preview API is read-only. Only anonymous public GET discovery and publicly referenced media are available.');
    }
    return next();
  };
}

export function createApp({ db, config, sendEmail = createEmailSender(config), testPreviewOutbox = [] }) {
  config = { ...config, previewReadOnly: config.previewReadOnly !== false };
  if (!config.previewReadOnly && (config.nodeEnv !== 'test' || config.databasePath !== ':memory:')) {
    throw new Error('Preview read-only mode can only be disabled for isolated API tests with NODE_ENV=test and DATABASE_PATH=:memory:.');
  }
  if (config.syntheticTestPreview) {
    const backendRoot = config.backendRoot ?? process.cwd();
    if (config.nodeEnv !== 'test' || config.databasePath !== ':memory:' || config.previewReadOnly !== false ||
      typeof config.testPreviewAccessKey !== 'string' || config.testPreviewAccessKey.length < 32 || config.smtpHost ||
      isInside(config.uploadDir, path.join(backendRoot, 'storage')) ||
      isInside(config.mailDir, path.join(backendRoot, '.local-mail'))) {
      throw new Error('Synthetic test preview requires an in-memory test database, proxy key, disabled SMTP, and isolated temporary storage.');
    }
  }
  const app = express();
  const trustProxy = config.trustProxy === '0' || config.trustProxy === 0 ? false :
    config.trustProxy === '1' || config.trustProxy === 1 ? 1 : config.trustProxy;
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { frameSrc: ["'self'", 'https://www.openstreetmap.org'] } }, crossOriginResourcePolicy: { policy: 'cross-origin' }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
  if (config.syntheticTestPreview) {
    app.use('/api', (req, res, next) => {
      if (!matchesTestPreviewKey(config.testPreviewAccessKey, req.get('x-test-preview-key'))) {
        return sendError(res, 403, 'TEST_PREVIEW_PROXY_ONLY', 'This synthetic API is available only through its private local preview proxy.');
      }
      next();
    });
  }
  app.use(previewReadOnlyMiddleware(config));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === config.webOrigin) return callback(null, true);
      return callback(null, false);
    },
    credentials: !config.previewReadOnly,
    methods: config.previewReadOnly ? ['GET'] : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600
  }));
  app.use((req, _res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== config.webOrigin) return next(new ApiError(403, 'FORBIDDEN', 'This browser origin is not allowed.'));
    next();
  });
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(cookieParser());

  const auth = createAuthMiddleware(db, config);
  app.use('/api/auth', createAuthRouter({ db, config, sendEmail, auth }));
  app.use('/api', createDiscoveryRouter({ db, auth, config }));
  app.use('/api', createRecommendationsRouter({ db, auth }));
  app.use('/api', createReviewsRouter({ db, auth }));
  app.use('/api', createCommunityRouter({ db, auth, config }));
  app.use('/api', createInsightsRouter({ db, auth, config }));
  app.use('/api', createPublicRouter({ db, config, auth }));
  app.use('/api', createUploadsRouter({ db, config, auth }));
  app.use('/api', createEngagementRouter({ db, config, auth }));
  app.use('/api', createFounderBrandRouter({ db, auth, config }));
  app.use('/api', createProductsRouter({ db, auth, config }));
  app.use('/api', createLaunchRouter({ db, auth, config }));
  app.use('/api', createReportsRouter({ db, auth }));
  app.use('/api', createAnalyticsRouter({ db, auth }));
  app.use('/api', createAdminRouter({ db, auth, sendEmail }));

  if (config.syntheticTestPreview) {
    app.get('/api/__test/outbox', (_req, res) => {
      const messages = testPreviewOutbox.map(message => {
        const verificationUrl = message.text?.match(/https?:\/\/[^\s]+/u)?.[0];
        return { to: message.to, subject: message.subject, createdAt: message.createdAt, verificationUrl };
      });
      res.set('Cache-Control', 'no-store').json({ messages });
    });
  }

  app.use((req, _res, next) => next(new ApiError(404, 'NOT_FOUND', `No API route for ${req.method} ${req.path}.`)));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) return sendError(res, error.status, error.code, error.message, error.fields);
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
      return sendError(res, status, status === 413 ? 'UPLOAD_TOO_LARGE' : 'VALIDATION_ERROR', status === 413 ? 'The uploaded file is too large.' : 'The upload could not be accepted.', { file: error.message });
    }
    if (error?.type === 'entity.parse.failed') return sendError(res, 400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
    if (error?.type === 'entity.too.large') return sendError(res, 413, 'REQUEST_TOO_LARGE', 'Request body is too large.');
    if (typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) return sendError(res, 409, 'CONFLICT', 'The request conflicts with existing data.');
    // Keep token, email, password, report, and request-body contents out of logs.
    console.error('api_request_failed', { name: error?.name ?? 'Error', code: error?.code ?? 'unknown' });
    return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  });

  app.locals.db = db;
  app.locals.config = config;
  return app;
}
