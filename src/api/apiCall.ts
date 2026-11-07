/**
 * apiCall — wraps apiFetch with automatic envelope unwrapping.
 *
 * Audit ref: Phase 7 / D3 (consolidated audit, 2026-11-06).
 *
 * Previously, ~50 service methods each manually:
 *   1. Called apiFetch<T>(endpoint, options)
 *   2. Checked response.success (sometimes)
 *   3. Extracted response.data (sometimes)
 *   4. Handled errors (inconsistently)
 *
 * Now: apiCall<T>(endpoint, options) → Promise<T>
 *   - Calls apiFetch
 *   - If response has { success: false }: throws ApiError with the server's error message
 *   - If response has { success: true, data: T }: returns data
 *   - If response has no success field (legacy): returns response as T
 *
 * Usage:
 *   // Before:
 *   const response = await apiFetch<{ data: GarageSummary }>(endpoint);
 *   return response.data.summary;
 *
 *   // After:
 *   return apiCall<GarageSummary>(endpoint);
 */

import { apiFetch, ApiError } from './apiClient';

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
};

export async function apiCall<T = unknown>(
  endpoint: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const response = await apiFetch<ApiEnvelope<T>>(endpoint, options);

  // If the response doesn't look like an envelope (no `success` field),
  // it's a legacy endpoint that returns data directly — return as-is.
  if (response && typeof response === 'object' && !('success' in response)) {
    return response as T;
  }

  // Standard envelope: { success: boolean, data?: T, error?: string }
  if (response?.success === false) {
    throw new ApiError(
      response.error || 'فشلت العملية',
      {
        code: response.code,
        status: response.statusCode || 0,
        correlationId: response.correlationId,
        envelope: { success: false, error: response.error, code: response.code },
      }
    );
  }

  // Success: return data if present, otherwise return the response
  // (some endpoints return the data directly without a `data` wrapper)
  if (response?.data !== undefined) {
    return response.data;
  }

  return response as T;
}
