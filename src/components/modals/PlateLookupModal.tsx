import React, { useState, memo } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Search, 
  Car, 
  MapPin, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Building2,
  Clock,
  Coins,
  ShieldCheck,
  History
} from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { LicensePlateKeyboard } from '../garage/LicensePlateKeyboard';
import { Garage, Vehicle, Subscriber, ActivityLog } from '../../types';
import { 
  getRawPlate, 
  getCleanPlate, 
  calculateCost, 
  safeDate, 
  getDuration
} from '../../utils';
import { firestoreService } from '../../services';

interface PlateLookupModalProps {
  allGarages: Garage[];
  onClose: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
}

export const PlateLookupModal: React.FC<PlateLookupModalProps> = memo(({
  allGarages,
  onClose,
  showToast
}) => {
  const [plateInput, setPlateInput] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Search Results State
  const [activeVehicles, setActiveVehicles] = useState<Array<{ vehicle: Vehicle; garage: Garage; accruedCost: number }>>([]);
  const [vehicleHistory, setVehicleHistory] = useState<Array<{ vehicle: Vehicle; garageName: string }>>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ subscriber: Subscriber; garageName: string }>>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const rawInput = getRawPlate(plateInput);

  const handleKeyPress = (key: string) => {
    const nextVal = getCleanPlate(plateInput + key);
    setPlateInput(nextVal);
  };

  const handleClear = () => {
    setPlateInput('');
    setHasSearched(false);
    setActiveVehicles([]);
    setVehicleHistory([]);
    setSubscriptions([]);
    setActivityLogs([]);
  };

  const handleDeleteLastChar = () => {
    setPlateInput(prev => prev.slice(0, -1));
  };

  const handleExecuteSearch = async (overridePlate?: string) => {
    const targetPlate = overridePlate || plateInput;
    const targetRaw = getRawPlate(targetPlate);

    if (!targetRaw || targetRaw.length === 0) {
      if (showToast) showToast('يرجى إدخال أرقام أو حروف اللوحة أولاً', 'error');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const now = new Date();
      const foundActive: Array<{ vehicle: Vehicle; garage: Garage; accruedCost: number }> = [];
      const foundHistory: Array<{ vehicle: Vehicle; garageName: string }> = [];
      const foundSubs: Array<{ subscriber: Subscriber; garageName: string }> = [];

      // Search in parallel across all garages
      const garagePromises = allGarages.map(async (garage) => {
        try {
          // Query matching vehicles for this plate directly
          const matchedVehicles = await firestoreService.getVehiclesByPlateOnce(garage.id, targetRaw);

          matchedVehicles.forEach(v => {
            if (v.status === 'inside') {
              const cost = calculateCost(v, garage, now);
              foundActive.push({ vehicle: v, garage, accruedCost: cost });
            } else {
              foundHistory.push({ vehicle: v, garageName: garage.name });
            }
          });

          // Fetch subscriber info if any
          const subDoc = await firestoreService.getSubscriberByPlateOnce(garage.id, targetRaw);
          if (subDoc) {
            foundSubs.push({ subscriber: subDoc, garageName: garage.name });
          }
        } catch (err) {
          console.error(`Error searching in garage ${garage.name}:`, err);
        }
      });

      await Promise.all(garagePromises);

      // Fetch Activity Logs matching the plate across system
      const systemLogs = await firestoreService.getSystemLogsByPlateOnce(targetRaw);

      setActiveVehicles(foundActive);
      setVehicleHistory(foundHistory);
      setSubscriptions(foundSubs);
      setActivityLogs(systemLogs);

      // On mobile screens, collapse keyboard after search so results fit cleanly
      if (window.innerWidth < 1024) {
        setShowKeyboard(false);
      }

    } catch (err) {
      console.error('Error executing plate lookup:', err);
      if (showToast) showToast('حدث خطأ أثناء إجراء الاستعلام', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-6xl h-[94vh] sm:h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100"
      >
        {/* Top Header */}
        <div className="p-3.5 px-5 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-center text-amber-400 shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                استعلام وتتبع السيارات
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  جميع الجراجات
                </span>
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center transition-all cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* HUD Main Workspace Split */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden custom-scrollbar-slate">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            
            {/* Left Column: Plate Input & Keyboard (5 cols on lg) */}
            <div className="lg:col-span-5 flex flex-col bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-amber-400" />
                  أدخل رقم اللوحة:
                </span>
                
                <div className="flex items-center gap-1.5">
                  {plateInput && (
                    <>
                      <button
                        onClick={handleDeleteLastChar}
                        className="text-[11px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md transition-all cursor-pointer"
                      >
                        تراجع
                      </button>
                      <button
                        onClick={handleClear}
                        className="text-[11px] font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        مسح
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Egyptian Plate Display */}
              <div className="py-2 flex justify-center bg-slate-900/80 border border-slate-800 rounded-xl p-2 shadow-inner">
                <EgyptianPlate plateNumber={plateInput || 'أ ب ج 1 2 3'} size="md" />
              </div>

              {/* Instant Search Button */}
              <button
                onClick={() => handleExecuteSearch()}
                disabled={isSearching || !rawInput}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-98 text-slate-950 font-black text-sm py-2.5 px-4 rounded-xl shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSearching ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    جاري الاستعلام...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    عرض بيانات اللوحة
                  </>
                )}
              </button>

              {/* Embedded Keyboard Section */}
              <div className="flex-1 flex flex-col justify-end pt-1">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[11px] font-bold text-slate-400">لوحة المفاتيح:</span>
                  <button
                    onClick={() => setShowKeyboard(!showKeyboard)}
                    className="text-[10px] font-bold text-amber-400 hover:underline cursor-pointer"
                  >
                    {showKeyboard ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
                {showKeyboard && (
                  <LicensePlateKeyboard
                    onKeyPress={handleKeyPress}
                    currentValue={plateInput}
                    compact={true}
                  />
                )}
              </div>
            </div>

            {/* Right Column: Clean, Streamlined Single Results Card (7 cols on lg) */}
            <div className="lg:col-span-7 flex flex-col space-y-3 h-full overflow-y-auto custom-scrollbar-slate pr-1">
              
              {!hasSearched ? (
                /* Initial Idle State */
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 bg-slate-950/40 border border-slate-800/80 rounded-xl text-center">
                  <div className="w-16 h-16 bg-slate-800/60 border border-slate-700/50 rounded-2xl flex items-center justify-center text-amber-400 mb-3 shadow-xl">
                    <Car className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-white">جاهز للاستعلام</h3>
                  <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
                    قم بإدخال حروف وأرقام اللوحة واضغط "عرض بيانات اللوحة" لعرض حالة التواجد والاشتراكات والزيارات السابقة بشكل مبسط ومباشر.
                  </p>
                </div>
              ) : (
                /* Clear & Streamlined Results View */
                <div className="space-y-3 animate-in fade-in duration-300">
                  
                  {/* 1. Main Status Header Box */}
                  {activeVehicles.length > 0 ? (
                    /* Active Inside Garage Highlight */
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-400">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-center text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-300">الحالة الحالية:</span>
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                              متواجدة بالداخل الآن
                            </span>
                          </div>
                          <h3 className="text-base font-black text-white mt-0.5">
                            {activeVehicles[0].garage.name}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 px-3.5 rounded-xl border border-emerald-500/20 self-start sm:self-auto">
                        <Coins className="w-4 h-4 text-emerald-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold">الحساب المستحق حتى الآن</span>
                          <span className="text-sm font-black text-emerald-400 font-mono">{activeVehicles[0].accruedCost} ج.م</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Outside Garage Clear Banner */
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3 text-slate-400">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-300 block">حالة التواجد</span>
                          <span className="text-xs font-medium text-slate-400">السيارة غير متواجدة داخل أي جراج حالياً</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-slate-800/80 text-slate-400 px-3 py-1 rounded-lg">
                        خارج الجراجات
                      </span>
                    </div>
                  )}

                  {/* 2. Structured Vehicle Information Summary Card */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                    
                    {/* Active Parking Entry Details (if inside) */}
                    {activeVehicles.length > 0 && (
                      <div className="border-b border-slate-800/80 pb-3">
                        <h4 className="text-xs font-black text-amber-400 flex items-center gap-1.5 mb-2.5">
                          <Building2 className="w-3.5 h-3.5" />
                          تفاصيل زيارة الركن الحالية
                        </h4>
                        {activeVehicles.map(({ vehicle }) => {
                          const entryDate = safeDate(vehicle.entryTime);
                          const entryTimeStr = entryDate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
                          const entryDateStr = entryDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

                          return (
                            <div key={vehicle.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                              <div>
                                <span className="text-[10px] text-slate-400 block">وقت وتاريخ الدخول:</span>
                                <span className="font-bold text-white flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  {entryTimeStr} ({entryDateStr})
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">مدة الإقامة:</span>
                                <span className="font-bold text-emerald-400 mt-0.5 block">
                                  {getDuration(vehicle.entryTime)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">نوع الركنة:</span>
                                <span className="font-bold text-white mt-0.5 block">
                                  {vehicle.type === 'overnight' ? 'مبيت' : 'ساعات'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">المسؤول عن الدخول:</span>
                                <span className="font-bold text-white mt-0.5 block">
                                  {vehicle.staffName || 'المندوب'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">نوع الحساب:</span>
                                <span className="font-bold text-emerald-400 mt-0.5 block">
                                  {vehicle.isSubscriber ? 'مشترك (بدون رسوم)' : 'ركن عادي'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Subscription Information Section */}
                    <div>
                      <h4 className="text-xs font-black text-slate-200 flex items-center gap-1.5 mb-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        بيانات الاشتراك
                      </h4>

                      {subscriptions.length > 0 ? (
                        subscriptions.map(({ subscriber, garageName }) => (
                          <div key={subscriber.id} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/20 text-slate-200">
                            <div>
                              <span className="text-[10px] text-slate-400 block">صاحب الاشتراك:</span>
                              <span className="font-bold text-white mt-0.5 block">{subscriber.ownerName}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">الجراج المسجل:</span>
                              <span className="font-bold text-amber-400 mt-0.5 block">{garageName}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">رقم الهاتف:</span>
                              <span className="font-mono font-bold text-slate-300 mt-0.5 block">{subscriber.phone || 'غير مسجل'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">ينتهي في:</span>
                              <span className="font-bold text-emerald-400 mt-0.5 block">{safeDate(subscriber.endDate).toLocaleDateString('ar-EG')}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                          لا يوجد اشتراك دوري مسجل لهذه اللوحة.
                        </p>
                      )}
                    </div>

                  </div>

                  {/* 3. Previous Movements & Visits Log (Past Exits Only - Zero Duplication!) */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h4 className="text-xs font-black text-slate-200 flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-indigo-400" />
                        سجل الزيارات والحركات السابقة
                      </h4>
                      <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        {vehicleHistory.length + activityLogs.length} عملية سابقة
                      </span>
                    </div>

                    {vehicleHistory.length === 0 && activityLogs.length === 0 ? (
                      <div className="text-center py-5">
                        <AlertCircle className="w-5 h-5 text-slate-600 mx-auto mb-1" />
                        <p className="text-xs text-slate-400 font-bold">لا توجد عمليات خروج أو زيارات سابقة مسجلة لهذا الرقم</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/60 max-h-48 overflow-y-auto custom-scrollbar-slate pr-1">
                        
                        {/* Only Past Completed Transactions */}
                        {vehicleHistory.map(({ vehicle, garageName }, idx) => {
                          const entryDate = safeDate(vehicle.entryTime);
                          const exitDate = vehicle.exitTime ? safeDate(vehicle.exitTime) : null;
                          const entryTimeStr = entryDate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
                          const entryDateStr = entryDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

                          const exitTimeStr = exitDate ? exitDate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) : null;
                          const exitDateStr = exitDate ? exitDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : null;

                          let timeSpanStr = `دخول: ${entryTimeStr}`;
                          if (exitDateStr) {
                            if (entryDateStr === exitDateStr) {
                              timeSpanStr = `دخول: ${entryTimeStr} • خروج: ${exitTimeStr} (${entryDateStr})`;
                            } else {
                              timeSpanStr = `دخول: ${entryTimeStr} (${entryDateStr}) • خروج: ${exitTimeStr} (${exitDateStr})`;
                            }
                          } else {
                            timeSpanStr = `دخول: ${entryTimeStr} (${entryDateStr})`;
                          }

                          return (
                            <div key={`hist_${vehicle.id}_${idx}`} className="py-2 flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-2">
                                <span className="bg-slate-800 text-slate-300 font-bold text-[10px] px-2 py-0.5 rounded shrink-0">
                                  خروج سابق
                                </span>
                                <div>
                                  <span className="font-bold text-white block text-xs">{garageName}</span>
                                  <span className="text-[10px] text-slate-400">
                                    {timeSpanStr}
                                    {vehicle.exitTime && (
                                      <span className="text-amber-400 font-bold mr-1.5">
                                        • {getDuration(vehicle.entryTime, vehicle.exitTime)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="text-left shrink-0">
                                <span className="font-black text-emerald-400 text-xs block font-mono">{vehicle.totalCost || 0} ج.م</span>
                              </div>
                            </div>
                          );
                        })}

                        {/* System Log Entries */}
                        {activityLogs.map((log) => {
                          const logDate = safeDate(log.timestamp);
                          const timeStr = logDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                          const dateStr = logDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

                          return (
                            <div key={`log_${log.id}`} className="py-2 flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-2">
                                <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded shrink-0">
                                  {log.actionType === 'check_in' ? 'تسجيل دخول' : log.actionType === 'check_out' ? 'تسجيل خروج' : 'سجل حركة'}
                                </span>
                                <div>
                                  <span className="font-bold text-white block text-xs">{log.garageName || 'النظام'}</span>
                                  <span className="text-[10px] text-slate-400">
                                    المسؤول: {log.staffName || log.operatorName || 'المندوب'} • {timeStr} ({dateStr})
                                  </span>
                                </div>
                              </div>
                              <div className="text-left shrink-0">
                                {log.amount !== undefined && (
                                  <span className="font-bold text-slate-200 text-xs block font-mono">{log.amount} ج.م</span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

          </div>
        </div>

        {/* Footer Bar */}
        <div className="p-2.5 px-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-slate-500">
            شاشة استعلام السيارات المبسطة
          </span>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </motion.div>
    </div>
  );
});
