import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  firstPage: [] as any[],
  secondPage: [] as any[],
  subscribe: vi.fn(),
  getMore: vi.fn()
}));

vi.mock('../../services', () => ({
  firestoreService: {
    subscribeToSubscribers: vi.fn((_garageId, callback) => {
      callback(mocks.firstPage, { lastDoc: { id: 'cursor-50' }, hasMore: true });
      return vi.fn();
    }),
    getMoreSubscribers: mocks.getMore,
    addSubscriber: vi.fn(),
    updateSubscriber: vi.fn(),
    deleteSubscriber: vi.fn(),
    renewSubscriber: vi.fn()
  }
}));

vi.mock('../../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user' },
    onAuthStateChanged: vi.fn((callback) => {
      callback({ uid: 'test-user' });
      return vi.fn();
    })
  }
}));

vi.mock('../ui/EgyptianPlate', () => ({ EgyptianPlate: ({ plateNumber }: { plateNumber: string }) => <span>{plateNumber}</span> }));
vi.mock('./SubscriberModals', () => ({ SubscriberModals: () => null }));

import { SubscribersView } from './SubscribersView';

const makeSubscriber = (index: number, ownerName = `Subscriber ${index}`) => ({
  id: `subscriber-${index}`,
  plateNumber: `Plate ${index}`,
  plateNumberRaw: `Plate ${index}`,
  ownerName,
  phone: `0100000${index}`,
  startDate: '2026-10-01',
  endDate: '2026-11-01',
  garageId: 'garage-subscriber-page-test',
  createdAt: new Date(2026, 9, 13, 0, 0, 60 - index)
});

describe('SubscribersView pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firstPage = Array.from({ length: 50 }, (_, index) => makeSubscriber(index));
    mocks.secondPage = [makeSubscriber(50, 'Older Subscriber Search Target')];
    mocks.getMore.mockResolvedValue({
      subscribers: mocks.secondPage,
      lastDoc: { id: 'cursor-51' },
      hasMore: false
    });
  });

  it('loads older subscribers beyond the first 50 and includes them in search', async () => {
    const garage = {
      id: 'garage-subscriber-page-test',
      name: 'Test Garage',
      status: 'approved',
      balanceExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    } as any;

    render(<SubscribersView garage={garage} onClose={vi.fn()} showToast={vi.fn()} />);

    expect(screen.getByText('Subscriber 0')).toBeTruthy();
    const loadMoreButton = screen.getByRole('button', { name: 'تحميل 50 مشتركاً أقدم' });
    fireEvent.click(loadMoreButton);

    expect(await screen.findByText('Older Subscriber Search Target')).toBeTruthy();
    expect(mocks.getMore).toHaveBeenCalledWith('garage-subscriber-page-test', { id: 'cursor-50' });

    fireEvent.change(screen.getByPlaceholderText('بحث باللوحة أو الاسم أو رقم الهاتف...'), {
      target: { value: 'Older Subscriber Search Target' }
    });
    await waitFor(() => expect(screen.getByText('Older Subscriber Search Target')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'تحميل 50 مشتركاً أقدم' })).toBeNull();
  });
});
