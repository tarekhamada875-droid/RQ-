import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandscapeMobileView } from './LandscapeMobileView';
import { Garage } from '../../types';

const garage = {
  id: 'garage-test',
  name: 'جراج الاختبار',
  hourlyRate: 15,
  overnightRate: 40
} as Garage;

describe('LandscapeMobileView Arabic-only labels', () => {
  it('renders tariff names and currency in Arabic', () => {
    render(<LandscapeMobileView garage={garage} />);

    expect(screen.getByText('تعريفة الساعة')).toBeInTheDocument();
    expect(screen.getByText('المبيت')).toBeInTheDocument();
    expect(screen.getAllByText('جنيه مصري')).toHaveLength(2);
    expect(screen.queryByText('TARIFF PER HOUR')).not.toBeInTheDocument();
    expect(screen.queryByText('OVERNIGHT STAY')).not.toBeInTheDocument();
    expect(screen.queryByText('EGP / جنيه')).not.toBeInTheDocument();
  });
});
