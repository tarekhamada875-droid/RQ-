import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedCounter } from './AnimatedCounter';

describe('AnimatedCounter Component', () => {
  it('renders initial formatted value accurately', () => {
    render(<AnimatedCounter value={100} formatter={(v) => `$${Math.floor(v)}`} />);
    expect(screen.getByText('$100')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<AnimatedCounter value={50} className="text-xl font-bold" />);
    const el = screen.getByText('50');
    expect(el).toHaveClass('text-xl');
    expect(el).toHaveClass('font-bold');
  });
});
