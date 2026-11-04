import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlipNumber } from './FlipNumber';

describe('FlipNumber', () => {
  it('renders each digit as static text (no animation)', () => {
    const { rerender } = render(<FlipNumber value={4} size="sm" />);
    const previousDigit = screen.getByTestId('flip-number-digit');
    expect(previousDigit).toHaveTextContent('4');

    rerender(<FlipNumber value={5} size="sm" />);

    const nextDigit = screen.getByTestId('flip-number-digit');
    expect(nextDigit).toHaveTextContent('5');
    expect(nextDigit).not.toBe(previousDigit);
  });

  it('renders multiple digits with Arabic-Indic display when displayDigits="arabic"', () => {
    render(<FlipNumber value={36} size="lg" displayDigits="arabic" />);
    const digits = screen.getAllByTestId('flip-number-digit');
    expect(digits).toHaveLength(2);
    expect(digits[0]).toHaveTextContent('٣');
    expect(digits[1]).toHaveTextContent('٦');
  });

  it('renders Western digits by default', () => {
    render(<FlipNumber value={36} size="lg" />);
    const digits = screen.getAllByTestId('flip-number-digit');
    expect(digits).toHaveLength(2);
    expect(digits[0]).toHaveTextContent('3');
    expect(digits[1]).toHaveTextContent('6');
  });
});
