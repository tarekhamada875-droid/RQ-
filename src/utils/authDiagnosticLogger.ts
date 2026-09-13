/**
 * Auth & Session Diagnostic Logger
 * Traces authentication state changes, Firebase applet configuration initialization,
 * and component lifecycle/renderView state timing.
 */

import firebaseConfig from '../../firebase-applet-config.json';

export const logDiagnostic = (tag: string, details?: Record<string, unknown>) => {
  if (!import.meta.env?.DEV) {
    return;
  }
  const timestamp = new Date().toISOString();
  const logPrefix = `[AUTH_DIAGNOSTIC ${timestamp}] [${tag}]`;
  if (details) {
    console.log(logPrefix, JSON.stringify(details, null, 2));
  } else {
    console.log(logPrefix);
  }
};

export const verifyFirebaseAppletConfig = () => {
  const config = firebaseConfig as Record<string, unknown>;
  const isValid = Boolean(
    config &&
    config.apiKey &&
    config.authDomain &&
    config.projectId
  );

  logDiagnostic('FIREBASE_CONFIG_CHECK', {
    hasApiKey: Boolean(config?.apiKey),
    authDomain: config?.authDomain || null,
    projectId: config?.projectId || null,
    firestoreDatabaseId: config?.firestoreDatabaseId || '(default)',
    isValidConfig: isValid,
  });

  return isValid;
};
