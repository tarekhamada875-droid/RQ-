class ListenerTracker {
  private activeListeners = new Map<string, number>();

  register(key: string): () => void {
    const current = this.activeListeners.get(key) || 0;
    if (current > 0 && process.env.NODE_ENV !== 'production') {
      console.warn(`[ListenerTracker] Warning: Duplicate active listener registered for key: "${key}" (Current count: ${current + 1})`);
    }
    this.activeListeners.set(key, current + 1);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
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

  reset(): void {
    this.activeListeners.clear();
  }
}

export const listenerTracker = new ListenerTracker();
