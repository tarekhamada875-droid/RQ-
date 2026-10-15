import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('exposes its required accessible name and optional screen-reader-only text', () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Open navigation" visuallyHiddenText="Navigation menu" onClick={onClick}>
        <span aria-hidden="true">☰</span>
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'Open navigation' });
    expect(button).toHaveAccessibleName('Open navigation');
    expect(button).toHaveTextContent('Navigation menu');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
