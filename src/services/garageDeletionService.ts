import { apiFetch } from '../api/apiClient';
import { handleFirestoreError, OperationType } from '../firebase';

export type GarageDeletionProgress = {
  phase: 'preparing' | 'deleting' | 'finalizing' | 'complete' | 'failed';
  processed: number;
  total?: number;
  percentage?: number;
};

export type GarageDeletionStatus = {
  status: 'not_started' | 'running' | 'completed' | 'failed' | 'stale' | 'unknown';
  phase?: string;
  processedRecords: number;
  errorCode: string | null;
  retryable: boolean;
};

export type GarageDeletionAttempt =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly errorCode: string;
      readonly status: GarageDeletionStatus | null;
      readonly error: unknown;
    };

const AMBIGUOUS_DELETION_ERRORS = new Set([
  'API_TIMEOUT',
  'NETWORK_ERROR',
  'REQUEST_TIMEOUT',
  'INVALID_RESPONSE',
  'GARAGE_DELETION_JOB_TOKEN_MISSING',
  'GARAGE_DELETION_STATUS_UNKNOWN'
]);

function isAmbiguousDeletionError(error: unknown, errorCode: string): boolean {
  if (AMBIGUOUS_DELETION_ERRORS.has(errorCode)) return true;
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

export function garageDeletionErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const details = error as { code?: unknown; message?: unknown };
    if (typeof details.code === 'string' && details.code) return details.code;
    if (typeof details.message === 'string' && details.message) return details.message;
  }
  return 'UNKNOWN_ERROR';
}

export const garageDeletionService = {
  getGarageDeletionStatus: async (id: string): Promise<GarageDeletionStatus> => {
    try {
      const response = await apiFetch<{
        status?: string;
        phase?: string;
        processedRecords?: number;
        errorCode?: string | null;
        retryable?: boolean;
      }>(`/api/garages/delete-status?garageId=${encodeURIComponent(id)}`);
      const knownStatuses = ['running', 'completed', 'failed', 'stale'] as const;
      const status = knownStatuses.includes(response.status as typeof knownStatuses[number])
        ? response.status as typeof knownStatuses[number]
        : 'unknown';
      return {
        status,
        phase: response.phase,
        processedRecords: Math.max(0, Number(response.processedRecords) || 0),
        errorCode: typeof response.errorCode === 'string' ? response.errorCode : null,
        retryable: response.retryable === true
      };
    } catch (error: any) {
      if (error?.code === 'DELETION_JOB_NOT_FOUND' || error?.message === 'DELETION_JOB_NOT_FOUND') {
        return { status: 'not_started', processedRecords: 0, errorCode: null, retryable: false };
      }
      throw error;
    }
  },

  deleteGarage: async (
    id: string,
    onProgress?: (progress: GarageDeletionProgress) => void
  ): Promise<void> => {
    try {
      onProgress?.({ processed: 0, phase: 'preparing' });
      const started = await apiFetch<{
        success: boolean;
        status?: 'running' | 'completed';
        alreadyDeleted?: boolean;
        processedRecords?: number;
        jobToken?: string;
      }>('/api/garages/delete', {
        method: 'POST',
        body: { garageId: id },
        timeoutMs: 15_000
      });

      if (started.alreadyDeleted || started.status === 'completed') {
        onProgress?.({ processed: Number(started.processedRecords) || 0, phase: 'complete' });
        return;
      }
      if (!started.jobToken) throw new Error('GARAGE_DELETION_JOB_TOKEN_MISSING');

      const deadline = Date.now() + 6 * 60_000;
      do {
        const step = await apiFetch<{
          success: boolean;
          status: string;
          phase?: string;
          processedRecords?: number;
          errorCode?: string | null;
        }>('/api/garages/delete-step', {
          method: 'POST',
          body: { garageId: id, jobToken: started.jobToken },
          timeoutMs: 15_000
        });
        const processed = Number(step.processedRecords) || 0;
        if (step.status === 'completed') {
          onProgress?.({ processed, phase: 'complete' });
          return;
        }
        if (step.status === 'failed' || step.status === 'stale') {
          onProgress?.({ processed, phase: 'failed' });
          throw new Error(step.status === 'stale' ? 'GARAGE_DELETION_STALE' : (step.errorCode || 'GARAGE_DELETION_FAILED'));
        }
        if (step.status !== 'running') throw new Error('GARAGE_DELETION_STATUS_UNKNOWN');
        onProgress?.({ processed, phase: step.phase === 'finalizing' ? 'finalizing' : 'deleting' });
        if (Date.now() >= deadline) throw new Error('GARAGE_DELETION_STILL_RUNNING');
        await new Promise((resolve) => setTimeout(resolve, 150));
      } while (Date.now() < deadline);

      throw new Error('GARAGE_DELETION_STILL_RUNNING');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `garages/${id}`);
      throw error;
    }
  }
};

export async function deleteGarageWithRecovery(
  garageId: string,
  onProgress?: (progress: GarageDeletionProgress) => void
): Promise<GarageDeletionAttempt> {
  try {
    await garageDeletionService.deleteGarage(garageId, onProgress);
    return { ok: true };
  } catch (error) {
    const errorCode = garageDeletionErrorCode(error);
    if (!isAmbiguousDeletionError(error, errorCode)) {
      return { ok: false, errorCode, status: null, error };
    }
    const status = await garageDeletionService.getGarageDeletionStatus(garageId).catch(() => null);
    if (status?.status === 'completed') return { ok: true };
    return { ok: false, errorCode, status, error };
  }
}

export function garageDeletionFailureMessage(
  attempt: Extract<GarageDeletionAttempt, { ok: false }>
): string {
  const code = attempt.errorCode;
  const status = attempt.status?.status;
  const retryAfter = Number((attempt.error as any)?.envelope?.retryAfterSeconds);

  if (code === 'RATE_LIMIT_EXCEEDED') {
    return `تم إرسال طلبات حذف كثيرة. انتظر ${retryAfter > 0 ? `${retryAfter} ثانية` : 'دقيقة'} قبل المحاولة مجدداً.`;
  }
  if (code === 'FORBIDDEN') return 'ليس لديك صلاحية حذف هذا الجراج.';
  if (code === 'GARAGE_NOT_FOUND') return 'لم يعد هذا الجراج موجوداً.';
  if (code === 'GARAGE_DELETION_TARGET_CHANGED') return 'تغيرت حالة الجراج أثناء الحذف، فأوقفنا العملية لحماية البيانات.';
  if (code === 'SESSION_REVOKED' || code === 'SESSION_EXPIRED' || code === 'UNAUTHORIZED') return 'انتهت جلسة الإدارة. سجّل الدخول مجدداً قبل المحاولة.';
  if (status === 'running' || code === 'GARAGE_DELETION_STILL_RUNNING') return 'ما زال حذف الجراج جارياً. انتظر قبل المحاولة مرة أخرى.';
  if (status === 'not_started') return 'لم يبدأ الحذف، والجراج ما زال موجوداً. تحقق من الاتصال قبل المحاولة مرة أخرى.';
  if (status === 'failed' || status === 'stale' || code === 'GARAGE_DELETION_STALE') return 'توقفت عملية الحذف قبل اكتمالها. يمكنك إعادة المحاولة لاستكمال البيانات المتبقية.';
  if (code === 'GARAGE_DELETION_QUERY_FAILED') return 'تعذرت قراءة جزء من بيانات الجراج. لم يتم تأكيد اكتمال الحذف؛ أعد المحاولة لاحقاً لاستكماله.';
  if (code === 'GARAGE_DELETION_WRITE_FAILED' || code === 'GARAGE_DELETION_TRANSACTION_FAILED') return 'تعذر حفظ خطوة من الحذف. لم يتم تأكيد اكتماله؛ أعد المحاولة لاحقاً لاستكماله.';
  if (code === 'ADMIN_SDK_NOT_INITIALIZED') return 'خدمة الحذف غير جاهزة حالياً. حاول مرة أخرى لاحقاً.';
  if (code === 'NETWORK_ERROR' || code === 'API_TIMEOUT' || code === 'REQUEST_TIMEOUT' || code === 'INVALID_RESPONSE') return 'انقطع الاتصال قبل تأكيد النتيجة. تحقق من حالة الحذف قبل المحاولة مجدداً.';
  return 'تعذر إكمال حذف الجراج. حاول مرة أخرى لاحقاً، وإذا استمرت المشكلة فتواصل مع الدعم.';
}
