import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="عنوان"
        message="رسالة"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, message and both default buttons when open', () => {
    render(
      <ConfirmDialog
        isOpen
        title="حذف السيارة؟"
        message="لن يمكن التراجع."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        tone="danger"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('حذف السيارة؟')).toBeInTheDocument();
    expect(screen.getByText('لن يمكن التراجع.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد' })).toBeInTheDocument();
  });

  it('accepts custom button labels and custom icon', () => {
    render(
      <ConfirmDialog
        isOpen
        title="t"
        message="m"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmText="تأكيد السحب"
        cancelText="تراجع"
        tone="warning"
        icon={<span data-testid="custom-icon" />}
      />
    );

    expect(screen.getByRole('button', { name: 'تأكيد السحب' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeInTheDocument();
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders a single confirm button when onCancel is omitted', () => {
    render(
      <ConfirmDialog
        isOpen
        title="تنبيه"
        onConfirm={vi.fn()}
        confirmText="تمام"
      />
    );

    expect(screen.getByRole('button', { name: 'تمام' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء' })).not.toBeInTheDocument();
  });

  it('renders extra children between the message and the buttons', () => {
    render(
      <ConfirmDialog isOpen title="t" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <div data-testid="extra-slot">لوحة</div>
      </ConfirmDialog>
    );

    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
  });

  it('shows a spinner label and locks buttons while an async confirm is in flight', async () => {
    let resolveAction: (() => void) | null = null;
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveAction = resolve; })
    );
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="t"
        onConfirm={onConfirm}
        onCancel={onCancel}
        tone="danger"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));

    expect(await screen.findByText('جاري التنفيذ...')).toBeInTheDocument();
    // Cancel is locked while processing, and the backdrop no longer closes.
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled();
    const backdrop = document.querySelector('.fixed.inset-0 > .absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();

    resolveAction?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'تأكيد' })).toBeInTheDocument();
    });
  });

  it('supports externally-managed busy state with a custom busy label', () => {
    render(
      <ConfirmDialog
        isOpen
        title="t"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        busy
        busyLabel="جاري الحذف..."
      />
    );

    expect(screen.getByText('جاري الحذف...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'جاري الحذف...' })).toBeDisabled();
  });

  it('closes on Escape via the shared ModalShell a11y', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog isOpen title="t" onConfirm={vi.fn()} onCancel={onCancel} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('passes the zIndex through to the overlay', () => {
    render(
      <ConfirmDialog isOpen title="t" onConfirm={vi.fn()} onCancel={vi.fn()} zIndex="z-50" />
    );

    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(overlay.className).toContain('z-50');
  });
});
