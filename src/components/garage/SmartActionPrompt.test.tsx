import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SmartActionPrompt } from './SmartActionPrompt';

describe('SmartActionPrompt depleted-balance card', () => {
  beforeEach(() => {
    // Stub clipboard API for tap-to-copy behavior
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the headline, action copy, and wallet number when provided', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />);

    expect(screen.getByText('رصيدك خلص')).toBeInTheDocument();
    // Action-oriented copy (not the old passive "تواصل مع الإدارة")
    expect(screen.getByText(/أرسل الدفع للمحفظة دي/)).toBeInTheDocument();
    // Wallet number is the hero element
    expect(screen.getByText('01552411323')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نسخ رقم المحفظة' })).toBeInTheDocument();
  });

  it('does not render a redundant giant "0" balance number (the depleted state is implicit)', () => {
    const { container } = render(
      <SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />
    );
    // The old design rendered `total.toLocaleString('ar-EG')` as a big number.
    // The redesign removes it — the card's existence IS the "0" signal.
    const bigNumbers = container.querySelectorAll('.text-2xl.font-mono, .text-4xl.font-mono, .text-5xl.font-mono');
    bigNumbers.forEach((node) => {
      expect(node.textContent).not.toMatch(/^0+$/);
    });
  });

  it('falls back to admin-contact copy when no wallet number is configured', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} />);
    expect(screen.getByText('رصيدك خلص')).toBeInTheDocument();
    expect(screen.getByText(/تواصل مع الإدارة لإضافة رصيد جديد/)).toBeInTheDocument();
    // No copy button when there is no wallet number
    expect(screen.queryByRole('button', { name: 'نسخ رقم المحفظة' })).not.toBeInTheDocument();
  });

  it('copies the wallet number to the clipboard on tap and shows confirmation feedback', async () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />);
    const copyButton = screen.getByRole('button', { name: 'نسخ رقم المحفظة' });

    fireEvent.click(copyButton);

    // Confirmation feedback appears
    expect(await screen.findByText('تم النسخ')).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('01552411323');
  });

  it('trims whitespace from the wallet number before rendering and copying', async () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="  01552411323  " />);
    expect(screen.getByText('01552411323')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم المحفظة' }));
    expect(await screen.findByText('تم النسخ')).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('01552411323');
  });
});
