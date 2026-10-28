export type SubscriberLifecycleError =
  | 'SUBSCRIBER_ALREADY_EXISTS'
  | 'SUBSCRIBER_NOT_FOUND'
  | 'INVALID_SUBSCRIBER_DATE_RANGE'
  | 'SUBSCRIBER_PLATE_IMMUTABLE';

export type SubscriberLifecycleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SubscriberLifecycleError };

export interface SubscriberState {
  readonly plateNumber: string;
  readonly plateNumberRaw: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly ownerName?: string;
  readonly phone?: string;
  readonly notes?: string;
}

export interface SubscriberDates {
  readonly startDate: string;
  readonly endDate: string;
}

export interface AddSubscriberCommand extends SubscriberDates {
  readonly plateNumber: string;
  readonly plateNumberRaw: string;
  readonly ownerName?: string;
  readonly phone?: string;
  readonly notes?: string;
}

export interface UpdateSubscriberCommand extends SubscriberDates {
  readonly plateNumber?: string;
  readonly plateNumberRaw?: string;
  readonly ownerName?: string;
  readonly phone?: string;
  readonly notes?: string;
}

export interface SubscriberTransition {
  readonly kind: 'created' | 'renewed' | 'updated' | 'deleted';
  readonly state?: SubscriberState;
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateKeyValue(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function isValidSubscriberDateRange(dates: SubscriberDates): boolean {
  return isCalendarDate(dates.startDate) && isCalendarDate(dates.endDate) && dateKeyValue(dates.endDate) >= dateKeyValue(dates.startDate);
}

export function decideSubscriberAdd(
  current: SubscriberState | null,
  command: AddSubscriberCommand,
): SubscriberLifecycleResult<SubscriberTransition> {
  if (current) return { ok: false, error: 'SUBSCRIBER_ALREADY_EXISTS' };
  if (!isValidSubscriberDateRange(command)) return { ok: false, error: 'INVALID_SUBSCRIBER_DATE_RANGE' };
  return {
    ok: true,
    value: {
      kind: 'created',
      state: {
        plateNumber: command.plateNumber,
        plateNumberRaw: command.plateNumberRaw,
        startDate: command.startDate,
        endDate: command.endDate,
        ...(command.ownerName !== undefined ? { ownerName: command.ownerName } : {}),
        ...(command.phone !== undefined ? { phone: command.phone } : {}),
        ...(command.notes !== undefined ? { notes: command.notes } : {}),
      },
    },
  };
}

export function decideSubscriberRenew(
  current: SubscriberState | null,
  dates: SubscriberDates,
): SubscriberLifecycleResult<SubscriberTransition> {
  if (!current) return { ok: false, error: 'SUBSCRIBER_NOT_FOUND' };
  if (!isValidSubscriberDateRange(dates)) return { ok: false, error: 'INVALID_SUBSCRIBER_DATE_RANGE' };
  return { ok: true, value: { kind: 'renewed', state: { ...current, ...dates } } };
}

export function decideSubscriberUpdate(
  current: SubscriberState | null,
  command: UpdateSubscriberCommand,
): SubscriberLifecycleResult<SubscriberTransition> {
  if (!current) return { ok: false, error: 'SUBSCRIBER_NOT_FOUND' };
  if (command.plateNumberRaw !== undefined && command.plateNumberRaw !== current.plateNumberRaw) {
    return { ok: false, error: 'SUBSCRIBER_PLATE_IMMUTABLE' };
  }
  if (command.plateNumber !== undefined && command.plateNumberRaw === undefined && command.plateNumber !== current.plateNumber) {
    return { ok: false, error: 'SUBSCRIBER_PLATE_IMMUTABLE' };
  }
  if (!isValidSubscriberDateRange(command)) return { ok: false, error: 'INVALID_SUBSCRIBER_DATE_RANGE' };
  const { plateNumber: _plateNumber, plateNumberRaw: _plateNumberRaw, ...safeCommand } = command;
  return { ok: true, value: { kind: 'updated', state: { ...current, ...safeCommand } } };
}

export function decideSubscriberDelete(
  current: SubscriberState | null,
): SubscriberLifecycleResult<SubscriberTransition> {
  if (!current) return { ok: false, error: 'SUBSCRIBER_NOT_FOUND' };
  return { ok: true, value: { kind: 'deleted' } };
}
