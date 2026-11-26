import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { FullScreenStatus } from './FullScreenStatus';
import { reloadIfStaleChunk, isStaleChunkError } from '../../utils/staleChunkReload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  isReloading?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isReloading: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isReloading: isStaleChunkError(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    if (isStaleChunkError(error)) {
      reloadIfStaleChunk();
    }
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('app_view');
    } catch (storageError) {
      console.warn('تعذر مسح حالة العرض المحفوظة.', storageError);
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.isReloading) {
        return (
          <FullScreenStatus
            tone="reloading"
            label="جاري تحديث النظام تلقائياً..."
            subtext="تم توفير إصدار جديد، يتم الآن تنشيط الصفحة لتطبيق التحديثات فوراً."
          />
        );
      }

      return (
        <FullScreenStatus
          tone="error"
          label="عفواً، حدث خطأ مفاجئ"
          subtext="يبدو أن هناك مشكلة بسيطة في تحميل البيانات. اضغط على الزر أدناه لتنشيط الصفحة والعودة للعمل."
          action={
            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              تنشيط الصفحة الآن
            </button>
          }
        />
      );
    }

    return this.props.children;
  }
}
