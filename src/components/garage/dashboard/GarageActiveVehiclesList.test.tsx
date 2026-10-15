import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GarageActiveVehiclesList } from './GarageActiveVehiclesList';

describe('GarageActiveVehiclesList icon actions', () => {
  it('names the close action and preserves its callback', () => {
    const onClose = vi.fn();
    render(
      <GarageActiveVehiclesList
        vehicles={[]}
        visibleVehicles={[]}
        totalInsideCount={0}
        hasMoreVehicles={false}
        observerTargetRef={React.createRef<HTMLDivElement>()}
        scrollContainerRef={React.createRef<HTMLDivElement>()}
        isSubscriptionExpired={false}
        onClose={onClose}
        onCheckOut={vi.fn()}
        onRegisterNewCar={vi.fn()}
      />
    );

    const closeButton = screen.getByRole('button', { name: 'إغلاق قائمة السيارات النشطة' });
    expect(closeButton).toHaveAccessibleName();
    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
