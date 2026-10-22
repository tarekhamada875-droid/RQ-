class ListenerTracker {
  private activeListeners = new Map<string, number>();
  private peakActiveListeners = 0;
  private registrationCount = 0;
  private unregistrationCount = 0;
  private duplicateRegistrationCount = 0;

  register(key: string): () => void {
    const current = this.activeListeners.get(key) || 0;
    this.registrationCount += 1;
    if (current > 0) this.duplicateRegistrationCount += 1;
    if (current > 0 && process.env.NODE_ENV !== 'production') {
      console.warn(`[ListenerTracker] Warning: Duplicate active listener registered for key: "${key}" (Current count: ${current + 1})`);
    }
    this.activeListeners.set(key, current + 1);
    this.peakActiveListeners = Math.max(this.peakActiveListeners, this.getActiveListenerCount());

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.unregistrationCount += 1;
      const count = this.activeListeners.get(key) || 0;
      if (count <= 1) {
        this.activeListeners.delete(key);
      } else {
        this.activeListeners.set(key, count - 1);
      }
    };
  }

  getActiveListenerCount(): number {
    let total = 0;
    for (const count of this.activeListeners.values()) {
      total += count;
    }
    return total;
  }

  getActiveListenersMap(): Record<string, number> {
    const res: Record<string, number> = {};
    for (const [key, count] of this.activeListeners.entries()) {
      res[key] = count;
    }
    return res;
  }

  getTelemetrySnapshot(): {
    activeListeners: number;
    peakActiveListeners: number;
    registrationCount: number;
    unregistrationCount: number;
    duplicateRegistrationCount: number;
  } {
    return {
      activeListeners: this.getActiveListenerCount(),
      peakActiveListeners: this.peakActiveListeners,
      registrationCount: this.registrationCount,
      unregistrationCount: this.unregistrationCount,
      duplicateRegistrationCount: this.duplicateRegistrationCount
    };
  }

  reset(): void {
    this.activeListeners.clear();
    this.peakActiveListeners = 0;
    this.registrationCount = 0;
    this.unregistrationCount = 0;
    this.duplicateRegistrationCount = 0;
  }
}

export const listenerTracker = new ListenerTracker();

if (import.meta.env.VITE_RQ_USE_EMULATORS === 'true' && typeof window !== 'undefined') {
  const diagnosticWindow = window as Window & {
    __RQ_FIRESTORE_LISTENER_DIAGNOSTICS__?: () => {
      telemetry: ReturnType<ListenerTracker['getTelemetrySnapshot']>;
      activeListenersByKey: Record<string, number>;
    };
  };
  diagnosticWindow.__RQ_FIRESTORE_LISTENER_DIAGNOSTICS__ = () => ({
    telemetry: listenerTracker.getTelemetrySnapshot(),
    activeListenersByKey: listenerTracker.getActiveListenersMap(),
  });
}
