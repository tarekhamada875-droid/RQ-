import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminOverviewView } from './AdminOverviewView';
import { ThemeProvider } from '../../utils/ThemeContext';

describe('AdminOverviewView', () => {
  it('keeps only global quick actions and does not duplicate garage metrics', () => {
    localStorage.setItem('admin_lang', 'ar');
    const onOpenAddGarage = vi.fn();

    render(
      <ThemeProvider>
        <AdminOverviewView
          allGarages={[]}
          onOpenAddGarage={onOpenAddGarage}
        />
      </ThemeProvider>,
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

  it('localizes quick actions and switches to left-to-right layout in English', () => {
    localStorage.setItem('admin_lang', 'en');

    render(
      <ThemeProvider>
        <AdminOverviewView allGarages={[]} onOpenAddGarage={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText('System Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Quick system actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plate Lookup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Garage' })).toBeInTheDocument();
    expect(screen.getByText('System Dashboard').closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });
});
