/**
 * Plate / phone normalization and formatting.
 *
 * IMPORTANT: normalizeLetters + getRawPlate MUST match the server's
 * normalizePlateRaw (server/validation.ts) so that client-side output
 * is identical to the stored plateNumberRaw. Any mismatch breaks plate
 * lookup exact-match queries.
 */

export const normalizeDigits = (val: string): string => {
  if (!val) return '';
  return val.replace(/[\u0660-\u0669\u06F0-\u06F9٫]/g, (char) => {
    if (char === '٫') return '.';
    const code = char.charCodeAt(0);
    if (code >= 1632 && code <= 1641) return String(code - 1632);
    if (code >= 1776 && code <= 1785) return String(code - 1776);
    return char;
  });
};

/**
 * Convert Western digits (0-9) to Arabic-Indic digits (٠-٩) for display.
 *
 * Used ONLY in the garage interface (plate display, plate keyboard, cars-inside
 * counter, rate displays) so uneducated staff see the same digits they see on
 * real Egyptian license plates — no mental translation needed.
 *
 * The data layer (Firestore, Worker API, PINs, phones, money) stays Western.
 * Conversion is purely display-time. The reverse operation is `normalizeDigits`.
 *
 * Passes through non-digit characters unchanged (Arabic letters, punctuation,
 * spaces, symbols all stay as-is). Only ASCII 0-9 are mapped.
 */
export const formatArabicDigits = (val: string | number | null | undefined): string => {
  if (val == null) return '';
  const str = typeof val === 'number' ? String(val) : val;
  if (!str) return '';
  // ASCII '0' = code 48, Arabic-Indic ٠ = U+0660 = code 1632. Offset = 1584.
  return str.replace(/[0-9]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 1584));
};

export const normalizeLetters = (val: string): string => {
  if (!val) return '';
  return val
    .replace(/[إأآٱ]/g, 'ا')  // all Alef variants → plain Alef (ا)
    .replace(/ة/g, 'ه')        // Teh Marbuta → Heh
    .replace(/ى/g, 'ي')        // Alef Maksura → Yeh
    .replace(/ئ/g, 'ي')        // Yeh with Hamza → Yeh
    .replace(/ؤ/g, 'و');       // Waw with Hamza → Waw
};

/**
 * Normalizes Arabic text for flexible and resilient searching.
 * Treats Alef variations as identical, Heh/Teh Marbuta as identical, and Yeh/Alef Maksura as identical.
 */
export const normalizeArabicSearch = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[أإآاةهىي]/g, m => {
      if (m === 'ة' || m === 'ه') return 'ه';
      if (m === 'ى' || m === 'ي') return 'ي';
      return 'ا';
    })
    .trim();
};

export const getCleanPlate = (val: string): string => {
  if (!val) return '';
  let letters = '';
  let numbers = '';

  // Preserve original Arabic letters (including Alef variants like أ إ آ)
  // for DISPLAY. Only normalize via getRawPlate() for server-side matching.
  // Pre-fix: this called normalizeLetters(val) which converted أ → ا, so the
  // plate display showed ا instead of أ and the keypad couldn't highlight أ.
  for (let i = 0; i < val.length; i++) {
    const char = val[i];
    // Numbers (English, Arabic, Persian)
    if ((char >= '0' && char <= '9') || (char >= '\u0660' && char <= '\u0669') || (char >= '\u06F0' && char <= '\u06F9')) {
      if (numbers.length < 4) numbers += char;
    }
    // Arabic Letters Only (Range \u0621-\u064A covers basic letters and hamzas)
    else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters += char;
    }
  }
  return letters + numbers;
};

export const getRawPlate = (val: string): string => {
  if (!val) return '';
  let letters = '';
  let numbers = '';

  const normalized = normalizeLetters(normalizeDigits(val));
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char >= '0' && char <= '9') {
      if (numbers.length < 4) numbers += char;
    } else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters += char;
    }
  }
  return letters + numbers;
};

export interface PlateParts {
  letters: string;
  numbers: string;
}

/**
 * Splits a plate number into its distinct letter and number segments.
 */
export const getPlateParts = (val: string): PlateParts => {
  const raw = getRawPlate(val);
  const letters = raw.replace(/[0-9]/g, '');
  const numbers = raw.replace(/[^0-9]/g, '');
  return { letters, numbers };
};

/**
 * Validates whether a plate has at least 1 letter and 1 number.
 */
export const isPlateValid = (val: string): boolean => {
  const { letters, numbers } = getPlateParts(val);
  return letters.length >= 1 && numbers.length >= 1;
};

export const normalizePhone = (phone: string): string => {
  return normalizeDigits(phone.trim()).replace(/[^\d+]/g, '');
};

export const formatPlateNumber = (val: string): string => {
  if (!val) return '';

  const letters: string[] = [];
  let numbers = '';

  const normalized = normalizeLetters(val);
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if ((char >= '0' && char <= '9') || (char >= '\u0660' && char <= '\u0669') || (char >= '\u06F0' && char <= '\u06F9')) {
      if (numbers.length < 4) numbers += char;
    } else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters.push(char);
    }
  }

  if (letters.length === 0 && numbers.length === 0) return '';
  // Join letters with spaces, but numbers WITHOUT spaces to prevent RTL reversal of digit order
  return letters.join(' ') + ' : ' + numbers;
};
