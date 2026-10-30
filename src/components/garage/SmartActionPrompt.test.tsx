import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmartActionPrompt } from './SmartActionPrompt';

describe('SmartActionPrompt depleted-balance card (v2 minimal)', () => {
  it('renders headline + short prompt + dashed wallet number', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />);

    expect(screen.getByText('رصيدك خلص')).toBeInTheDocument();
    // Short prompt — not the old long paragraph
    expect(screen.getByText('أرسل الدفع إلى')).toBeInTheDocument();
    // Hero wallet number is dashed every 3 digits for readability
    expect(screen.getByText('015-524-113-23')).toBeInTheDocument();
  });

  it('does not render a copy button (removed per owner directive)', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('نسخ')).not.toBeInTheDocument();
    expect(screen.queryByText('اضغط على الرقم لنسخه')).not.toBeInTheDocument();
  });

  it('does not render a redundant giant "0" balance number', () => {
    const { container } = render(
      <SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />
    );
    const monoNumbers = container.querySelectorAll('.font-mono');
    monoNumbers.forEach((node) => {
      expect(node.textContent).not.toMatch(/^0+$/);
    });
  });

  it('does not render the old long explanatory paragraph', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01552411323" />);
    expect(screen.queryByText(/أرسل الدفع للمحفظة دي/)).not.toBeInTheDocument();
    expect(screen.queryByText(/هيتشحن رصيدك تلقائيًا/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تواصل مع الإدارة لإضافة رصيد جديد/)).not.toBeInTheDocument();
  });

  it('falls back to a short admin-contact line when no wallet number is configured', () => {
    render(<SmartActionPrompt garage={{ credits: 0 } as any} />);
    expect(screen.getByText('رصيدك خلص')).toBeInTheDocument();
    expect(screen.getByText(/تواصل مع الإدارة لشحن رصيد جديد/)).toBeInTheDocument();
    // No dashed number rendered
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('trims whitespace and chunks the wallet number into 3-digit groups', () => {
    const { rerender } = render(
      <SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="  01552411323  " />
    );
    expect(screen.getByText('015-524-113-23')).toBeInTheDocument();

    // Different lengths chunk correctly
    rerender(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="01000" />);
    expect(screen.getByText('010-00')).toBeInTheDocument();

    rerender(<SmartActionPrompt garage={{ credits: 0 } as any} paymentWalletNumber="1234567890" />);
    expect(screen.getByText('123-456-789-0')).toBeInTheDocument();
  });
});
