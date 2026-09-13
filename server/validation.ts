export interface ValidationOptions {
  min?: number;
  max?: number;
  integerOnly?: boolean;
  required?: boolean;
  allowEmptyString?: boolean;
  pattern?: RegExp;
}

export class ValidationError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, code = 'INVALID_INPUT', statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Validates and sanitizes a string ID (e.g. garageId, packageId, vehicleId, reqId)
 */
export function validateId(val: any, fieldName = 'ID', required = true): string {
  if (val === undefined || val === null || val === '') {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return '';
  }

  if (typeof val !== 'string') {
    throw new ValidationError(`Invalid ${fieldName}: must be a string`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }

  const trimmed = val.trim();
  if (required && trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, `EMPTY_${fieldName.toUpperCase()}`, 400);
  }

  if (trimmed.length > 128) {
    throw new ValidationError(`${fieldName} exceeds maximum length of 128 characters`, `${fieldName.toUpperCase()}_TOO_LONG`, 400);
  }

  // Prevent path traversal or script injection
  const safeIdRegex = /^[a-zA-Z0-9_\-\.\:\@\s]+$/;
  if (!safeIdRegex.test(trimmed)) {
    throw new ValidationError(`Invalid characters in ${fieldName}`, `INVALID_CHARS_${fieldName.toUpperCase()}`, 400);
  }

  return trimmed;
}

/**
 * Validates numeric values (amounts, counts, prices, durations)
 */
export function validateNumber(
  val: any,
  fieldName = 'Amount',
  options: ValidationOptions = {}
): number {
  const { min = 0, max = 10000000, integerOnly = false, required = true } = options;

  if (val === undefined || val === null || val === '') {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return 0;
  }

  // Reject objects, arrays, booleans
  if (typeof val !== 'number' && typeof val !== 'string') {
    throw new ValidationError(`Invalid ${fieldName}: must be a number`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }

  const parsed = Number(val);

  if (isNaN(parsed) || !isFinite(parsed)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a finite number`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }

  if (integerOnly && !Number.isInteger(parsed)) {
    throw new ValidationError(`${fieldName} must be an integer`, `INTEGER_REQUIRED_${fieldName.toUpperCase()}`, 400);
  }

  if (parsed < min) {
    throw new ValidationError(`${fieldName} cannot be less than ${min}`, `${fieldName.toUpperCase()}_TOO_LOW`, 400);
  }

  if (parsed > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}`, `${fieldName.toUpperCase()}_TOO_HIGH`, 400);
  }

  // Round floats to 2 decimal places max for money/currency
  return Math.round(parsed * 100) / 100;
}

/**
 * Validates text strings (names, notes, descriptions)
 */
export function validateString(
  val: any,
  fieldName = 'String',
  options: ValidationOptions = {}
): string {
  const { min = 0, max = 256, required = false, allowEmptyString = true, pattern } = options;

  if (val === undefined || val === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return '';
  }

  if (typeof val !== 'string') {
    throw new ValidationError(`Invalid ${fieldName}: must be a string`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }

  const trimmed = val.trim();

  if (required && trimmed.length === 0 && !allowEmptyString) {
    throw new ValidationError(`${fieldName} cannot be empty`, `EMPTY_${fieldName.toUpperCase()}`, 400);
  }

  if (trimmed.length < min) {
    throw new ValidationError(`${fieldName} must be at least ${min} characters`, `${fieldName.toUpperCase()}_TOO_SHORT`, 400);
  }

  if (trimmed.length > max) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${max} characters`, `${fieldName.toUpperCase()}_TOO_LONG`, 400);
  }

  if (pattern && !pattern.test(trimmed)) {
    throw new ValidationError(`Invalid format for ${fieldName}`, `INVALID_FORMAT_${fieldName.toUpperCase()}`, 400);
  }

  return trimmed;
}

/**
 * Validates subscriber date keys and guarantees a non-negative date range.
 * Date-only values are interpreted as calendar dates, not server-local times.
 */
export function validateDateRange(startDate: any, endDate: any, fieldPrefix = 'subscriber'): { startDate: string; endDate: string } {
  const start = validateString(startDate, `${fieldPrefix} start date`, { required: true, allowEmptyString: false, pattern: /^\d{4}-\d{2}-\d{2}$/ });
  const end = validateString(endDate, `${fieldPrefix} end date`, { required: true, allowEmptyString: false, pattern: /^\d{4}-\d{2}-\d{2}$/ });

  const parseDateKey = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  };

  const parsedStart = parseDateKey(start);
  const parsedEnd = parseDateKey(end);
  if (!parsedStart || !parsedEnd) {
    throw new ValidationError('Subscriber dates must be valid calendar dates', 'INVALID_SUBSCRIBER_DATES', 400);
  }
  if (parsedEnd.getTime() < parsedStart.getTime()) {
    throw new ValidationError('Subscriber end date cannot be before start date', 'INVALID_SUBSCRIBER_DATE_RANGE', 400);
  }

  return { startDate: start, endDate: end };
}

/**
 * Validates vehicle plate input
 */
export function validatePlate(val: any, fieldName = 'Plate Number'): { plateNumber: string; plateRaw: string } {
  const str = validateString(val, fieldName, { required: true, min: 1, max: 64 });
  // Strip non-printable characters or script tags
  const cleanStr = str.replace(/[<>'"]/g, '').trim();
  
  // plateRaw removes whitespace for standardized document key lookup
  const plateRaw = cleanStr.replace(/\s+/g, '');
  if (!plateRaw) {
    throw new ValidationError('Plate number cannot be blank', 'INVALID_PLATE', 400);
  }

  return { plateNumber: cleanStr, plateRaw };
}

/**
 * Validates an enum value against an allowed list
 */
export function validateEnum<T extends string>(
  val: any,
  allowedValues: readonly T[],
  fieldName = 'Enum'
): T {
  if (!val || typeof val !== 'string' || !allowedValues.includes(val as T)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be one of [${allowedValues.join(', ')}]`,
      `INVALID_${fieldName.toUpperCase()}`,
      400
    );
  }
  return val as T;
}

/**
 * Sanitizes request payload by checking and keeping allowed keys only.
 * Throws an error if disallowed unknown keys are injected and rejectUnknown = true.
 */
export function sanitizePayload<T extends Record<string, any>>(
  body: any,
  allowedKeys: string[],
  rejectUnknown = true
): Partial<T> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object', 'INVALID_BODY', 400);
  }

  const bodyKeys = Object.keys(body);

  if (rejectUnknown) {
    const unknownKeys = bodyKeys.filter(k => !allowedKeys.includes(k));
    if (unknownKeys.length > 0) {
      throw new ValidationError(
        `Unexpected field(s) in request body: ${unknownKeys.join(', ')}`,
        'UNKNOWN_FIELDS_REJECTED',
        400
      );
    }
  }

  const sanitized: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      sanitized[key] = body[key];
    }
  }

  return sanitized as Partial<T>;
}

/**
 * Validates optional Idempotency Key
 */
export function validateIdempotencyKey(key: any): string | null {
  if (!key) return null;
  if (typeof key !== 'string') {
    throw new ValidationError('Idempotency key must be a string', 'INVALID_IDEMPOTENCY_KEY', 400);
  }
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new ValidationError('Idempotency key must be between 8 and 128 characters', 'INVALID_IDEMPOTENCY_KEY_LENGTH', 400);
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
    throw new ValidationError('Idempotency key contains invalid characters', 'INVALID_IDEMPOTENCY_KEY_CHARS', 400);
  }
  return trimmed;
}
