/**
 * Auth & Session Diagnostic Logger
 * Traces authentication state changes, Firebase applet configuration initialization,
 * and component lifecycle/renderView state timing.
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { User } from 'firebase/auth';

export const logDiagnostic = (tag: string, details?: Record<string, any>) => {
  const timestamp = new Date().toISOString();
  const logPrefix = `[AUTH_DIAGNOSTIC ${timestamp}] [${tag}]`;
  if (details) {
    console.log(logPrefix, JSON.stringify(details, null, 2));
  } else {
    console.log(logPrefix);
  }
};

export const verifyFirebaseAppletConfig = () => {
  const config = firebaseConfig as Record<string, any>;
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

export const formatUserAuthState = (user: User | null) => {
  if (!user) {
    return { authenticated: false, uid: null, isAnonymous: false };
  }
  return {
    authenticated: true,
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    email: user.email || null,
  };
};
