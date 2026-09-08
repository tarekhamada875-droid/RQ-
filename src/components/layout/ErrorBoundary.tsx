import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    const isChunkError =
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Importing a module script failed');

    return { hasError: true, error, isReloading: isChunkError };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    const isChunkError =
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Importing a module script failed');

    if (isChunkError) {
      const lastReload = Number(sessionStorage.getItem('last_chunk_reload') || '0');
      const now = Date.now();
      if (now - lastReload > 15000) {
        sessionStorage.setItem('last_chunk_reload', String(now));
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    localStorage.removeItem('app_view'); // Clear state that might be causing loop
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.isReloading) {
        return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center" dir="rtl">
            <div className="max-w-sm w-full bg-slate-800 rounded-xl p-8 border border-slate-700">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 font-sans">جاري تحديث النظام تلقائياً...</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                تم توفير إصدار جديد، يتم الآن تنشيط الصفحة لتطبيق التحديثات فوراً.
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center" dir="rtl">
          <div className="max-w-sm w-full bg-slate-800 rounded-xl p-8 border border-slate-700">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 font-sans">عفواً، حدث خطأ مفاجئ</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              يبدو أن هناك مشكلة بسيطة في تحميل البيانات. اضغط على الزر أدناه لتنشيط الصفحة والعودة للعمل.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              تنشيط الصفحة الآن
            </button>
            {this.state.error?.message && (
              <div className="mt-6 text-left p-4 bg-slate-950 rounded-lg overflow-auto max-h-32 text-[10px] font-mono text-red-400 opacity-70 dir-ltr">
                {this.state.error.message}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
