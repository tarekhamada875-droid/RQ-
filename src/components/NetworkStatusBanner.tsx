import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const NetworkStatusBanner: React.FC = () => {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div 
      id="network-status-banner"
      role="alert" 
      aria-live="assertive"
      className="w-full bg-red-600 text-white text-center py-2.5 px-4 font-bold text-sm flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md transition-[colors,transform] duration-200"
    >
      <WifiOff className="w-4 h-4 text-white animate-pulse" />
      <span className="h-2 w-2 rounded-full bg-white animate-ping" />
      <span>انقطع الاتصال بالإنترنت. تم إيقاف العمليات مؤقتاً لحماية البيانات ومنع التكرار.</span>
    </div>
  );
};
