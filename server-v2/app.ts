import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseEnvironment, type V2Environment } from './config/environment.js';
import { errorResponse, successResponse } from './contracts/api.js';
import { DateKeySchema } from './contracts/summary.js';
import { InMemoryPackageCatalogRepository, type PackageCatalogRepository } from './repositories/packageCatalog.js';
import { InMemoryGarageSummaryRepository, type GarageSummaryRepository } from './repositories/garageSummary.js';
import { InMemoryActivityRepository, InMemoryPendingQueueRepository, type ActivityRepository, type PendingQueueRepository } from './repositories/readModels.js';
import { requireV2Authorization } from './http/auth.js';

const LimitSchema = z.coerce.number().int().min(1).max(100).default(25);

type V2AppOptions = Readonly<{
  environment?: V2Environment;
  packageCatalog?: PackageCatalogRepository;
  garageSummary?: GarageSummaryRepository;
  pendingQueue?: PendingQueueRepository;
  activity?: ActivityRepository;
  corsMiddleware?: RequestHandler;
  authMiddleware?: RequestHandler;
}>;

function requestId(request: Request): string {
  const header = request.header('X-Request-ID');
  return header && z.string().uuid().safeParse(header).success ? header : randomUUID();
}

export function createV2App(options: V2AppOptions = {}): Express {
  const environment = options.environment ?? parseEnvironment(process.env);
  const packageCatalog = options.packageCatalog ?? new InMemoryPackageCatalogRepository([]);
  const garageSummary = options.garageSummary ?? new InMemoryGarageSummaryRepository([]);
  const pendingQueue = options.pendingQueue ?? new InMemoryPendingQueueRepository([]);
  const activity = options.activity ?? new InMemoryActivityRepository([]);
  const app = express();

  if (options.corsMiddleware) app.use(options.corsMiddleware);
  app.use(express.json({ limit: '64kb' }));

  app.get('/v2/health', (request, response) => {
    response.json(successResponse(requestId(request), {
      status: 'ok',
      environment: environment.NODE_ENV,
      firebaseEmulator: environment.NODE_ENV !== 'production'
    }));
  });

  if (options.authMiddleware) {
    app.use('/v2/packages', options.authMiddleware);
    app.use('/v2/garages/:garageId/summary', options.authMiddleware, requireV2Authorization('garage_read', (request) => {
      const garageId = request.params.garageId;
      return typeof garageId === 'string' ? garageId : undefined;
    }));
    app.use('/v2/pending', options.authMiddleware, requireV2Authorization('admin_only'));
    app.use('/v2/activity', options.authMiddleware, requireV2Authorization('admin_only'));
  }

  app.get('/v2/packages', async (request, response) => {
    const id = requestId(request);
    if (environment.NODE_ENV === 'production') {
      response.status(404).json(errorResponse(id, 'NOT_FOUND', 'V2 package catalog is not enabled in production'));
      return;
    }

    const parsedLimit = LimitSchema.safeParse(request.query.limit ?? 25);
    if (!parsedLimit.success) {
      response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'limit must be an integer between 1 and 100'));
      return;
    }

    try {
      const packages = await packageCatalog.listActive(parsedLimit.data);
      response.json(successResponse(id, { items: packages, limit: parsedLimit.data }));
    } catch {
      response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to read package catalog'));
    }
  });

  app.get('/v2/garages/:garageId/summary', async (request, response) => {
    const id = requestId(request);
    if (environment.NODE_ENV === 'production') {
      response.status(404).json(errorResponse(id, 'NOT_FOUND', 'V2 garage summary is not enabled in production'));
      return;
    }

    const garageId = request.params.garageId;
    const dateResult = DateKeySchema.safeParse(request.query.date ?? '');
    if (!garageId || !dateResult.success) {
      response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and date are required'));
      return;
    }

    try {
      const summary = await garageSummary.getSummary(garageId, dateResult.data);
      if (!summary) {
        response.status(404).json(errorResponse(id, 'NOT_FOUND', 'Garage summary not found'));
        return;
      }
      response.json(successResponse(id, summary));
    } catch {
      response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to read garage summary'));
    }
  });

  const readPage = async (
    request: Request,
    response: Response,
    reader: (limit: number, cursor?: string) => Promise<unknown>,
    errorMessage: string
  ): Promise<void> => {
    const id = requestId(request);
    if (environment.NODE_ENV === 'production') {
      response.status(404).json(errorResponse(id, 'NOT_FOUND', 'V2 read models are not enabled in production'));
      return;
    }
    const parsedLimit = LimitSchema.safeParse(request.query.limit ?? 25);
    const parsedCursor = request.query.cursor === undefined ? { success: true as const, data: undefined } : z.string().safeParse(request.query.cursor);
    if (!parsedLimit.success || !parsedCursor.success) {
      response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'limit must be an integer between 1 and 100 and cursor must be a string'));
      return;
    }
    try {
      response.json(successResponse(id, await reader(parsedLimit.data, parsedCursor.data)));
    } catch (error) {
      if (error instanceof Error && (error.message === 'PAGE_SIZE_OUT_OF_RANGE' || error.message === 'Invalid page cursor')) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', error.message));
        return;
      }
      response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', errorMessage));
    }
  };

  app.get('/v2/pending', (request, response) => {
    void readPage(request, response, (limit, cursor) => pendingQueue.listPending(limit, cursor), 'Unable to read pending queue');
  });

  app.get('/v2/activity', (request, response) => {
    void readPage(request, response, (limit, cursor) => activity.listRecent(limit, cursor), 'Unable to read recent activity');
  });

  return app;
}
