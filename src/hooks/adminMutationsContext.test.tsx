import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AdminMutationsProvider, useAdminMutations } from './adminMutationsContext';
import type { AdminMutations } from './adminMutationsContext';

afterEach(() => cleanup());

const stubAdminMutations: AdminMutations = {
  handleGarageLogin: vi.fn().mockResolvedValue(undefined),
  handleDelegateLogin: vi.fn().mockResolvedValue(undefined),
  createNewGarage: vi.fn().mockResolvedValue(true),
  deleteGarage: vi.fn().mockResolvedValue(undefined),
  removeDelegate: vi.fn().mockResolvedValue(undefined),
};

function Consumer() {
  const mutations = useAdminMutations();
  return <span data-testid="has-create">{typeof mutations.createNewGarage === 'function' ? 'yes' : 'no'}</span>;
}

describe('AdminMutationsContext', () => {
  it('throws when useAdminMutations is called outside an AdminMutationsProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAdminMutations())).toThrow(
      'useAdminMutations must be used within AdminMutationsProvider',
    );
    spy.mockRestore();
  });

  it('returns the provider value when called inside an AdminMutationsProvider', () => {
    render(
      <AdminMutationsProvider value={stubAdminMutations}>
        <Consumer />
      </AdminMutationsProvider>,
    );
    expect(screen.getByTestId('has-create').textContent).toBe('yes');
  });

  it('renders children inside the provider tree', () => {
    const children: ReactNode = <div data-testid="child">child</div>;
    render(<AdminMutationsProvider value={stubAdminMutations}>{children}</AdminMutationsProvider>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
