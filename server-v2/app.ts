import express, { type Express, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseEnvironment, type V2Environment } from './config/environment.js';
import { errorResponse, successResponse } from './contracts/api.js';
import { InMemoryPackageCatalogRepository, type PackageCatalogRepository } from './repositories/packageCatalog.js';

const LimitSchema = z.coerce.number().int().min(1).max(100).default(25);

type V2AppOptions = Readonly<{
  environment?: V2Environment;
  packageCatalog?: PackageCatalogRepository;
}>;

function requestId(request: Request): string {
  const header = request.header('X-Request-ID');
  return header && z.string().uuid().safeParse(header).success ? header : randomUUID();
}

export function createV2App(options: V2AppOptions = {}): Express {
  const environment = options.environment ?? parseEnvironment(process.env);
  const packageCatalog = options.packageCatalog ?? new InMemoryPackageCatalogRepository([]);
  const app = express();

  app.use(express.json({ limit: '64kb' }));

  app.get('/v2/health', (request, response) => {
    response.json(successResponse(requestId(request), {
      status: 'ok',
      environment: environment.NODE_ENV,
      firebaseEmulator: environment.NODE_ENV !== 'production'
    }));
  });

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

  return app;
}
