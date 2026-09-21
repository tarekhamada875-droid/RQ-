import type { Express } from 'express';
import { createV2AuthMiddleware, createV2CorsMiddleware } from './http/auth.js';
import { createConsoleRequestContextSink, createV2RequestContextMiddleware, createV2RateLimitMiddleware } from './http/observability.js';
import { createV2FirebaseAuth } from './infrastructure/firebaseAuth.js';
import { createV2Firebase } from './infrastructure/firebaseAdmin.js';
import { FirestoreSessionRepository } from './infrastructure/firestoreSession.js';
import { FirestorePackageCatalogRepository } from './repositories/firestorePackageCatalog.js';
import { FirestoreVehicleCheckInRepository } from './repositories/firestoreVehicleCheckIn.js';
import { FirestoreVehicleCheckOutRepository } from './repositories/firestoreVehicleCheckOut.js';
import { FirestoreSubscriberCommandRepository } from './repositories/firestoreSubscriberCommands.js';
import { FirestoreGarageLifecycleRepository } from './repositories/firestoreGarageLifecycle.js';
import { FirestoreActivityRepository, FirestorePendingQueueRepository } from './repositories/readModels.js';
import { createV2App } from './app.js';
import { InMemoryRateLimiter } from './security/rateLimit.js';
import type { V2Environment } from './config/environment.js';

export function previewOrigins(value: string): ReadonlySet<string> {
  return new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function createV2PreviewApp(environment: V2Environment): Express {
  if (!environment.V2_PREVIEW_ENABLED || !environment.V2_PREVIEW_AUTH_ENABLED) {
    throw new Error('V2 preview requires both V2_PREVIEW_ENABLED and V2_PREVIEW_AUTH_ENABLED');
  }
  if (!environment.FIREBASE_PROJECT_ID) throw new Error('V2 preview requires FIREBASE_PROJECT_ID');
  const firebase = createV2Firebase(environment);
  const firebaseAuth = createV2FirebaseAuth(firebase.app);
  const sessions = new FirestoreSessionRepository(firebase.firestore);
  return createV2App({
    environment,
    packageCatalog: new FirestorePackageCatalogRepository(firebase.firestore),
    vehicleCheckIn: new FirestoreVehicleCheckInRepository(firebase.firestore),
    vehicleCheckOut: new FirestoreVehicleCheckOutRepository(firebase.firestore),
    subscriberCommands: new FirestoreSubscriberCommandRepository(firebase.firestore),
    garageLifecycle: new FirestoreGarageLifecycleRepository(firebase.firestore),
    pendingQueue: new FirestorePendingQueueRepository(firebase.firestore),
    activity: new FirestoreActivityRepository(firebase.firestore),
    authMiddleware: createV2AuthMiddleware({
      verifyIdToken: firebaseAuth.verifyIdToken,
      getSession: (uid, sessionId) => sessions.getSession(uid, sessionId)
    }),
    corsMiddleware: createV2CorsMiddleware({ allowedOrigins: previewOrigins(environment.V2_CORS_ALLOWED_ORIGINS) }),
    requestContextMiddleware: createV2RequestContextMiddleware(createConsoleRequestContextSink('rq-v2-preview')),
    routeRateLimitMiddleware: {
      packageCatalog: createV2RateLimitMiddleware(new InMemoryRateLimiter(environment.V2_RATE_LIMIT_PACKAGE_READ_MAX_REQUESTS, environment.V2_RATE_LIMIT_WINDOW_MS)),
      garageSummary: createV2RateLimitMiddleware(new InMemoryRateLimiter(environment.V2_RATE_LIMIT_GARAGE_SUMMARY_MAX_REQUESTS, environment.V2_RATE_LIMIT_WINDOW_MS)),
      pending: createV2RateLimitMiddleware(new InMemoryRateLimiter(environment.V2_RATE_LIMIT_PENDING_READ_MAX_REQUESTS, environment.V2_RATE_LIMIT_WINDOW_MS)),
      activity: createV2RateLimitMiddleware(new InMemoryRateLimiter(environment.V2_RATE_LIMIT_ACTIVITY_READ_MAX_REQUESTS, environment.V2_RATE_LIMIT_WINDOW_MS))
    }
  });
}
