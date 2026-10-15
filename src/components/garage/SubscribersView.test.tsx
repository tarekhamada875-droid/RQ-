import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  firstPage: [] as any[],
  secondPage: [] as any[],
  subscribe: vi.fn(),
  getMore: vi.fn(),
  deleteSubscriber: vi.fn()
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
    deleteSubscriber: mocks.deleteSubscriber,
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
vi.mock('./SubscriberModals', () => ({
  SubscriberModals: ({ editingSubscriber, subscriberToDelete }: any) => (
    <output data-testid="subscriber-modal-state">
      {editingSubscriber?.id ?? ''}|{subscriberToDelete ?? ''}
    </output>
  )
}));

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

const makeGarage = (id = 'garage-subscriber-page-test') => ({
  id,
  name: 'Test Garage',
  status: 'approved',
  balanceExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}) as any;

describe('SubscribersView pagination and accessible names', () => {
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
    render(<SubscribersView garage={makeGarage()} onClose={vi.fn()} showToast={vi.fn()} />);

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

  it('gives subscriber search an accessible label', () => {
    render(<SubscribersView garage={makeGarage('garage-subscriber-search-label-test')} onClose={vi.fn()} showToast={vi.fn()} />);

    const search = screen.getByRole('textbox', { name: 'البحث عن مشترك باللوحة أو الاسم أو رقم الهاتف' });
    expect(search).toHaveAccessibleName('البحث عن مشترك باللوحة أو الاسم أو رقم الهاتف');
  });

  it('names edit/delete actions per subscriber and selects the intended row without deleting data', () => {
    const subscriber = makeSubscriber(7, 'Amina Hassan');
    mocks.firstPage = [subscriber];
    render(<SubscribersView garage={makeGarage()} onClose={vi.fn()} showToast={vi.fn()} />);

    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());

    const editButton = screen.getByRole('button', { name: 'تعديل بيانات المشترك Amina Hassan' });
    fireEvent.click(editButton);
    expect(screen.getByTestId('subscriber-modal-state')).toHaveTextContent('subscriber-7|');

    const deleteButton = screen.getByRole('button', { name: 'حذف اشتراك Amina Hassan' });
    fireEvent.click(deleteButton);
    expect(screen.getByTestId('subscriber-modal-state')).toHaveTextContent('subscriber-7|subscriber-7');
    expect(mocks.deleteSubscriber).not.toHaveBeenCalled();
  });
});
