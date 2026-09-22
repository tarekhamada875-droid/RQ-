import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { parseEnvironment, type V2Environment } from './config/environment.js';
import { errorResponse, successResponse } from './contracts/api.js';
import { DateKeySchema } from './contracts/summary.js';
import { GarageLifecycleRequestSchema } from './contracts/garageLifecycle.js';
import { VehicleCheckInRequestSchema, VehicleCheckOutRequestSchema } from './contracts/vehicleCommands.js';
import { SubscriberCreateRequestSchema, SubscriberRenewRequestSchema, SubscriberUpdateRequestSchema, SubscriberSuspendRequestSchema, SubscriberCancelRequestSchema, SubscriberDeleteRequestSchema } from './contracts/subscriberCommands.js';
import { DeletionAdvanceRequestSchema, DeletionResumeRequestSchema, DeletionStartRequestSchema } from './contracts/deletion.js';
import { GarageProfileUpdateRequestSchema } from './contracts/garageProfile.js';
import { ProjectionRebuildRequestSchema } from './contracts/projectionRepair.js';
import { ProjectionStatusRequestSchema, ProjectionStatusSchema } from './contracts/projectionStatus.js';
import { ShadowComparisonRequestSchema, type ShadowComparisonProvider } from './contracts/shadowComparison.js';
import { InMemoryPackageCatalogRepository, type PackageCatalogRepository } from './repositories/packageCatalog.js';
import { InMemoryGarageSummaryRepository, type GarageSummaryRepository } from './repositories/garageSummary.js';
import { InMemoryActivityRepository, InMemoryPendingQueueRepository, type ActivityRepository, type PendingQueueRepository } from './repositories/readModels.js';
import type { VehicleCheckInRepository } from './repositories/firestoreVehicleCheckIn.js';
import type { VehicleCheckOutRepository } from './repositories/firestoreVehicleCheckOut.js';
import type { SubscriberCommandRepository } from './repositories/firestoreSubscriberCommands.js';
import type { GarageLifecycleRepository } from './repositories/firestoreGarageLifecycle.js';
import type { GarageDeletionRepository } from './repositories/firestoreGarageDeletion.js';
import type { GarageProfileManagementRepository } from './repositories/firestoreGarageProfile.js';
import type { ProjectionRepository } from './repositories/firestoreProjection.js';
import { requireV2Authorization } from './http/auth.js';
import { getV2RequestId } from './http/requestId.js';

const LimitSchema = z.coerce.number().int().min(1).max(100).default(25);

type V2AppOptions = Readonly<{
  environment?: V2Environment;
  packageCatalog?: PackageCatalogRepository;
  garageSummary?: GarageSummaryRepository;
  pendingQueue?: PendingQueueRepository;
  activity?: ActivityRepository;
  vehicleCheckIn?: VehicleCheckInRepository;
  vehicleCheckOut?: VehicleCheckOutRepository;
  subscriberCommands?: SubscriberCommandRepository;
  garageLifecycle?: GarageLifecycleRepository;
  garageDeletion?: GarageDeletionRepository;
  garageProfileManagement?: GarageProfileManagementRepository;
  projection?: ProjectionRepository;
  shadowComparison?: ShadowComparisonProvider;
  corsMiddleware?: RequestHandler;
  authMiddleware?: RequestHandler;
  requestContextMiddleware?: RequestHandler;
  rateLimitMiddleware?: RequestHandler;
  routeRateLimitMiddleware?: Readonly<{
    packageCatalog?: RequestHandler;
    garageSummary?: RequestHandler;
    pending?: RequestHandler;
    activity?: RequestHandler;
  }>;
}>;

export function createV2App(options: V2AppOptions = {}): Express {
  const environment = options.environment ?? parseEnvironment(process.env);
  const packageCatalog = options.packageCatalog ?? new InMemoryPackageCatalogRepository([]);
  const garageSummary = options.garageSummary ?? new InMemoryGarageSummaryRepository([]);
  const pendingQueue = options.pendingQueue ?? new InMemoryPendingQueueRepository([]);
  const activity = options.activity ?? new InMemoryActivityRepository([]);
  const v2ReadEnabled = environment.NODE_ENV !== 'production' || (environment.V2_PREVIEW_ENABLED && environment.V2_PREVIEW_AUTH_ENABLED);
  const app = express();

  if (options.corsMiddleware) app.use(options.corsMiddleware);
  if (options.requestContextMiddleware) app.use(options.requestContextMiddleware);
  app.use(express.json({ limit: '64kb' }));

  app.get('/v2/health', (request, response) => {
    response.json(successResponse(getV2RequestId(request), {
      status: 'ok',
      environment: environment.NODE_ENV,
      firebaseEmulator: environment.NODE_ENV !== 'production'
    }));
  });

  if (options.authMiddleware) {
    const packageRateLimit = options.routeRateLimitMiddleware?.packageCatalog ?? options.rateLimitMiddleware;
    const garageRateLimit = options.routeRateLimitMiddleware?.garageSummary ?? options.rateLimitMiddleware;
    const pendingRateLimit = options.routeRateLimitMiddleware?.pending ?? options.rateLimitMiddleware;
    const activityRateLimit = options.routeRateLimitMiddleware?.activity ?? options.rateLimitMiddleware;
    app.use('/v2/packages', options.authMiddleware, ...(packageRateLimit ? [packageRateLimit] : []));
    app.use('/v2/garages/:garageId/summary', options.authMiddleware, ...(garageRateLimit ? [garageRateLimit] : []), requireV2Authorization('garage_read', (request) => {
      const garageId = request.params.garageId;
      return typeof garageId === 'string' ? garageId : undefined;
    }));
    if (options.vehicleCheckIn) {
      app.use('/v2/garages/:garageId/vehicles/check-in', options.authMiddleware, requireV2Authorization('garage_write', (request) => {
        const garageId = request.params.garageId;
        return typeof garageId === 'string' ? garageId : undefined;
      }));
    }
    if (options.vehicleCheckOut) {
      app.use('/v2/garages/:garageId/vehicles/:vehicleId/check-out', options.authMiddleware, requireV2Authorization('garage_write', (request) => {
        const garageId = request.params.garageId;
        return typeof garageId === 'string' ? garageId : undefined;
      }));
    }
    if (options.subscriberCommands) {
      app.use('/v2/garages/:garageId/subscribers', options.authMiddleware, (request, response, next) => {
        if (request.path.endsWith('/delete')) {
          requireV2Authorization('admin_only')(request, response, next);
          return;
        }
        requireV2Authorization('garage_write', (currentRequest) => {
          const garageId = currentRequest.params.garageId;
          return typeof garageId === 'string' ? garageId : undefined;
        })(request, response, next);
      });
    }
    if (options.garageLifecycle) {
      app.use('/v2/garages/:garageId/lock', options.authMiddleware, requireV2Authorization('admin_only'));
      app.use('/v2/garages/:garageId/unlock', options.authMiddleware, requireV2Authorization('admin_only'));
      app.use('/v2/garages/:garageId/suspend', options.authMiddleware, requireV2Authorization('admin_only'));
      app.use('/v2/garages/:garageId/unsuspend', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    if (options.garageDeletion) {
      app.use('/v2/garages/:garageId/deletion', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    if (options.garageProfileManagement) {
      app.use('/v2/garages/:garageId/profile/update', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    if (options.projection && environment.V2_PROJECTION_REPAIR_ENABLED) {
      app.use('/v2/garages/:garageId/projection/rebuild', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    if (options.projection && environment.V2_PROJECTION_STATUS_ENABLED) {
      app.use('/v2/garages/:garageId/projection/status', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    if (options.shadowComparison && environment.V2_SHADOW_COMPARISON_ENABLED) {
      app.use('/v2/shadow/compare', options.authMiddleware, requireV2Authorization('admin_only'));
    }
    app.use('/v2/pending', options.authMiddleware, ...(pendingRateLimit ? [pendingRateLimit] : []), requireV2Authorization('admin_only'));
    app.use('/v2/activity', options.authMiddleware, ...(activityRateLimit ? [activityRateLimit] : []), requireV2Authorization('admin_only'));
  } else if (options.rateLimitMiddleware) {
    app.use('/v2/packages', options.rateLimitMiddleware);
    app.use('/v2/garages/:garageId/summary', options.rateLimitMiddleware);
    app.use('/v2/pending', options.rateLimitMiddleware);
    app.use('/v2/activity', options.rateLimitMiddleware);
  }

  const garageProfileManagement = options.garageProfileManagement;
  if (garageProfileManagement && options.authMiddleware && v2ReadEnabled) {
    app.post('/v2/garages/:garageId/profile/update', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const authorization = request.v2Authorization;
      const parsed = GarageProfileUpdateRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and non-empty profile update are required'));
        return;
      }
      try {
        const result = await garageProfileManagement.update({
          ...parsed.data,
          garageId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'GARAGE_NOT_FOUND', 'GARAGE_DELETION_IN_PROGRESS']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to update garage profile'));
      }
    });
  }

  if (options.projection && options.authMiddleware && environment.V2_PROJECTION_REPAIR_ENABLED && v2ReadEnabled) {
    const projection = options.projection;
    app.post('/v2/garages/:garageId/projection/rebuild', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const authorization = request.v2Authorization;
      const parsed = ProjectionRebuildRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID, date, event window, and idempotency key are required'));
        return;
      }
      try {
        const result = await projection.rebuild({ ...parsed.data, garageId, actorUid: authorization.uid, occurredAt: new Date().toISOString() });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'PROJECTION_SCOPE_MISMATCH', 'PROJECTION_ACTIVE_COUNT_NEGATIVE', 'PROJECTION_REBUILD_WINDOW_EXCEEDED']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to rebuild projection'));
      }
    });
  }

  if (options.projection && options.authMiddleware && environment.V2_PROJECTION_STATUS_ENABLED && v2ReadEnabled) {
    const projection = options.projection;
    app.get('/v2/garages/:garageId/projection/status', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const parsed = ProjectionStatusRequestSchema.safeParse({ dateKey: request.query.date ?? '' });
      if (typeof garageId !== 'string' || !parsed.success) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and date are required'));
        return;
      }
      try {
        const currentProjection = await projection.get(garageId, parsed.data.dateKey);
        const result = currentProjection === null
          ? { garageId, dateKey: parsed.data.dateKey, state: 'missing' as const }
          : ProjectionStatusSchema.parse({
            garageId, dateKey: parsed.data.dateKey,
            state: Date.now() - Date.parse(currentProjection.asOf) > 15 * 60 * 1000 ? 'stale' : 'healthy',
            projectionVersion: currentProjection.projectionVersion, asOf: currentProjection.asOf,
            lagMs: Math.max(0, Date.now() - Date.parse(currentProjection.asOf))
          });
        response.json(successResponse(id, result));
      } catch {
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to read projection status'));
      }
    });
  }

  if (options.shadowComparison && options.authMiddleware && environment.V2_SHADOW_COMPARISON_ENABLED && v2ReadEnabled) {
    const shadowComparison = options.shadowComparison;
    app.post('/v2/shadow/compare', async (request, response) => {
      const id = getV2RequestId(request);
      const parsed = ShadowComparisonRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid shadow-comparison request is required'));
        return;
      }
      try {
        const result = await shadowComparison({ ...parsed.data, requestId: id });
        response.json(successResponse(id, result));
      } catch {
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to run shadow comparison'));
      }
    });
  }

  app.get('/v2/packages', async (request, response) => {
    const id = getV2RequestId(request);
    if (!v2ReadEnabled) {
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
    const id = getV2RequestId(request);
    if (!v2ReadEnabled) {
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

  const vehicleCheckIn = options.vehicleCheckIn;
  if (vehicleCheckIn && options.authMiddleware && v2ReadEnabled) {
    app.post('/v2/garages/:garageId/vehicles/check-in', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const authorization = request.v2Authorization;
      const parsed = VehicleCheckInRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and check-in request are required'));
        return;
      }
      try {
        const result = await vehicleCheckIn.checkIn({
          ...parsed.data,
          garageId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.status(201).json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        const conflict = new Set([
          'IDEMPOTENCY_KEY_REUSE', 'GARAGE_NOT_FOUND', 'GARAGE_DELETION_IN_PROGRESS',
          'GARAGE_CHECK_IN_LOCKED', 'SUBSCRIPTION_EXPIRED', 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN',
          'FAIR_USE_LIMIT_REACHED', 'CAPACITY_LIMIT_REACHED', 'VEHICLE_ALREADY_INSIDE'
        ]);
        if (conflict.has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to check in vehicle'));
      }
    });
  }

  const vehicleCheckOut = options.vehicleCheckOut;
  if (vehicleCheckOut && options.authMiddleware && v2ReadEnabled) {
    app.post('/v2/garages/:garageId/vehicles/:vehicleId/check-out', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const vehicleId = request.params.vehicleId;
      const authorization = request.v2Authorization;
      const parsed = VehicleCheckOutRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof vehicleId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, vehicle, and check-out request are required'));
        return;
      }
      try {
        const result = await vehicleCheckOut.checkOut({
          garageId,
          vehicleId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString(),
          idempotencyKey: parsed.data.idempotencyKey
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        const conflict = new Set([
          'IDEMPOTENCY_KEY_REUSE', 'GARAGE_NOT_FOUND', 'VEHICLE_NOT_FOUND',
          'VEHICLE_ALREADY_OUTSIDE', 'VEHICLE_NOT_INSIDE', 'INVALID_ENTRYAT'
        ]);
        if (conflict.has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to check out vehicle'));
      }
    });
  }

  const subscriberCommands = options.subscriberCommands;
  if (subscriberCommands && options.authMiddleware && v2ReadEnabled) {
    app.post('/v2/garages/:garageId/subscribers', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberCreateRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and subscriber request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.create({
          ...parsed.data,
          garageId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.status(201).json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_ALREADY_EXISTS']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to create subscriber'));
      }
    });

    app.post('/v2/garages/:garageId/subscribers/:subscriberId/renew', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const subscriberId = request.params.subscriberId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberRenewRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof subscriberId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, subscriber, and renewal request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.renew({
          ...parsed.data,
          garageId,
          subscriberId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_NOT_FOUND', 'SUBSCRIBER_CANCELLED', 'INVALID_DATE_RANGE']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to renew subscriber'));
      }
    });

    app.post('/v2/garages/:garageId/subscribers/:subscriberId/update', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const subscriberId = request.params.subscriberId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberUpdateRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof subscriberId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, subscriber, and update request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.update({
          ...parsed.data,
          garageId,
          subscriberId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_NOT_FOUND', 'INVALID_DATE_RANGE']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to update subscriber'));
      }
    });

    app.post('/v2/garages/:garageId/subscribers/:subscriberId/suspend', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const subscriberId = request.params.subscriberId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberSuspendRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof subscriberId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, subscriber, and suspend request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.suspend({
          ...parsed.data,
          garageId,
          subscriberId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_NOT_FOUND', 'SUBSCRIBER_NOT_ACTIVE']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to suspend subscriber'));
      }
    });

    app.post('/v2/garages/:garageId/subscribers/:subscriberId/cancel', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const subscriberId = request.params.subscriberId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberCancelRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof subscriberId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, subscriber, and cancel request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.cancel({
          ...parsed.data,
          garageId,
          subscriberId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_NOT_FOUND', 'SUBSCRIBER_ALREADY_CANCELLED']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to cancel subscriber'));
      }
    });

    app.post('/v2/garages/:garageId/subscribers/:subscriberId/delete', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const subscriberId = request.params.subscriberId;
      const authorization = request.v2Authorization;
      const parsed = SubscriberDeleteRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof subscriberId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, subscriber, and delete request are required'));
        return;
      }
      try {
        const result = await subscriberCommands.delete({
          ...parsed.data,
          garageId,
          subscriberId,
          actorUid: authorization.uid,
          occurredAt: new Date().toISOString()
        });
        response.json(successResponse(id, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'SUBSCRIBER_NOT_FOUND', 'SUBSCRIBER_ALREADY_DELETED']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to delete subscriber'));
      }
    });
  }

  const garageLifecycle = options.garageLifecycle;
  if (garageLifecycle && options.authMiddleware && v2ReadEnabled) {
    const lifecycleRoutes = [
      ['lock', garageLifecycle.lock],
      ['unlock', garageLifecycle.unlock],
      ['suspend', garageLifecycle.suspend],
      ['unsuspend', garageLifecycle.unsuspend]
    ] as const;
    for (const [operation, command] of lifecycleRoutes) {
      app.post(`/v2/garages/:garageId/${operation}`, async (request, response) => {
        const id = getV2RequestId(request);
        const garageId = request.params.garageId;
        const authorization = request.v2Authorization;
        const parsed = GarageLifecycleRequestSchema.safeParse(request.body);
        if (typeof garageId !== 'string' || !parsed.success || !authorization) {
          response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and lifecycle request are required'));
          return;
        }
        try {
          const result = await command.call(garageLifecycle, {
            garageId,
            actorUid: authorization.uid,
            occurredAt: new Date().toISOString(),
            idempotencyKey: parsed.data.idempotencyKey
          });
          response.json(successResponse(id, result));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
          if (new Set([
            'IDEMPOTENCY_KEY_REUSE', 'GARAGE_NOT_FOUND', 'GARAGE_DELETION_IN_PROGRESS',
            'GARAGE_ALREADY_LOCKED', 'GARAGE_ALREADY_UNLOCKED', 'GARAGE_ALREADY_SUSPENDED', 'GARAGE_ALREADY_ACTIVE'
          ]).has(message)) {
            response.status(409).json(errorResponse(id, 'CONFLICT', message));
            return;
          }
          response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to execute garage lifecycle command'));
        }
      });
    }
  }

  const garageDeletion = options.garageDeletion;
  if (garageDeletion && options.authMiddleware && v2ReadEnabled) {
    app.post('/v2/garages/:garageId/deletion', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const authorization = request.v2Authorization;
      const parsed = DeletionStartRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage ID and deletion request are required'));
        return;
      }
      try {
        response.status(201).json(successResponse(id, await garageDeletion.start({ ...parsed.data, garageId, actorUid: authorization.uid, occurredAt: new Date().toISOString() })));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'GARAGE_NOT_FOUND', 'GARAGE_DELETION_IN_PROGRESS']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to start garage deletion job'));
      }
    });
    app.post('/v2/garages/:garageId/deletion/:jobId/advance', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const jobId = request.params.jobId;
      const authorization = request.v2Authorization;
      const parsed = DeletionAdvanceRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof jobId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, job, and bounded deletion page are required'));
        return;
      }
      try {
        response.json(successResponse(id, await garageDeletion.advance({ ...parsed.data, garageId, jobId, actorUid: authorization.uid, occurredAt: new Date().toISOString() })));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'DELETION_JOB_NOT_FOUND', 'DELETION_JOB_TARGET_MISMATCH', 'DELETION_ALREADY_COMPLETED', 'DELETION_PAGE_TOO_LARGE', 'REPAIR_REASON_REQUIRED']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to advance garage deletion job'));
      }
    });
    app.post('/v2/garages/:garageId/deletion/:jobId/resume', async (request, response) => {
      const id = getV2RequestId(request);
      const garageId = request.params.garageId;
      const jobId = request.params.jobId;
      const authorization = request.v2Authorization;
      const parsed = DeletionResumeRequestSchema.safeParse(request.body);
      if (typeof garageId !== 'string' || typeof jobId !== 'string' || !parsed.success || !authorization) {
        response.status(400).json(errorResponse(id, 'BAD_REQUEST', 'A valid garage, job, and resume request are required'));
        return;
      }
      try {
        response.json(successResponse(id, await garageDeletion.resume({ ...parsed.data, garageId, jobId, actorUid: authorization.uid, occurredAt: new Date().toISOString() })));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        if (new Set(['IDEMPOTENCY_KEY_REUSE', 'DELETION_JOB_NOT_FOUND', 'DELETION_JOB_TARGET_MISMATCH', 'DELETION_NOT_REPAIRABLE']).has(message)) {
          response.status(409).json(errorResponse(id, 'CONFLICT', message));
          return;
        }
        response.status(500).json(errorResponse(id, 'INTERNAL_ERROR', 'Unable to resume garage deletion job'));
      }
    });
  }

  const readPage = async (
    request: Request,
    response: Response,
    reader: (limit: number, cursor?: string) => Promise<unknown>,
    errorMessage: string
  ): Promise<void> => {
    const id = getV2RequestId(request);
    if (!v2ReadEnabled) {
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
