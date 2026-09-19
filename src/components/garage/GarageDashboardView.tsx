import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LogOut,
  Car,
  X as XIcon,
  Users,
  Zap,
  PieChart,
  Sliders,
  AlertTriangle,
  Gift,
  Clock,
  Crown,
  Megaphone,
  Sparkles,
  FileText,
} from "lucide-react";
import { Announcement } from "../../types";
import { FlipNumber } from "../ui/FlipNumber";
import { AnimatedCounter } from "../AnimatedCounter";
import { useTheme } from "../../utils/ThemeContext";
import { 
  resolveShimmerColor, 
  isLightColor, 
  getRemainingSubscriptionInfo,
  safeDate, 
  getEffectiveDailyCapacity, 
  isUnlimitedCapacity, 
  isSubscriptionExpired,
  packageIdToDays
} from "../../utils";
import { soundManager } from "../../utils/sounds";
import { auth } from "../../firebase";
import { firestoreService } from '../../services';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { RegistrationCard } from "./RegistrationCard";
import { VehicleItem } from "./VehicleItem";
import { GarageDashboardOverlays } from "./GarageDashboardOverlays";
import { SmartActionPrompt } from "./SmartActionPrompt";

// Helper functions (mapped to actual modules)
const uo = resolveShimmerColor;
const ur = isLightColor;
const pt = safeDate;
const Qt = auth;
const me = firestoreService;
const Rn = soundManager;

export const GarageDashboardView = memo((props: any) => {
  const {
    garage: t,
    currentStaff: e,
    isInputFocused: s,
    now: a,
    vehicles: l,
    todayTransactions: c,
    setSelectedVehicle: d,
    setShowCheckOutModal: h,
    closeKeyboard: m,
    newPlateNumber: x,
    setNewPlateNumber: b,
    setIsInputFocused: y,
    plateInputRef: k,
    handleCheckIn: T,
    inputRef: D,
    onLogout: E,
    showToast: V,
    packages: F,
    staffList: q,
    showPackages: Y,
    setShowPackages: Q,
    showStaffStats: ce,
    setShowStaffStats: te,
    showSubscribers: R,
    setShowSubscribers: j,
    walletNumber: I = "",
    subscriptionPrices: A,
    isLoading = false,
  } = props;
  const [_, O] = useState(!1),
    { theme: P } = useTheme(),
    we = uo(t == null ? void 0 : t.shimmerColor, P),
    [ie, H] = useState("main"),
    [W, ke] = useState(15),
    [ve, Se] = useState(0),
    [z, X] = useState(!1),
    [ue, Te] = useState(!1),
    [Re, Le] = useState(null),
    [ze, yt] = useState(!1),
    [Oe, ot] = useState(!1),
    [os, is] = useState(!1),
    [zt, Xt] = useState(!1),
    [packagesInitialDuration, setPackagesInitialDuration] = useState<number | undefined>(undefined),
    [showTermsModal, setShowTermsModal] = useState(!1),
    Wt = useRef(null),
    Ft = useRef(null),
    [De, He] = useState(!!Qt.currentUser),
    [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]),
    [dismissedAnnouncements, setDismissedAnnouncements] = useState<Record<string, boolean>>({}),
    [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const visibleAnnouncement = activeAnnouncements.find(
    (announcement) => !dismissedAnnouncements[announcement.id]
  ) ?? null;

  const garageId = t?.id;

  useEffect(() => {
    const unsub = me.onAnnouncementsChange((list) => {
      const relevant = list.filter(a => a.isActive && (a.target === 'all' || a.targetGarageId === garageId));
      setActiveAnnouncements(relevant);
    });
    return () => unsub();
  }, [garageId]);
  useEffect(() => {
    const _e = Qt.onAuthStateChanged((st) => {
      He(!!st);
    });
    return () => _e();
  }, []);
  const [timeTicker, setTimeTicker] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const prevBalanceRef = useRef<number>(t?.balance || 0);
  useEffect(() => {
    if (t?.balance !== undefined) {
      if (t.balance > prevBalanceRef.current) {
        const diff = t.balance - prevBalanceRef.current;
        if (V) {
          V(`تم إضافة ${diff} ج.م للرصيد بنجاح`, 'success');
        }
        try {
          Rn.play('checkIn');
        } catch {
          // Audio feedback is optional and must not interrupt the balance update.
        }
      }
      prevBalanceRef.current = t.balance;
    }
  }, [t?.balance, V]);

  const packageDays = useMemo(() => {
      if (!t) return 30;
      return packageIdToDays(t.activePackageId || t.packageId || '', t.activePackageName || t.packageName || t.lastPackageName || '');
    }, [t]),
    isDailyPackage = packageDays <= 2,
    subInfo = useMemo(() => getRemainingSubscriptionInfo(t, packageDays), [t, packageDays, timeTicker]),
    at = useMemo(() => subInfo.days, [subInfo]),
    L = useMemo(() => at, [at]),
    isCountdownInHours = subInfo.unit === 'hours',
    countdownValue = subInfo.displayCount,
    isUrgentRed = subInfo.isUrgentRed,
    We = isDailyPackage ? (isCountdownInHours && L === 1) : (L > 0 && L <= 3) || isUrgentRed,
    se = useMemo(
      () =>
        l.length > 0
          ? l.length
          : typeof t.carsInside == "number"
            ? Math.max(0, t.carsInside)
            : 0,
      [l.length, t.carsInside],
    );
  const Ns = isSubscriptionExpired(t),
    ne = t.isLocked || t.isSuspended || !1;
  useEffect(() => {
    if (!De) return;
    const _e = me.subscribeToGarageRechargeLogs(t.id, (st) => {
      // Filter out claim/usage logs so they never trigger recharge/gift celebration popups
      const candidateLogs = (st || []).filter((log: any) => {
        if (!log) return false;
        if (log.details?.type === 'use_referral_reward') return false;
        if (log.plateNumber && String(log.plateNumber).includes('استخدام مكافأة')) return false;
        return true;
      });

      const lastAckId = localStorage.getItem(`acknowledged_recharge_${t.id}`);
      const lastAckTime = Number(localStorage.getItem(`acknowledged_recharge_time_${t.id}`) || 0);

      if (candidateLogs.length > 0) {
        const latest = candidateLogs[0];
        const Ue = latest.id;
        const wt = pt(latest.timestamp);
        const logTime = wt.getTime();
        const Ht = Date.now() - logTime;
        const isRecent = Ht < 15 * 60 * 1e3;
        const isAcknowledged = lastAckId === Ue || (lastAckTime > 0 && logTime <= lastAckTime);

        if (!isAcknowledged && isRecent) {
          Te(true);
          Le(latest);
          yt(true);
          if (localStorage.getItem(`dashboard_sound_recharge_${t.id}`) !== Ue) {
            try {
              Rn.play("checkIn");
            } catch (Ia) {
              console.error(Ia);
            }
            localStorage.setItem(`dashboard_sound_recharge_${t.id}`, Ue);
          }
        } else {
          Te(false);
          Le(null);
          yt(false);
        }
      } else if (t?.lastRechargeDate) {
        const wt = pt(t.lastRechargeDate);
        const logTime = wt.getTime();
        const Ht = Date.now() - logTime;
        const fallbackId = `recharge_${logTime}`;
        const isRecent = Ht < 15 * 60 * 1e3;
        const isAcknowledged = lastAckId === fallbackId || (lastAckTime > 0 && logTime <= lastAckTime);

        if (!isAcknowledged && isRecent) {
          const fallbackLog: any = {
            id: fallbackId,
            garageId: t.id,
            actionType: 'recharge',
            plateNumber: t.lastRechargePackageName ? `شحن باقة: ${t.lastRechargePackageName}` : 'شحن رصيد الجراج',
            amount: t.lastRechargeAmount || 0,
            timestamp: t.lastRechargeDate,
            details: {
              packageName: t.lastRechargePackageName || 'الباقة',
              revenueAmount: t.lastRechargeAmount || 0,
              isTrial: Boolean(t?.isTrial)
            }
          };
          Te(true);
          Le(fallbackLog);
          yt(true);
          if (localStorage.getItem(`dashboard_sound_recharge_${t.id}`) !== fallbackId) {
            try {
              Rn.play("checkIn");
            } catch (Ia) {
              console.error(Ia);
            }
            localStorage.setItem(`dashboard_sound_recharge_${t.id}`, fallbackId);
          }
        } else {
          Te(false);
          Le(null);
          yt(false);
        }
      } else {
        Te(false);
        Le(null);
        yt(false);
      }
    }, 1);
    return () => _e();
  }, [t.id, De, t?.lastRechargeDate, t?.lastRechargeAmount, t?.lastRechargePackageName]);
    useEffect(
      () => () => {
        document.body.style.overflow = "unset";
      },
      [ne],
    );
    useEffect(() => {
      if (De && !e && t?.hasMonthlySubscribers) {
          const _e = me.subscribeToSubscribers(t.id, (st) => {
            const Ue = new Date();
            Ue.setHours(0, 0, 0, 0);
            let Zt = 0;
            st.forEach((wt) => {
              const Es = new Date(wt.endDate);
              if (Math.ceil((Es.getTime() - Ue.getTime()) / (1e3 * 60 * 60 * 24)) <= 3) {
                Zt++;
              }
            });
            Se(Zt);
        });
        return () => _e();
      }
    }, [t.id, e, De, t?.hasMonthlySubscribers]);
  const $e = useCallback(() => {
    if (Re) {
      localStorage.setItem(`acknowledged_recharge_${t.id}`, Re.id);
      const logTime = pt(Re.timestamp).getTime();
      if (logTime > 0) {
        localStorage.setItem(`acknowledged_recharge_time_${t.id}`, String(logTime));
      }
    }
    Te(false);
    yt(false);
  }, [t.id, Re]);
  useEffect(() => {
    ke(15);
  }, [ie]);
  const sortedVehicles = useMemo(() => {
    return [...(l || [])].sort((a, b) => safeDate(b.entryTime).getTime() - safeDate(a.entryTime).getTime());
  }, [l]);
  const ls = sortedVehicles.slice(0, W);
  useEffect(() => {
    const _e = new IntersectionObserver(
      (st) => {
        if (st[0].isIntersecting && W < l.length) {
          ke((Ue) => Ue + 10);
        }
      },
      {
        threshold: 0.1,
        root: Ft.current,
        rootMargin: "100px",
      },
    );
    if (Wt.current) {
      _e.observe(Wt.current);
    }
    return () => _e.disconnect();
  }, [l.length, W, ie]);
  const ys = (_e) => {
    O(!1);
    j(_e === "subscribers");
    ot(_e === "reports");
    Q(_e === "packages");
    is(_e === "rewards");
    X(_e === "history");
    te(_e === "staff");
    Xt(_e === "appearance");
    setShowTermsModal(_e === "terms");
  };
  return (
    <div
      className="h-screen h-[100dvh] bg-[#faf9f6] dark:bg-transparent font-sans w-full flex flex-col items-center overflow-hidden relative"
      dir="rtl"
    >
      {!s && (
        <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
          {
            <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
              {
                <div className="flex items-center">
                  {!visibleAnnouncement ? (
                    <div className="h-11 px-4 bg-slate-900 dark:bg-slate-800 border border-slate-900 dark:border-slate-800 text-white rounded-2xl flex items-center justify-center shadow-sm font-black text-xs select-none">
                      <span className="text-slate-100 dark:text-slate-200">
                        {t.name}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="h-11 w-11 bg-slate-900 dark:bg-slate-800 border border-slate-900 dark:border-slate-800 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm select-none pointer-events-none"
                      title={t.name}
                    >
                      <Crown className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              }
              {visibleAnnouncement && (
                <button
                  type="button"
                  aria-label="عرض الإعلان المهم"
                  onClick={() => {
                    setSelectedAnnouncement(visibleAnnouncement);
                    setDismissedAnnouncements((previous) => ({
                      ...previous,
                      [visibleAnnouncement.id]: true,
                    }));
                  }}
                  className="absolute left-1/2 -translate-x-1/2 h-11 max-w-[min(60vw,280px)] px-4 bg-[#f8f6f0] dark:bg-slate-800 border-2 border-[#1a1915] dark:border-slate-700 rounded-2xl shadow-[2px_2px_0px_0px_#1a1915] dark:shadow-none font-black text-xs truncate transition-transform active:translate-y-[2px] active:shadow-none flex items-center justify-center"
                >
                  <span className={`inline-flex items-center gap-2 truncate ${
                    visibleAnnouncement.priority === 'urgent' ? 'text-red-600 dark:text-red-400' :
                    visibleAnnouncement.priority === 'important' ? 'text-amber-600 dark:text-amber-400' :
                    'text-[#1a1915] dark:text-amber-400'
                  }`}>
                    <Megaphone className="w-4 h-4 shrink-0" />
                    <span className="truncate">إعلان مهم</span>
                  </span>
                </button>
              )}
              {
                <div className="flex items-center gap-3">
                  {
                    <button
                      type="button"
                      onClick={() => O(!_)}
                      className={"relative w-11 h-11 border rounded-2xl flex items-center justify-center transition-all outline-none ".concat(
                        _
                          ? "bg-red-600 text-white border-red-700"
                          : "bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700",
                      )}
                    >
                      {(ve > 0 || ue) && !_ && (
                        <span
                          className={"absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ".concat(
                            ue ? "bg-emerald-500" : "bg-red-500",
                          )}
                        />
                      )}
                      {_ ? (
                        <XIcon className="w-6 h-6 stroke-[3]" />
                      ) : (
                        <Users className="w-6 h-6 stroke-[3]" />
                      )}
                    </button>
                  }
                </div>
              }
            </div>
          }
        </header>
      )}
      {
        <AnimatePresence>
          {_ && (
            <React.Fragment>
              {
                <motion.div
                  initial={{
                    opacity: 0,
                  }}
                  animate={{
                    opacity: 1,
                  }}
                  exit={{
                    opacity: 0,
                  }}
                  onClick={() => O(!1)}
                  className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 z-[150] pointer-events-auto"
                  style={{
                    willChange: "opacity",
                    transform: "translate3d(0, 0, 0)",
                    backfaceVisibility: "hidden",
                  }}
                />
              }
              {
                <motion.div
                  initial={{
                    x: "-100%",
                    opacity: 0,
                  }}
                  animate={{
                    x: 0,
                    opacity: 1,
                  }}
                  exit={{
                    x: "-100%",
                    opacity: 0,
                  }}
                  transition={{
                    type: "spring",
                    damping: 26,
                    stiffness: 220,
                  }}
                  className="fixed top-3 bottom-3 left-3 w-[220px] xs:w-[245px] max-w-[calc(100vw-24px)] bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800/80 z-[150] flex flex-col overflow-hidden pointer-events-auto"
                  style={{
                    willChange: "transform, opacity",
                    transform: "translate3d(0, 0, 0)",
                    backfaceVisibility: "hidden",
                  }}
                  dir="rtl"
                >
                  {
                    <div className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                      {
                        <div className="flex items-center justify-between">
                          {
                            <div className="flex items-center gap-2">
                              {
                                <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center font-extrabold shrink-0 shadow-sm">
                                  <Crown className="w-5 h-5 text-amber-400 dark:text-slate-950" />
                                </div>
                              }
                              {
                                <div className="flex flex-col min-w-0">
                                  {
                                    <span className="text-mobile-wrap text-xs font-black text-slate-900 dark:text-slate-100 max-w-[120px] leading-snug">
                                      {e ? e.name : "مدير الجراج"}
                                    </span>
                                  }
                                </div>
                              }
                            </div>
                          }
                          {
                            <button
                              type="button"
                              onClick={() => O(!1)}
                              className="w-8 h-8 bg-red-500 dark:bg-red-600 text-white rounded-lg flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors outline-none shrink-0"
                            >
                              {<XIcon className="w-5 h-5" />}
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                  {
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar-slate">
                      {
                        <div className="space-y-2">
                          {!e && t?.hasMonthlySubscribers && (
                            <button
                              onClick={() => ys("subscribers")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {<Users className="w-4 h-4 text-amber-400 dark:text-slate-950" />}
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      الاشتراكات
                                    </span>
                                  }
                                </div>
                              }
                              {ve > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white dark:bg-red-500 dark:text-slate-950 text-xs font-black">
                                  {ve}
                                </span>
                              )}
                            </button>
                          )}
                          {!e && (
                            <button
                              onClick={() => ys("reports")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer animate-fade-in"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <PieChart className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      التقارير الذكية
                                    </span>
                                  }
                                </div>
                              }
                            </button>
                          )}
                          {
                            <button
                              onClick={() => ys("packages")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <Zap className="w-4 h-4 fill-current text-amber-400 dark:text-slate-950" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      شحن الرصيد والباقات
                                    </span>
                                  }
                                </div>
                              }
                            </button>
                          }
                          {!e && (
                            <button
                              onClick={() => ys("rewards")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer animate-fade-in"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <Gift className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      المكافآت
                                    </span>
                                  }
                                </div>
                              }
                            </button>
                          )}
                          {
                            <button
                              onClick={() => ys("history")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <Clock className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      تاريخ الشحن
                                    </span>
                                  }
                                </div>
                              }
                              {ue && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-black flex items-center gap-1">
                                  {
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                  }
                                  شحن جديد
                                </span>
                              )}
                            </button>
                          }
                          {
                            <button
                              onClick={() => ys("appearance")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <Sliders className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      إعدادات المظهر
                                    </span>
                                  }
                                </div>
                              }
                            </button>
                          }
                          {
                            <button
                              onClick={() => ys("terms")}
                              className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none cursor-pointer"
                            >
                              {
                                <div className="flex items-center gap-2.5">
                                  {
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
                                      {
                                        <FileText className="w-4 h-4" />
                                      }
                                    </div>
                                  }
                                  {
                                    <span className="font-bold text-sm">
                                      الشروط والأحكام
                                    </span>
                                  }
                                </div>
                              }
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                  {
                    <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/40">
                      {
                        <button
                          onClick={() => {
                            O(!1);
                            E();
                          }}
                          className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-black text-sm outline-none"
                        >
                          {<LogOut className="w-5 h-5 rotate-180" />}
                          {<span>تسجيل الخروج</span>}
                        </button>
                      }
                    </div>
                  }
                </motion.div>
              }
            </React.Fragment>
          )}
        </AnimatePresence>
      }
      {
        <main
          className={"max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 [@media(max-height:500px)]:p-2.5 w-full flex-1 flex flex-col gap-4 md:gap-6 [@media(max-height:500px)]:gap-2.5 overscroll-contain overflow-y-auto ".concat(
            s ? "gap-3 pt-3 pb-3" : "gap-4",
          )}
        >
          {/* Removed old announcements banner from here */}

          {/* Removed Expiry Warning Banner as requested */}

          {(() => {
            const todayStr = getCairoDateKey();
            const displayTodayCount = t.lastTransactionDate === todayStr ? (t.todayCount || 0) : 0;
            const isDailyLimitReached = !isUnlimitedCapacity(t) && displayTodayCount >= getEffectiveDailyCapacity(t);

            if ((s && ie === "main") || isDailyLimitReached || Ns) {
              return null;
            }

            const hasWarning = (isUrgentRed || L <= 0) || (We && !isUrgentRed && L === 1);

            return (
              <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
                {/* RIGHT CARD: Subscription countdown */}
                <div
                  className={`flex-1 transition-all duration-300 ${
                    hasWarning ? "py-2 md:py-4 px-3 md:px-6" : "py-2.5 md:py-6 px-4 md:px-6"
                  } rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden ${
                    isUrgentRed || L <= 0
                      ? "bg-slate-900 border-red-500/50"
                      : We
                        ? "bg-slate-900 border-amber-500/50"
                        : "bg-[#faf9f6] dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {/* Trial Badge */}
                  {t?.isTrial && (
                    <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10">
                      <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] md:text-[11px] font-black px-2 py-0.5 md:px-2.5 md:py-0.5 rounded-full border border-amber-500/30 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5" />
                        <span>تجريبي</span>
                      </span>
                    </div>
                  )}

                  <div className={`${hasWarning ? "text-[11px] md:text-xs mb-0.5" : "text-xs md:text-sm mb-1"} font-bold text-slate-500 dark:text-slate-400 z-10`}>
                    الرصيد المتبقي
                  </div>

                  {/* Countdown */}
                  <div className="py-0.5 flex items-center justify-center overflow-visible z-10">
                    <div
                      className={`${
                        hasWarning ? "text-lg md:text-3xl gap-1.5" : "text-2xl md:text-4xl gap-2"
                      } font-black transition-colors duration-300 flex items-center ${
                        isUrgentRed || L <= 0
                          ? "text-red-500"
                          : We
                            ? "text-amber-400"
                            : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      <span className={`${hasWarning ? "text-2xl md:text-4xl" : "text-4xl md:text-7xl"} font-extrabold font-mono tracking-tight`}>
                        <AnimatedCounter value={countdownValue} disableColorChange={!0} />
                      </span>
                      <span className={hasWarning ? "text-sm md:text-xl font-bold" : ""}>
                        {isCountdownInHours
                          ? (countdownValue === 1
                              ? "ساعة"
                              : countdownValue === 2
                                ? "ساعتين"
                                : countdownValue >= 3 && countdownValue <= 10
                                  ? "ساعات"
                                  : "ساعة")
                          : (countdownValue === 1
                              ? "يوم"
                              : countdownValue === 2
                                ? "يومين"
                                : countdownValue >= 3 && countdownValue <= 10
                                  ? "أيام"
                                  : "يوماً")}
                      </span>
                    </div>
                  </div>

                  {/* Subtle Footer Warning if Urgent or Very close */}
                  {(isUrgentRed || L <= 0) && (
                    <div className="mt-1 bg-red-500/10 border border-red-500/20 text-red-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      {L <= 0 ? "منتهي" : "ينتهي قريباً جداً"}
                    </div>
                  )}
                  {(We && !isUrgentRed && L === 1) && (
                    <div className="mt-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      يجب الشحن اليوم
                    </div>
                  )}
                </div>

                {/* LEFT CARD: Daily cars info (For Limited Subscriptions) */}
                {!isUnlimitedCapacity(t) && (
                  <div className="flex-1 transition-all duration-300 py-2.5 md:py-6 px-4 md:px-6 rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden bg-[#faf9f6] dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">العدد اليومي</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl md:text-6xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
                        {displayTodayCount}
                      </span>
                      <span className="text-lg md:text-2xl font-bold text-slate-400 font-mono">
                        /{getEffectiveDailyCapacity(t)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {ie === "main" ? (
            <React.Fragment>
              {(() => {
                const todayStr = getCairoDateKey();
                const displayTodayCount = t.lastTransactionDate === todayStr ? (t.todayCount || 0) : 0;
                const isDailyLimitReached = !isUnlimitedCapacity(t) && displayTodayCount >= getEffectiveDailyCapacity(t);

                // Trials and paid packages are time-based access, not wallet
                // credit. Wallet balance is only used to buy the next package;
                // it must not block check-in while the current entitlement is active.
                const isActiveTrial = t.isTrial === true && !Ns;
                const hasActivePaidPackage = !Ns && (
                  t.billingModel === 'subscription' || Boolean(t.activePackageName || t.packageName)
                );
                const isBalanceDepleted = Number(t.balance || 0) <= 0 && !isActiveTrial && !hasActivePaidPackage;
                if (isBalanceDepleted || isDailyLimitReached || Ns) {
                  return (
                    <SmartActionPrompt
                      garage={t}
                      packages={F}
                      walletNumber={I}
                      onOpenPackages={(dur) => {
                        setPackagesInitialDuration(dur);
                        if (Q) {
                          Q(true);
                        }
                      }}
                      showToast={V}
                      isDailyLimitReached={isDailyLimitReached}
                      isExpired={Ns}
                      packageDurationDays={packageDays}
                      todayCount={displayTodayCount}
                      dailyCapacity={getEffectiveDailyCapacity(t)}
                    />
                  );
                }
                return null;
              })() || (
                <React.Fragment>
                  <RegistrationCard
                    newPlateNumber={x}
                    setNewPlateNumber={b}
                    isInputFocused={s}
                    setIsInputFocused={y}
                    plateInputRef={k}
                    vehicles={l}
                    garage={t}
                    handleCheckIn={T}
                    onCheckOut={(_e) => {
                      d(_e);
                      h(!0);
                    }}
                    closeKeyboard={m}
                    inputRef={D}
                    shimmerActive={!0}
                    isLoading={isLoading}
                  />
                </React.Fragment>
              )}
              {!s && (
                <div className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-[2rem] overflow-hidden flex flex-col items-center pt-4 md:pt-10 [@media(max-height:500px)]:pt-2 transition-colors w-full shadow-sm relative shrink-0">
                  {
                    <div
                      onClick={() => H("active_vehicles")}
                      className="mb-4 md:mb-10 [@media(max-height:500px)]:mb-2 cursor-pointer w-full flex justify-center"
                    >
                      <div className="relative flex flex-col items-center w-full px-4 md:px-8">
                        <FlipNumber value={t.carsInside || 0} size="lg" />
                      </div>
                    </div>
                  }
                  {
                    <button
                      onClick={() => H("active_vehicles")}
                      className="w-full h-6 md:h-7 [@media(max-height:500px)]:h-5 relative overflow-hidden group outline-none select-none flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        backgroundColor: we,
                      }}
                    >
                      {
                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                          {
                            <div
                              className={"w-7 h-7 md:w-8 md:h-8 [@media(max-height:500px)]:w-6 [@media(max-height:500px)]:h-6 rounded-full flex items-center justify-center border-2 shadow-md group-hover:scale-110 transition-all ".concat(
                                ur(we) ? "text-slate-900" : "text-white",
                              )}
                              style={{
                                backgroundColor: we,
                                borderColor: "".concat(we, "80"),
                              }}
                            >
                              {
                                <Car
                                  className={"w-3.5 h-3.5 md:w-4 md:h-4 [@media(max-height:500px)]:w-3 [@media(max-height:500px)]:h-3 group-active:translate-y-0.5 transition-transform ".concat(
                                    ur(we) ? "text-slate-900" : "text-white",
                                  )}
                                />
                              }
                            </div>
                          }
                        </div>
                      }
                    </button>
                  }
                </div>
              )}
            </React.Fragment>
          ) : (
            <React.Fragment>
              {
                <div className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border border-slate-150 dark:border-slate-800 overflow-hidden flex flex-col flex-1 min-h-[400px] md:min-h-[500px] transition-colors w-full shadow-sm">
                  {
                    <div className="p-3 md:p-4 px-4 md:px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0 transition-colors">
                      {
                        <div className="flex items-center gap-3">
                          {
                            <div className="w-8 h-8 md:w-11 md:h-11 bg-slate-900 dark:bg-slate-800 rounded-lg flex items-center justify-center text-white transition-all">
                              {
                                <Car className="w-4 h-4 md:w-6 md:h-6" />
                              }
                            </div>
                          }
                          {
                            <div>
                              {
                                <h3 className="font-black text-slate-900 dark:text-white text-sm md:text-lg uppercase tracking-tight">
                                  إجمالى العدد {se}
                                </h3>
                              }
                            </div>
                          }
                        </div>
                      }
                      {
                        <div className="flex items-center gap-3">
                          {
                            <button
                              onClick={() => H("main")}
                              className="w-8 h-8 md:w-11 md:h-11 bg-red-500 dark:bg-red-600 text-white rounded-xl flex shrink-0 items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors outline-none shadow-sm"
                            >
                              {<XIcon className="w-4 h-4 md:w-5 md:h-5" />}
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                  {
                    <div
                      ref={Ft}
                      className="divide-y divide-slate-100 dark:divide-slate-800 flex-1 overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y bg-[#faf9f6] dark:bg-slate-900 transition-colors"
                    >
                      {ls.map((_e) => (
                        <VehicleItem
                          key={_e.id || _e.plateNumber}
                          vehicle={_e}
                          onCheckOut={(st) => {
                            m();
                            d(st);
                            h(!0);
                          }}
                        />
                      ))}
                      {W < l.length && (
                        <div
                          ref={Wt}
                          className="py-8 flex justify-center items-center"
                        >
                          {
                            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                          }
                        </div>
                      )}
                      {l.length === 0 && (
                        <div className="py-16 md:py-24 text-center flex flex-col items-center gap-4">
                          <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700">
                            <Car className="w-10 h-10 md:w-12 md:h-12 text-slate-300 dark:text-slate-600" />
                          </div>
                          <p className="text-lg md:text-xl font-black text-slate-400 dark:text-slate-500">
                            لا توجد سيارات حالياً
                          </p>
                          <p className="text-xs font-bold text-slate-300 dark:text-slate-600">
                            اكتب رقم اللوحة واضغط "ساعة" أو "مبيت" لتسجيل أول عربية
                          </p>
                          {!Ns && (
                            <button
                              onClick={() => H("main")}
                              className="mt-6 text-sm md:text-base font-black text-emerald-500 uppercase tracking-widest border-b-2 border-emerald-500/20 pb-0.5"
                            >
                              سجل دخول عربية جديدة
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  }
                </div>
              }
            </React.Fragment>
          )}
          {
            <div
              className={"mt-auto mb-2 py-4 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] md:text-xs tracking-wider uppercase transition-all duration-300 ".concat(
                s || ie !== "main"
                  ? "opacity-0 h-0 overflow-hidden pointer-events-none py-0 my-0"
                  : "opacity-100",
              )}
            >
              {
                <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
              }
              {
                <span className="brand-shimmer-text">
                  ARQ FOR SOFTWARE DEVELOPMENT
                </span>
              }
              {
                <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
              }
            </div>
          }
        </main>
      }
      <GarageDashboardOverlays
        garage={t}
        adminPhone={I}
        isLocked={ne}
        isSubscribersOpen={R}
        isRechargeHistoryOpen={z}
        isPackagesOpen={Y}
        isRewardsOpen={os}
        isStaffStatsOpen={ce}
        isReportsOpen={Oe}
        isAppearanceOpen={zt}
        showTermsModal={showTermsModal}
        showToast={V}
        onToggleMenu={() => O(!_)}
        onCloseSubscribers={() => j(!1)}
        onCloseRechargeHistory={() => { X(!1); Te(!1); }}
        onClosePackages={() => { Q(!1); setPackagesInitialDuration(undefined); }}
        onCloseRewards={() => is(!1)}
        onCloseStaffStats={() => te(!1)}
        onCloseReports={() => ot(!1)}
        onCloseAppearance={() => Xt(!1)}
        onCloseTerms={() => setShowTermsModal(false)}
        packages={F}
        subscriptionPrices={A}
        packagesInitialDuration={packagesInitialDuration}
        currentStaff={e}
        staffList={q}
        vehiclesInside={l}
        todayExitedVehicles={c}
        now={a}
        isRechargeNotificationOpen={ze}
        rechargeLog={Re}
        onCloseRechargeNotification={$e}
        selectedAnnouncement={selectedAnnouncement}
        onCloseAnnouncement={() => setSelectedAnnouncement(null)}
      />
    </div>
  );
});
