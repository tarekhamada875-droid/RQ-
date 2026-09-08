import { auth } from '../firebase';

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
}

export const getApiUrl = (endpoint: string) => {
  return endpoint;
};

export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // 1. Obtain current Firebase Auth ID token
  let token = '';
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn('[ApiClient] Failed to obtain Firebase ID token:', e);
    }
  }

  // 2. Attach Authorization Bearer token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Generate a random Correlation ID on client side to trace the request
  const correlationId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
  
  headers['X-Correlation-ID'] = correlationId;

  // 3. Keep the body limited to business inputs. Never treat body uid, role, or firebaseIdToken as authorization.
  // We remove redundant identity fields from body unless it is an auth endpoint
  let safeBody = undefined;
  if (options.body !== undefined) {
    if (options.body && typeof options.body === 'object') {
      const isAuthEndpoint = endpoint.includes('/api/auth/');
      if (isAuthEndpoint) {
        safeBody = JSON.stringify(options.body);
      } else {
        const { uid, role, firebaseIdToken, ...rest } = options.body;
        safeBody = JSON.stringify(rest);
      }
    } else {
      safeBody = JSON.stringify(options.body);
    }
  }

  const url = getApiUrl(endpoint);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: safeBody,
    });
  } catch (err: any) {
    console.error(`[ApiClient] Network error for ${endpoint}:`, err);
    throw new Error('تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
  }

  const serverCorrelationId = (response.headers && typeof response.headers.get === 'function' && response.headers.get('X-Correlation-ID')) || correlationId;

  // 4. Reject non-JSON HTML responses
  const contentType = (response.headers && typeof response.headers.get === 'function' && response.headers.get('content-type')) || 'application/json';
  if (contentType && !contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    console.error(`[ApiClient] Received non-JSON response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, text);
    throw new Error(`استجابة غير صالحة من الخادم (ID: ${serverCorrelationId})`);
  }

  // 5. Parse JSON consistently
  let result: any;
  try {
    result = await response.json();
  } catch (parseErr) {
    console.error(`[ApiClient] JSON parse error for ${endpoint} (Correlation ID: ${serverCorrelationId}):`, parseErr);
    throw new Error(`خطأ في معالجة استجابة الخادم (ID: ${serverCorrelationId})`);
  }

  // 6. Only trigger global logout event on 401 Unauthorized or explicit session death errors
  const isSessionTerminated = response.status === 401 ||
    result?.error?.includes('SESSION_REVOKED') ||
    result?.error?.includes('SESSION_EXPIRED');

  if (isSessionTerminated) {
    const errMsg = result?.error || 'انتهت صلاحية الجلسة أو غير مصرح لك بالوصول';
    console.warn(`[ApiClient] Auth Session Expiry (${response.status}) on ${endpoint}. Exiting session. (Correlation ID: ${serverCorrelationId})`);
    
    // Dispatch global session expiry event to trigger logout cleanly
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('api-session-expired', {
          detail: {
            status: response.status,
            error: errMsg,
            correlationId: serverCorrelationId,
          },
        })
      );
    }
    throw new Error(errMsg);
  }

  if (!response.ok) {
    const errMsg = result?.error || `فشلت العملية برمز الاستجابة ${response.status}`;
    console.error(`[ApiClient] Error response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, errMsg);
    throw new Error(errMsg);
  }

  return result;
}
