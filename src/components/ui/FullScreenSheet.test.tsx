import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FullScreenSheet } from './FullScreenSheet';

afterEach(cleanup);

describe('FullScreenSheet', () => {
  it('renders children in a full-viewport container', () => {
    render(
      <FullScreenSheet>
        <main>المحتوى</main>
      </FullScreenSheet>
    );

    const container = screen.getByText('المحتوى').parentElement!;
    expect(container.className).toContain('fixed');
    expect(container.className).toContain('inset-0');
    expect(container.className).toContain('pt-safe');
    expect(container.className).toContain('px-safe');
    expect(container.className).toContain('bg-[#faf9f6]');
  });

  it('closes on Escape when onClose is provided', () => {
    const onClose = vi.fn();
    render(
      <FullScreenSheet onClose={onClose}>
        <main>x</main>
      </FullScreenSheet>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not arm Escape when onClose is omitted', () => {
    const onClose = vi.fn();
    render(
      <FullScreenSheet>
        <main>x</main>
      </FullScreenSheet>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('appends className extras and zIndex', () => {
    render(
      <FullScreenSheet zIndex="z-[150]" className="select-none">
        <main>x</main>
      </FullScreenSheet>
    );

    const container = screen.getByText('x').parentElement!;
    expect(container.className).toContain('select-none');
    expect(container.className).toContain('z-[150]');
  });

  it('is a labelled dialog for screen readers', () => {
    render(
      <FullScreenSheet>
        <main>x</main>
      </FullScreenSheet>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
