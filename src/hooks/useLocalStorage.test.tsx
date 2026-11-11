import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalStorageState } from './useLocalStorage';

/**
 * Regression tests for the same-value write guard (DevTools runtime audit,
 * 2026-11-11): useLocalStorageState must not repeat synchronous localStorage
 * I/O — nor broadcast `local-storage-update`, which makes every mounted
 * instance re-read storage — when the incoming value equals what is already
 * stored. Real changes keep the old write + broadcast behavior.
 *
 * jsdom's Storage implementation is not spy-transparent, so we stub the
 * global with an instrumented Map-backed fake that records every write.
 */
function makeInstrumentedStorage() {
  const store = new Map<string, string>();
  const setCalls: Array<{ key: string; value: string }> = [];
  const removeCalls: string[] = [];
  const storage = {
    getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string): void => {
      setCalls.push({ key, value: String(value) });
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      removeCalls.push(key);
      store.delete(key);
    },
    clear: (): void => store.clear(),
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
    get length(): number {
      return store.size;
    },
  };
  return { storage, setCalls, removeCalls };
}

describe('useLocalStorageState same-value write guard', () => {
  let instrumented: ReturnType<typeof makeInstrumentedStorage>;

  beforeEach(() => {
    instrumented = makeInstrumentedStorage();
    vi.stubGlobal('localStorage', instrumented.storage);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const listenForBroadcasts = () => {
    const listener = vi.fn();
    window.addEventListener('local-storage-update', listener);
    return {
      listener,
      stop: () => window.removeEventListener('local-storage-update', listener),
    };
  };

  it('writes and broadcasts a real string change', () => {
    const { listener, stop } = listenForBroadcasts();
    const { result } = renderHook(() => useLocalStorageState('guard-string', 'initial'));

    act(() => result.current[1]('changed'));

    expect(localStorage.getItem('guard-string')).toBe('changed');
    expect(instrumented.setCalls).toEqual([{ key: 'guard-string', value: 'changed' }]);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('skips storage I/O and broadcast when a new object equals what is stored', () => {
    const { listener, stop } = listenForBroadcasts();
    const { result } = renderHook(() => useLocalStorageState('guard-object', { theme: 'dark' }));

    // First change is a real write (the key was absent).
    act(() => result.current[1]({ theme: 'dark' }));
    expect(instrumented.setCalls).toHaveLength(1);
    instrumented.setCalls.length = 0;
    listener.mockClear();

    // Same JSON value behind a fresh object identity (typical parent re-render):
    // the effect re-runs, but the guard must suppress both the write and the
    // broadcast.
    act(() => result.current[1]({ theme: 'dark' }));

    expect(instrumented.setCalls).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem('guard-object')).toBe(JSON.stringify({ theme: 'dark' }));

    // A genuine change still writes and broadcasts exactly once.
    act(() => result.current[1]({ theme: 'light' }));

    expect(instrumented.setCalls).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('guard-object')).toBe(JSON.stringify({ theme: 'light' }));
    stop();
  });

  it('null reset falls back to the default (pre-existing semantics) without redundant I/O', () => {
    const { listener, stop } = listenForBroadcasts();
    instrumented.storage.setItem('guard-null', 'existing');
    instrumented.setCalls.length = 0;
    instrumented.removeCalls.length = 0;

    const { result } = renderHook(() => useLocalStorageState<string | null>('guard-null', 'fallback'));

    // Pre-existing semantics: clearing to null broadcasts, the hook's own
    // listener falls back to the default, and the default is persisted. The
    // guard must not change that contract — only suppress no-op writes.
    act(() => result.current[1](null));

    expect(result.current[0]).toBe('fallback');
    expect(instrumented.removeCalls).toEqual(['guard-null']);
    expect(instrumented.setCalls).toEqual([{ key: 'guard-null', value: 'fallback' }]);
    expect(localStorage.getItem('guard-null')).toBe('fallback');

    // Repeating the reset re-runs the same self-healing pass: key removed,
    // listener falls back to the default, default re-persisted. State and
    // storage stay stable — no loop.
    instrumented.removeCalls.length = 0;
    instrumented.setCalls.length = 0;
    listener.mockClear();
    act(() => result.current[1](undefined));

    expect(result.current[0]).toBe('fallback');
    expect(instrumented.removeCalls).toEqual(['guard-null']);
    expect(instrumented.setCalls).toEqual([{ key: 'guard-null', value: 'fallback' }]);

    // The guard itself: writing the value that is already stored (fresh string
    // identity) produces zero I/O and zero broadcasts.
    instrumented.removeCalls.length = 0;
    instrumented.setCalls.length = 0;
    listener.mockClear();
    act(() => result.current[1]('fallback'));

    expect(instrumented.setCalls).toHaveLength(0);
    expect(instrumented.removeCalls).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('keeps cross-instance sync working for genuine changes between two instances of the same key', () => {
    const first = renderHook(() => useLocalStorageState('guard-shared', 'a'));
    const second = renderHook(() => useLocalStorageState('guard-shared', 'a'));

    act(() => first.result.current[1]('b'));

    // The second instance listens for the broadcast and re-reads storage.
    expect(second.result.current[0]).toBe('b');
    first.unmount();
    second.unmount();
  });
});
