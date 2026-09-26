import { ValidationError } from '../validation';
import { AuthRequest } from '../middleware';
import { canManageGarageScopedData as decideGarageScope } from '../domain/authorization';

/**
 * Domain Error Status Code Resolver
 */
export function mapDomainErrorToStatus(err: any): { statusCode: number; code: string; message: string } {
  if (err instanceof ValidationError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }

  const errMsg = String(err?.message || err || '');

  if (errMsg.includes('GARAGE_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'الجراج غير موجود' };
  }
  if (errMsg.includes('VEHICLE_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'السيارة غير موجودة بالداخل' };
  }
  if (errMsg.includes('REQUEST_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'الطلب غير موجود' };
  }
  if (errMsg.includes('PACKAGE_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'الباقة غير موجودة' };
  }
  if (errMsg.includes('SUBSCRIBER_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'المشترك غير موجود' };
  }

  if (errMsg.includes('VEHICLE_ALREADY_INSIDE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'هذه السيارة موجودة بالفعل بالداخل' };
  }
  if (errMsg.includes('VEHICLE_ALREADY_OUTSIDE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تم تسجيل خروج هذه السيارة بالفعل' };
  }
  if (errMsg.includes('CAPACITY_LIMIT_REACHED')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تم الوصول للحد الأقصى لسعة الجراج اليومية' };
  }
  if (errMsg.includes('FAIR_USE_LIMIT_REACHED')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تم الوصول للحد الأقصى للاستخدام العادل للباقة' };
  }
  if (errMsg.includes('SUBSCRIPTION_EXPIRED')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'انتهت صلاحية باقة الجراج، يرجى تجديد الاشتراك' };
  }
  if (errMsg.includes('GARAGE_CHECK_IN_LOCKED')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تسجيل الدخول معطل حالياً لهذا الجراج' };
  }
  if (errMsg.includes('MONTHLY_SUBSCRIBER_NOT_CHECKED_IN')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'هذه السيارة مسجلة كمشترك شهري' };
  }
  if (errMsg.includes('GARAGE_DELETION_IN_PROGRESS')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'جاري حذف بيانات الجراج، العمليات متوقفة' };
  }
  if (errMsg.includes('DAILY_DELETION_LIMIT_REACHED') || errMsg.includes('reached_daily_deletion_limit')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تم الوصول للحد الأقصى اليومي لعمليات الحذف' };
  }
  if (errMsg.includes('REQUEST_ALREADY_PROCESSED') || errMsg.includes('IDEMPOTENCY_KEY_REUSE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'تمت معالجة هذا الطلب بالفعل' };
  }
  if (errMsg.includes('INSUFFICIENT_BALANCE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'رصيد الجراج غير كافٍ لإتمام العملية' };
  }
  if (errMsg.includes('PIN_ALREADY_TAKEN')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'رمز PIN مستخدم بالفعل، يرجى اختيار رمز آخر' };
  }
  if (errMsg.includes('SUBSCRIBER_ALREADY_EXISTS')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'هذا المشترك مسجل بالفعل' };
  }
  if (errMsg.includes('SUBSCRIBER_PLATE_IMMUTABLE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'لا يمكن تعديل رقم لوحة المشترك بعد إنشائه' };
  }
  if (errMsg.includes('NO_REFERRAL_REWARDS_AVAILABLE')) {
    return { statusCode: 409, code: 'CONFLICT', message: 'لا توجد مكافآت إحالة متاحة للاستخدام' };
  }

  if (
    errMsg.includes('FORBIDDEN') ||
    errMsg.includes('UNAUTHORIZED_GARAGE_ACCESS') ||
    errMsg.includes('GARAGE_SCOPE_MISMATCH') ||
    errMsg.includes('ADMIN_ONLY') ||
    errMsg.includes('GARAGE_CANNOT_RECHARGE_OTHERS') ||
    errMsg.includes('ADMIN_OR_SUPERVISOR_ONLY')
  ) {
    return { statusCode: 403, code: 'FORBIDDEN', message: 'غير مصرح لك بإجراء هذه العملية' };
  }

  if (errMsg.includes('UNAUTHORIZED') || errMsg.includes('INVALID_ID_TOKEN') || errMsg.includes('SESSION_INACTIVE')) {
    return { statusCode: 401, code: 'UNAUTHORIZED', message: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً' };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع في الخادم' };
}

export function canManageGarageScopedData(req: AuthRequest, garageId: string): boolean {
  return decideGarageScope(req.user, garageId);
}
