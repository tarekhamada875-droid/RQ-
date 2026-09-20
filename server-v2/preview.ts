import type { Express } from 'express';
import { createV2AuthMiddleware, createV2CorsMiddleware } from './http/auth.js';
import { createV2RequestContextMiddleware, createV2RateLimitMiddleware } from './http/observability.js';
import { createV2FirebaseAuth } from './infrastructure/firebaseAuth.js';
import { createV2Firebase } from './infrastructure/firebaseAdmin.js';
import { FirestoreSessionRepository } from './infrastructure/firestoreSession.js';
import { FirestorePackageCatalogRepository } from './repositories/firestorePackageCatalog.js';
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
    pendingQueue: new FirestorePendingQueueRepository(firebase.firestore),
    activity: new FirestoreActivityRepository(firebase.firestore),
    authMiddleware: createV2AuthMiddleware({
      verifyIdToken: firebaseAuth.verifyIdToken,
      getSession: (uid, sessionId) => sessions.getSession(uid, sessionId)
    }),
    corsMiddleware: createV2CorsMiddleware({ allowedOrigins: previewOrigins(environment.V2_CORS_ALLOWED_ORIGINS) }),
    requestContextMiddleware: createV2RequestContextMiddleware(),
    rateLimitMiddleware: createV2RateLimitMiddleware(new InMemoryRateLimiter(environment.V2_RATE_LIMIT_MAX_REQUESTS, environment.V2_RATE_LIMIT_WINDOW_MS))
  });
}
