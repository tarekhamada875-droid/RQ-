import { useCallback } from 'react';
import { Garage, Package, Supervisor } from '../types';
import { firestoreService } from '../services';
import type { GarageDeletionProgress } from '../services/garageService';
import { authService } from '../services/authService';
import { safeDate, normalizeDigits, normalizePhone } from '../utils';
import { APP_TEXT } from '../constants';
import { auth, db } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { claimEntitySession, releaseEntitySession, recordSessionAsClaimed, EntityRole } from '../services/authSessionService';
import { logDiagnostic } from '../utils/authDiagnosticLogger';

interface UseAdminAndGarageManagementProps {
  allGarages: Garage[];
  packages: Package[];
  delegate: any | null;
  currentSupervisor: Supervisor | null;
  loginPhone: string;
  setLoginPhone: (s: string) => void;
  setAdminPin: (s: string) => void;
  setActiveAdminPin: (s: string) => void;
  setUser: (u: any) => void;
  setGarage: (g: Garage | null) => void;
  setDelegate: (d: any | null) => void;
  setCurrentStaff: (s: any | null) => void;
  setCurrentSupervisor: (s: Supervisor | null) => void;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  setView: (view: any) => void;
  setIsLoading: (b: boolean) => void;
  setShowDeleteConfirm: (b: boolean) => void;
  setGarageDeletionProgress: (p: GarageDeletionProgress | null) => void;
  sessionId: string;
  isOnline: boolean;
  isLoading: boolean;
  closeKeyboard: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useAdminAndGarageManagement({
  allGarages,
  packages: _packages,
  delegate,
  currentSupervisor,
  loginPhone,
  setLoginPhone,
  setAdminPin,
  setActiveAdminPin,
  setUser,
  setGarage,
  setDelegate,
  setCurrentStaff,
  setCurrentSupervisor,
  setSelectedGarageForDetails,
  setView,
  setIsLoading,
  setShowDeleteConfirm,
  setGarageDeletionProgress,
  sessionId,
  isOnline,
  isLoading,
  closeKeyboard,
  showToast,
}: UseAdminAndGarageManagementProps) {

  // Login via single PIN / Phone credentials
  const handleGarageLogin = useCallback(async (overrideInput?: string) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return;
    }
    const rawInput = (typeof overrideInput === 'string' && overrideInput.trim().length > 0) ? overrideInput : loginPhone;
    const cleanInput = normalizeDigits(rawInput ? rawInput.trim() : '').replace(/\D/g, '');
    if (!cleanInput) {
      showToast('الرقم السري غير صحيح', 'error');
      return;
    }
    closeKeyboard();
    setIsLoading(true);

    logDiagnostic('LOGIN_ATTEMPT_STARTED', { cleanInputLength: cleanInput.length });

    try {
      let currentUser = auth.currentUser;
      logDiagnostic('LOGIN_CHECK_CURRENT_USER', {
        currentUserPresent: Boolean(currentUser),
        uid: currentUser?.uid || null,
        isAnonymous: currentUser?.isAnonymous || false,
      });

      if (!currentUser) {
        try {
          logDiagnostic('LOGIN_TRIGGERING_SIGN_IN_ANONYMOUSLY');
          const userCred = await signInAnonymously(auth);
          currentUser = userCred.user;
          setUser(currentUser);
          logDiagnostic('LOGIN_SIGN_IN_ANONYMOUSLY_SUCCESS', { uid: currentUser.uid });
        } catch (authErr: any) {
          logDiagnostic('LOGIN_SIGN_IN_ANONYMOUSLY_FAILED', {
            error: authErr?.message || String(authErr),
            code: authErr?.code || null,
          });
          console.error("Anonymous authentication failed during login:", authErr);
          const errMsg = authErr?.message || String(authErr);
          if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showToast('تعذر الاتصال بالخادم، يرجى إعادة المحاولة', 'error');
          } else {
            showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          }
          return;
        }
      }

      let idToken: string | undefined;
      try {
        idToken = await currentUser.getIdToken();
      } catch (tokenErr) {
        console.warn('Could not get idToken during login:', tokenErr);
      }

      logDiagnostic('LOGIN_AUTHENTICATING_CREDENTIALS');
      const authRes = await authService.authenticateUserCredentials({
        input: cleanInput,
        firebaseIdToken: idToken,
        uid: currentUser.uid,
        sessionId
      });

      if (!authRes || !authRes.success || !authRes.role) {
        logDiagnostic('LOGIN_AUTHENTICATE_CREDENTIALS_FAILED', { error: authRes?.error || 'INVALID_PIN' });
        const err = authRes?.error;
        if (
          err === 'SESSION_OCCUPIED' ||
          err === 'DELEGATE_SESSION_OCCUPIED' ||
          err === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
          err?.includes('مستخدم على جهاز آخر') ||
          err?.includes('نشط حالياً على جهاز آخر')
        ) {
          showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
        } else if (err === 'PIN_NOT_UNIQUE') {
          showToast('رقم السر مكرر؛ برجاء مراجعة الإدارة', 'error');
        } else if (err && err !== 'بيانات الدخول غير صحيحة' && err !== 'INVALID_PIN' && err !== 'تعذر الاتصال بخادم التحقق') {
          showToast(err, 'error');
        } else {
          showToast('الرقم السري غير صحيح', 'error');
        }
        return;
      }

      const { role, account } = authRes;
      const uid = currentUser.uid;
      const entityId = role === 'admin' ? 'auth_pin'
        : (role === 'supervisor' ? account?.id
        : (role === 'delegate' ? account?.id
        : (role === 'staff' ? account?.id
        : (role === 'garage' ? account?.id : null))));

      logDiagnostic('LOGIN_CREDENTIALS_AUTHENTICATED', { role, entityId, uid });

      if (!entityId) {
        showToast('الرقم السري غير صحيح', 'error');
        return;
      }

      if (authRes.sessionClaimed) {
        recordSessionAsClaimed(role, entityId, sessionId, uid);
        logDiagnostic('LOGIN_CLAIM_SESSION_SUCCESS', { role, entityId, serverClaimed: true });
      } else {
        try {
          logDiagnostic('LOGIN_CLAIMING_SESSION', { role, entityId, sessionId, uid });
          await claimEntitySession({
            role: role as EntityRole,
            entityId,
            sessionId,
            uid,
            pin: cleanInput
          });
          logDiagnostic('LOGIN_CLAIM_SESSION_SUCCESS', { role, entityId });
        } catch (claimErr: any) {
          logDiagnostic('LOGIN_CLAIM_SESSION_FAILED', {
            error: claimErr?.message || String(claimErr),
            code: claimErr?.code || null,
          });
          console.warn('Login session claim error:', claimErr);
          const errMsg = claimErr?.message || String(claimErr);
          if (
            errMsg === 'SESSION_OCCUPIED' ||
            errMsg === 'DELEGATE_SESSION_OCCUPIED' ||
            errMsg === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
            errMsg.includes('مستخدم على جهاز آخر')
          ) {
            showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
          } else if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
          } else {
            showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          }
          return;
        }
      }

      if (role === 'garage' && account) {
        if (account.status === 'pending' || account.status === 'rejected') {
          showToast('عذراً، هذا الحساب قيد المراجعة والإنشاء من قبل الإدارة', 'error');
          await releaseEntitySession({ role: 'garage', entityId, sessionId, uid }).catch(() => {});
          return;
        }
      } else if (role === 'staff' && account) {
        const gSnap = await getDoc(doc(db, 'garages', account.garageId));
        if (gSnap.exists()) {
          const linkedGarage = { id: gSnap.id, ...gSnap.data() } as Garage;
          if (linkedGarage.status === 'pending' || linkedGarage.status === 'rejected') {
            showToast('عذراً، هذا الحساب قيد المراجعة والإنشاء من قبل الإدارة', 'error');
            await releaseEntitySession({ role: 'staff', entityId, sessionId, uid }).catch(() => {});
            return;
          }
        }
      }

      const cleanAccount = account ? { ...account } : null;
      if (cleanAccount && cleanAccount.pin) {
        delete cleanAccount.pin;
      }

      setLoginPhone('');
      setAdminPin('');

      if (role === 'admin') {
        setActiveAdminPin(cleanInput);
        setView('admin_dashboard');
      } else if (role === 'supervisor') {
        setCurrentSupervisor(cleanAccount);
        setView('admin_dashboard');
      } else if (role === 'delegate') {
        setDelegate(cleanAccount);
        setView('delegate_dashboard');
      } else if (role === 'staff') {
        const gSnap = await getDoc(doc(db, 'garages', account.garageId));
        if (gSnap.exists()) {
          const gData = { id: gSnap.id, ...gSnap.data() } as Garage;
          if ((gData as any).pin) delete (gData as any).pin;
          setGarage(gData);
        }
        setCurrentStaff(cleanAccount);
        setView('garage');
      } else if (role === 'garage') {
        setGarage(cleanAccount);
        setCurrentStaff(null);
        setView('garage');
      }

    } catch (err: any) {
      console.error('Login critical error:', err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes('permission') || errMsg.includes('Permission')) {
        showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
      } else {
        showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, loginPhone, closeKeyboard, sessionId, showToast, setView, setGarage, setDelegate, setCurrentStaff, setCurrentSupervisor, setLoginPhone, setAdminPin, setActiveAdminPin, setUser, setIsLoading]);

  const handleDelegateLogin = useCallback(async (pin: string) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return;
    }
    const cleanPin = normalizeDigits(pin || '').replace(/\D/g, '');
    if (!cleanPin || cleanPin.length < 4) {
      showToast('الرقم السري غير صحيح', 'error');
      return;
    }
    closeKeyboard();
    setIsLoading(true);

    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        try {
          const userCred = await signInAnonymously(auth);
          currentUser = userCred.user;
          setUser(currentUser);
        } catch (authErr: any) {
          console.error("Anonymous authentication failed during delegate login:", authErr);
          showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          return;
        }
      }

      const authRes = await authService.authenticateUserCredentials({
        input: cleanPin,
        expectedRole: 'delegate',
        uid: currentUser.uid,
        sessionId
      });

      if (!authRes || !authRes.success || !authRes.role || authRes.role !== 'delegate') {
        const err = authRes?.error;
        if (
          err === 'SESSION_OCCUPIED' ||
          err === 'DELEGATE_SESSION_OCCUPIED' ||
          err === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
          err?.includes('مستخدم على جهاز آخر') ||
          err?.includes('نشط حالياً على جهاز آخر')
        ) {
          showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
        } else if (err === 'PIN_NOT_UNIQUE') {
          showToast('رمز الدخول غير صالح حالياً، يرجى مراجعة الإدارة', 'error');
        } else if (err && err !== 'بيانات الدخول غير صحيحة' && err !== 'INVALID_PIN' && err !== 'تعذر الاتصال بخادم التحقق') {
          showToast(err, 'error');
        } else {
          showToast('بيانات الدخول غير صحيحة أو الحساب ليس مندوباً', 'error');
        }
        return;
      }

      const { account } = authRes;
      const uid = currentUser.uid;
      const entityId = account?.id;
      if (!entityId) {
        showToast('بيانات الحساب غير مكتملة', 'error');
        return;
      }

      if (authRes.sessionClaimed) {
        recordSessionAsClaimed('delegate', entityId, sessionId, uid);
      } else {
        try {
          await claimEntitySession({
            role: 'delegate',
            entityId,
            sessionId,
            uid,
            pin: cleanPin
          });
        } catch (claimErr: any) {
          console.warn('Delegate login session claim error:', claimErr);
          const errMsg = claimErr?.message || String(claimErr);
          if (
            errMsg === 'SESSION_OCCUPIED' ||
            errMsg === 'DELEGATE_SESSION_OCCUPIED' ||
            errMsg === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
            errMsg.includes('مستخدم على جهاز آخر')
          ) {
            showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
          } else if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
          } else {
            showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          }
          return;
        }
      }

      const cleanAccount = account ? { ...account } : null;
      if (cleanAccount && cleanAccount.pin) {
        delete cleanAccount.pin;
      }

      setDelegate(cleanAccount);
      setView('delegate_dashboard');
    } catch (err: any) {
      console.error('Delegate login critical error:', err);
      showToast('حدث خطأ أثناء تسجيل الدخول؛ يرجى إعادة المحاولة', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, closeKeyboard, sessionId, showToast, setView, setDelegate, setUser, setIsLoading]);

  // Create new garage
  const createNewGarage = useCallback(async (e: React.FormEvent<HTMLFormElement>): Promise<boolean> => {
    if (currentSupervisor) {
      showToast('غير مصرح للمشرف بإضافة جراجات جديدة', 'error');
      return false;
    }
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return false;
    }
    e.preventDefault();
    setIsLoading(true);
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const data: any = Object.fromEntries(formData.entries());

      const isTrialRaw = formData.get('isTrial') || formData.get('isTrial_hidden');
      const isTrial = isTrialRaw === 'true' || isTrialRaw === 'on' || isTrialRaw === '1';
      data.isTrial = isTrial;
      if (isTrial) {
        const rawTrialDays = Number(formData.get('trialDays'));
        data.trialDays = rawTrialDays > 0 ? rawTrialDays : 15;
      }

      data.hasMonthlySubscribers = false;

      if (delegate && delegate.id) {
        const today = new Date();
        const delegateGaragesCreatedToday = allGarages.filter(g => {
          if (g.createdByDelegateId !== delegate.id) return false;
          if (!g.createdAt) return false;
          const createdDate = safeDate(g.createdAt);
          return createdDate.getDate() === today.getDate() &&
                 createdDate.getMonth() === today.getMonth() &&
                 createdDate.getFullYear() === today.getFullYear();
        });

        if (delegateGaragesCreatedToday.length >= 3) {
          showToast('عذراً، لقد وصلت للحد الأقصى اليومي المسموح به لإنشاء الجراجات وهو 3 جراجات في اليوم.', 'error');
          setIsLoading(false);
          return false;
        }

        data.createdByDelegateId = delegate.id;
        data.createdByDelegateName = delegate.name;
        data.isPending = true;
      }

      const pin = ((data.pin as string) || '').trim();
      const pinCheck = await firestoreService.isPinTaken(pin);
      if (pinCheck.taken) {
        showToast(`هذا الرمز السري (PIN) مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`, 'error');
        setIsLoading(false);
        return false;
      }

      const name = ((data.name as string) || '').trim();
      const phone = normalizePhone((data.phone as string) || '');
      const existing = allGarages.find(g => (phone && g.phone === phone) || g.name === name);
      if (existing) {
        showToast(APP_TEXT.ADMIN.DUPLICATE_ERROR, 'error');
        setIsLoading(false);
        return false;
      }

      const result = await firestoreService.createGarage(data);

      if (result.success) {
        showToast(delegate ? 'تم إرسال طلب إنشاء الجراج بنجاح بانتظار موافقة الإدارة' : APP_TEXT.ADMIN.ADD_SUCCESS);
        form.reset();
        closeKeyboard();
        return true;
      } else {
        showToast(result.error || 'حدث خطأ أثناء إنشاء الجراج', 'error');
        return false;
      }
    } catch (err: any) {
      console.error('createNewGarage error:', err);
      showToast(err.message || 'حدث خطأ أثناء إنشاء الجراج', 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, currentSupervisor, delegate, allGarages, showToast, closeKeyboard, setIsLoading]);

  // Delete garage
  const deleteGarage = useCallback(async (g: Garage | null) => {
    if (isLoading) return;
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!g) return;
    const garageId = g.id;
    closeKeyboard();
    setIsLoading(true);
    setGarageDeletionProgress({
      phase: 'preparing',
      processed: 0
    });

    try {
      await firestoreService.deleteGarage(garageId, setGarageDeletionProgress);
      setShowDeleteConfirm(false);
      setSelectedGarageForDetails(null);
      setView('admin_dashboard');
      showToast(APP_TEXT.ADMIN.DELETE_CONFIRM);
    } catch (error: any) {
      const errorCode = String(error?.code || error?.message || '');
      if (errorCode === 'FORBIDDEN' || errorCode === 'GARAGE_NOT_FOUND') {
        showToast(errorCode === 'FORBIDDEN' ? 'ليس لديك صلاحية حذف هذا الجراج.' : 'لم يعد هذا الجراج موجوداً.', 'error');
        return;
      }

      const deletionStatus = await firestoreService.getGarageDeletionStatus(garageId).catch(() => null);
      console.warn('[GarageDeletion] Delete request failed', {
        code: errorCode || 'UNKNOWN_ERROR',
        statusCode: error?.status || null,
        correlationId: error?.correlationId || null,
        jobStatus: deletionStatus?.status || 'unavailable'
      });

      if (deletionStatus?.status === 'completed') {
        setShowDeleteConfirm(false);
        setSelectedGarageForDetails(null);
        setView('admin_dashboard');
        showToast(APP_TEXT.ADMIN.DELETE_CONFIRM);
        return;
      }
      if (deletionStatus?.status === 'not_started') {
        const sessionError = ['SESSION_REVOKED', 'SESSION_EXPIRED', 'UNAUTHORIZED'].includes(errorCode);
        showToast(sessionError
          ? 'لم يبدأ الحذف، والجراج ما زال موجوداً. انتهت جلسة الإدارة؛ سجّل الدخول مجدداً قبل المحاولة.'
          : 'لم يبدأ الحذف، والجراج ما زال موجوداً. تحقق من الاتصال قبل المحاولة مرة أخرى.', 'error');
        return;
      }
      if (deletionStatus?.status === 'running') {
        showToast('ما زال حذف الجراج جارياً. انتظر ثم تحقق من الحالة قبل أي محاولة أخرى.', 'error');
        return;
      }
      if (deletionStatus?.status === 'failed' || deletionStatus?.status === 'stale') {
        showToast('توقفت عملية الحذف قبل اكتمالها. يمكنك إعادة المحاولة لاستكمال البيانات المتبقية.', 'error');
        return;
      }

      const safeMessages: Record<string, string> = {
        GARAGE_DELETION_FAILED: 'تعذر إكمال حذف الجراج. يمكنك إعادة المحاولة بعد مراجعة حالة العملية.',
        GARAGE_DELETION_QUERY_FAILED: 'تعذرت قراءة جزء من بيانات الجراج. لم يتم تأكيد اكتمال الحذف؛ يمكنك إعادة المحاولة لاستكماله.',
        GARAGE_DELETION_WRITE_FAILED: 'تعذر حفظ خطوة من الحذف. لم يتم تأكيد اكتمال العملية؛ يمكنك إعادة المحاولة لاستكمالها.',
        GARAGE_DELETION_TRANSACTION_FAILED: 'تعذرت معالجة خطوة من الحذف. يمكنك إعادة المحاولة لاستكمال العملية.',
        GARAGE_DELETION_TARGET_CHANGED: 'تغيرت حالة الجراج أثناء الحذف، فأوقفنا العملية لحماية البيانات.',
        GARAGE_DELETION_JOB_TOKEN_MISSING: 'تعذر استكمال طلب الحذف بأمان. أعد فتح نافذة الحذف للتحقق من الحالة.',
        GARAGE_DELETION_STALE: 'توقفت عملية الحذف قبل اكتمالها. أعد المحاولة لاستكمال حذف البيانات المتبقية.',
        GARAGE_DELETION_STILL_RUNNING: 'ما زال حذف الجراج جارياً. انتظر حتى تكتمل العملية قبل إعادة المحاولة.',
        GARAGE_DELETION_STATUS_UNKNOWN: 'تعذر التحقق من حالة الحذف. لم نعد بدء حذف آخر تلقائياً.',
        GARAGE_NOT_FOUND: 'لم يعد هذا الجراج موجوداً.',
        FORBIDDEN: 'ليس لديك صلاحية حذف هذا الجراج.',
        ADMIN_SDK_NOT_INITIALIZED: 'خدمة الحذف غير جاهزة حالياً. حاول مرة أخرى لاحقاً.',
        SESSION_REVOKED: 'انتهت جلسة الإدارة. سجّل الدخول مجدداً ثم تحقق من حالة الحذف.',
        SESSION_EXPIRED: 'انتهت جلسة الإدارة. سجّل الدخول مجدداً ثم تحقق من حالة الحذف.',
        UNAUTHORIZED: 'انتهت جلسة الإدارة. سجّل الدخول مجدداً ثم تحقق من حالة الحذف.',
        NETWORK_ERROR: 'تعذر الاتصال بالخادم. لم نتمكن من تأكيد حالة الحذف؛ تحقق من الاتصال قبل المحاولة مجدداً.',
        API_TIMEOUT: 'استغرق الاتصال وقتاً طويلاً. تحقق من حالة الحذف قبل المحاولة مجدداً.',
        REQUEST_TIMEOUT: 'استغرق الاتصال وقتاً طويلاً. تحقق من حالة الحذف قبل المحاولة مجدداً.',
        INVALID_RESPONSE: 'تعذر قراءة رد الخادم. تحقق من حالة الحذف قبل المحاولة مجدداً.',
        RATE_LIMIT_EXCEEDED: 'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم تحقق من حالة الحذف.'
      };
      showToast(safeMessages[errorCode] || 'تعذر تأكيد حالة الحذف. أعد تحميل الصفحة أو سجّل الدخول مجدداً قبل المحاولة مرة أخرى.', 'error');
    } finally {
      setIsLoading(false);
      setGarageDeletionProgress(null);
    }
  }, [isLoading, isOnline, closeKeyboard, showToast, setSelectedGarageForDetails, setView, setIsLoading, setShowDeleteConfirm, setGarageDeletionProgress]);

  // Update garage hourly/overnight rate
  const updateGarageRate = useCallback(async (g: Garage, field: 'hourlyRate' | 'overnightRate', value: number) => {
    try {
      await firestoreService.updateGarage(g.id, { [field]: value });
    } catch {
      // The caller has no recovery UI for this background rate update.
    }
  }, []);

  const addDelegate = useCallback((data: any) => firestoreService.addDelegate(data), []);
  const removeDelegate = useCallback((id: string) => firestoreService.removeDelegate(id), []);

  return {
    handleGarageLogin,
    handleDelegateLogin,
    createNewGarage,
    deleteGarage,
    updateGarageRate,
    addDelegate,
    removeDelegate,
  };
}
