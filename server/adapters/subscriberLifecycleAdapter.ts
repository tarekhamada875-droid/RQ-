import type {
  AddSubscriberCommand,
  SubscriberDates,
  SubscriberLifecycleError,
  SubscriberState,
  SubscriberTransition,
  UpdateSubscriberCommand,
} from '../domain/subscriberLifecycle';

export type SubscriberDocument = Readonly<Record<string, unknown>>;

export interface SubscriberUpdateFields {
  readonly startDate: string;
  readonly endDate: string;
  readonly ownerName?: string;
  readonly phone?: string;
  readonly notes?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') throw new Error(`INVALID_SUBSCRIBER_${fieldName.toUpperCase()}`);
  return value;
}

export function subscriberDocumentToState(document: SubscriberDocument): SubscriberState {
  const plateNumber = requiredString(document.plateNumber, 'plate_number');
  const plateNumberRaw = requiredString(document.plateNumberRaw, 'plate_number_raw');
  const startDate = requiredString(document.startDate, 'start_date');
  const endDate = requiredString(document.endDate, 'end_date');
  return {
    plateNumber,
    plateNumberRaw,
    startDate,
    endDate,
    ...(optionalString(document.ownerName) !== undefined ? { ownerName: optionalString(document.ownerName) } : {}),
    ...(optionalString(document.phone) !== undefined ? { phone: optionalString(document.phone) } : {}),
    ...(optionalString(document.notes) !== undefined ? { notes: optionalString(document.notes) } : {}),
  };
}

export function addRequestToCommand(
  subscriberData: SubscriberDocument,
  normalizedPlate: Readonly<{ plateNumber: string; plateRaw: string }>,
  dates: SubscriberDates,
): AddSubscriberCommand {
  return {
    plateNumber: normalizedPlate.plateNumber,
    plateNumberRaw: normalizedPlate.plateRaw,
    ...dates,
    ...(optionalString(subscriberData.ownerName) !== undefined ? { ownerName: optionalString(subscriberData.ownerName) } : {}),
    ...(optionalString(subscriberData.phone) !== undefined ? { phone: optionalString(subscriberData.phone) } : {}),
    ...(optionalString(subscriberData.notes) !== undefined ? { notes: optionalString(subscriberData.notes) } : {}),
  };
}

export function renewRequestToDates(newDates: SubscriberDocument, dates: SubscriberDates): SubscriberDates {
  // `dates` is already validated by the route; this helper makes the boundary explicit.
  void newDates;
  return { startDate: dates.startDate, endDate: dates.endDate };
}

export function updateRequestToCommand(
  mergedSubscriberData: SubscriberDocument,
  currentState: SubscriberState,
  dates: SubscriberDates,
): UpdateSubscriberCommand {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    plateNumber: currentState.plateNumber,
    plateNumberRaw: currentState.plateNumberRaw,
    ...(optionalString(mergedSubscriberData.ownerName) !== undefined ? { ownerName: optionalString(mergedSubscriberData.ownerName) } : {}),
    ...(optionalString(mergedSubscriberData.phone) !== undefined ? { phone: optionalString(mergedSubscriberData.phone) } : {}),
    ...(optionalString(mergedSubscriberData.notes) !== undefined ? { notes: optionalString(mergedSubscriberData.notes) } : {}),
  };
}

export function transitionToFirestoreUpdate(
  transition: SubscriberTransition,
): SubscriberUpdateFields {
  if (transition.kind !== 'updated' || !transition.state) {
    throw new Error('INVALID_SUBSCRIBER_UPDATE_TRANSITION');
  }
  const { startDate, endDate, ownerName, phone, notes } = transition.state;
  return {
    startDate,
    endDate,
    ...(ownerName !== undefined ? { ownerName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

export function lifecycleErrorToLegacyError(error: SubscriberLifecycleError): Error {
  return new Error(error);
}
