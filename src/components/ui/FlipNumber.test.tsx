import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlipNumber } from './FlipNumber';

describe('FlipNumber', () => {
  it('animates a changed digit instead of replacing it as static text', () => {
    const { rerender } = render(<FlipNumber value={4} size="sm" />);
    const previousDigit = screen.getByTestId('flip-number-digit');
    expect(previousDigit).not.toHaveClass('flip-number-digit');

    rerender(<FlipNumber value={5} size="sm" />);

    const nextDigit = screen.getByTestId('flip-number-digit');
    expect(nextDigit).toHaveClass('flip-number-digit');
    expect(nextDigit).toHaveTextContent('5');
    expect(nextDigit).not.toBe(previousDigit);
  });
});
