import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminOverviewView } from './AdminOverviewView';

describe('AdminOverviewView', () => {
  it('keeps only global quick actions and does not duplicate garage metrics', () => {
    const onOpenAddGarage = vi.fn();

    render(
      <AdminOverviewView
        allGarages={[]}
        onOpenAddGarage={onOpenAddGarage}
      />,
    );

    expect(screen.getByRole('button', { name: 'استعلام عن لوحة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصدير CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة جراج جديد' })).toBeInTheDocument();
    expect(screen.queryByText(/جراج مسجل/)).not.toBeInTheDocument();
    expect(screen.queryByText(/الجراجات النشطة بالمشروع/)).not.toBeInTheDocument();
    expect(screen.queryByText(/إجمالي شحن السيستم/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إضافة جراج جديد' }));
    expect(onOpenAddGarage).toHaveBeenCalledOnce();
  });
});
