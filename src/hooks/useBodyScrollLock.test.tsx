import { StrictMode } from 'react';
import { cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireBodyScrollLock, useBodyScrollLock } from './useBodyScrollLock';

const BodyLockOwner = () => {
  useBodyScrollLock();
  return null;
};

beforeEach(() => {
  document.body.style.overflow = 'auto';
});

afterEach(() => {
  cleanup();
  if (document.body) document.body.style.overflow = '';
});

describe('useBodyScrollLock', () => {
  it('keeps the body locked when the first of two owners releases', () => {
    const first = renderHook(() => useBodyScrollLock());
    const second = renderHook(() => useBodyScrollLock());

    expect(document.body.style.overflow).toBe('hidden');
    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    second.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps the body locked when the second owner releases first', () => {
    const first = renderHook(() => useBodyScrollLock());
    const second = renderHook(() => useBodyScrollLock());

    second.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    first.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores an initially empty inline overflow value exactly', () => {
    document.body.style.overflow = '';
    const lock = renderHook(() => useBodyScrollLock());

    expect(document.body.style.overflow).toBe('hidden');
    lock.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores a non-default pre-existing overflow value exactly', () => {
    document.body.style.overflow = 'scroll';
    const lock = renderHook(() => useBodyScrollLock());

    expect(document.body.style.overflow).toBe('hidden');
    lock.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('supports disabling and re-enabling one owner while another remains locked', () => {
    const first = renderHook(({ enabled }: { enabled: boolean }) => useBodyScrollLock(enabled), {
      initialProps: { enabled: true },
    });
    const second = renderHook(() => useBodyScrollLock());

    first.rerender({ enabled: false });
    expect(document.body.style.overflow).toBe('hidden');
    first.rerender({ enabled: true });
    second.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    first.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('balances React StrictMode effect replay', () => {
    const locked = render(
      <StrictMode>
        <BodyLockOwner />
      </StrictMode>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    locked.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not restore onto or unlock a replacement body with its own active lock', () => {
    const originalBody = document.body;
    const lock = renderHook(() => useBodyScrollLock());
    const replacementBody = document.createElement('body');
    replacementBody.style.overflow = 'scroll';
    let releaseReplacementLock = () => {};

    try {
      document.documentElement.replaceChild(replacementBody, originalBody);
      releaseReplacementLock = acquireBodyScrollLock();
      expect(replacementBody.style.overflow).toBe('hidden');
      expect(() => lock.unmount()).not.toThrow();
      expect(document.body).toBe(replacementBody);
      expect(replacementBody.style.overflow).toBe('hidden');
      releaseReplacementLock();
      expect(replacementBody.style.overflow).toBe('scroll');
    } finally {
      releaseReplacementLock();
      if (document.body === replacementBody) {
        document.documentElement.replaceChild(originalBody, replacementBody);
      } else if (!originalBody.isConnected) {
        document.documentElement.appendChild(originalBody);
      }
      originalBody.style.overflow = 'auto';
    }

  });

  it('does not throw if the captured body is removed before release', () => {
    const originalBody = document.body;
    const lock = renderHook(() => useBodyScrollLock());

    document.documentElement.removeChild(originalBody);
    expect(() => lock.unmount()).not.toThrow();
    document.documentElement.appendChild(originalBody);
    expect(document.body).toBe(originalBody);
    originalBody.style.overflow = 'auto';
  });
});
