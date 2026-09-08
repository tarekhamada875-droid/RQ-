import React, { memo } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineView: React.FC = memo(() => {
  return (
    <div className="fixed inset-0 bg-slate-950 z-[10000] flex items-center justify-center p-6 text-center select-none dark-night-grid" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center gap-6 shadow-2xl animate-in fade-in duration-300">
        <div className="w-20 h-20 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center border border-red-500/20">
          <WifiOff className="w-10 h-10" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">مفيش اتصال بالإنترنت</h2>
          <p className="text-slate-300 font-bold text-base leading-relaxed px-2">
            البرنامج بيشتغل بالنت بس، اتأكد من توصيل النت وجرب تاني.
          </p>
        </div>

        <div className="w-full pt-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-bold bg-slate-800/80 py-3 px-4 rounded-xl border border-slate-700/50">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>جاري فحص الاتصال بالشبكة تلقائياً...</span>
          </div>
        </div>
      </div>
    </div>
  );
});


