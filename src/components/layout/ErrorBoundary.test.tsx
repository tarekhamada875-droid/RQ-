import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenChild(): never {
  throw new Error('sensitive_internal_error_detail');
}

describe('ErrorBoundary', () => {
  it('shows Arabic recovery guidance without exposing technical error messages', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('عفواً، حدث خطأ مفاجئ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تنشيط الصفحة الآن/ })).toBeInTheDocument();
    expect(screen.queryByText('sensitive_internal_error_detail')).not.toBeInTheDocument();
  });
});
