import { ApiError } from '../api/apiClient';

export type ApiFailureCategory = 'network' | 'timeout' | 'server' | 'request' | 'unknown';

export function classifyApiFailure(error: unknown): ApiFailureCategory {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.code === 'NETWORK_ERROR') return 'network';
  if (error.code === 'API_TIMEOUT') return 'timeout';
  if (error.status >= 500) return 'server';
  if (error.status >= 400) return 'request';
  return 'unknown';
}

export function getApiFailureReference(error: unknown): string | undefined {
  return error instanceof ApiError ? error.correlationId : undefined;
}
