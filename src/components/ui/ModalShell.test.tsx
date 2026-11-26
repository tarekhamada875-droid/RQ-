import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { ModalShell } from './ModalShell';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('ModalShell', () => {
  it('renders children inside a dialog panel with role/aria-modal', () => {
    render(
      <ModalShell panelClassName="test-panel">
        <button type="button">inside</button>
      </ModalShell>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  it('closes on Escape and on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose}>
        <button type="button">inside</button>
      </ModalShell>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The backdrop is the first child of the overlay; the panel is second.
    const backdrop = document.querySelector('.fixed.inset-0 > .absolute.inset-0') as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Escape active but ignores backdrop clicks when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose} closeOnBackdrop={false}>
        <button type="button">inside</button>
      </ModalShell>
    );

    const backdrop = document.querySelector('.fixed.inset-0 > .absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not arm a11y or scroll lock while inactive', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose} active={false}>
        <button type="button">inside</button>
      </ModalShell>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('locks body scroll while mounted and releases on unmount', () => {
    const { unmount } = render(
      <ModalShell>
        <span>content</span>
      </ModalShell>
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('releases the scroll lock only after the last nested shell closes', () => {
    const Stack = () => {
      const [aOpen, setAOpen] = useState(true);
      const [bOpen, setBOpen] = useState(true);
      return (
        <>
          {aOpen && <ModalShell zIndex="z-[60]" panelClassName="shell-a"><span>A</span></ModalShell>}
          {bOpen && <ModalShell zIndex="z-[110]" panelClassName="shell-b"><span>B</span></ModalShell>}
          <button type="button" onClick={() => setBOpen(false)}>close B</button>
          <button type="button" onClick={() => setAOpen(false)}>close A</button>
        </>
      );
    };

    render(<Stack />);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('close B'));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('close A'));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('applies variant, zIndex, backdrop and overlay classes', () => {
    render(
      <ModalShell
        zIndex="z-[210]"
        variant="sheet-flush"
        backdropClassName="custom-backdrop"
        overlayClassName="font-sans"
        panelClassName="custom-panel"
      >
        <span>x</span>
      </ModalShell>
    );

    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(overlay.className).toContain('z-[210]');
    expect(overlay.className).toContain('items-end');
    expect(overlay.className).toContain('p-0');
    expect(overlay.className).toContain('font-sans');

    const backdrop = overlay.querySelector('.custom-backdrop');
    expect(backdrop).not.toBeNull();

    const panel = overlay.querySelector('.custom-panel');
    expect(panel).not.toBeNull();
  });

  it('labels the dialog via panelAriaLabel when provided', () => {
    render(
      <ModalShell panelAriaLabel="اختر نطاق التحميل">
        <span>x</span>
      </ModalShell>
    );

    expect(screen.getByRole('dialog', { name: 'اختر نطاق التحميل' })).toBeInTheDocument();
  });
});
