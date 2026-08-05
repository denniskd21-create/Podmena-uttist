/**
 * Input formatting and masking utilities for Vehicle management
 */

// Cyrillic to Latin and Latin to Cyrillic mapping for Russian License Plates
const LATIN_TO_CYRILLIC: Record<string, string> = {
  'A': 'А', 'a': 'А',
  'B': 'В', 'b': 'В',
  'E': 'Е', 'e': 'Е',
  'K': 'К', 'k': 'К',
  'M': 'М', 'm': 'М',
  'H': 'Н', 'h': 'Н',
  'O': 'О', 'o': 'О',
  'P': 'Р', 'p': 'Р',
  'C': 'С', 'c': 'С',
  'T': 'Т', 't': 'Т',
  'Y': 'У', 'y': 'У',
  'X': 'Х', 'x': 'Х'
};

/**
 * Format Garage Number: 4 digits max (0000)
 */
export function formatGarageNumber(val: string): string {
  return val.replace(/\D/g, '').slice(0, 4);
}

/**
 * Format Russian License Plate: Х 000 ХХ 00 or Х 000 ХХ 000
 * Automatically converts Latin lookalikes to Russian Cyrillic uppercase.
 */
export function formatLicensePlate(val: string): string {
  let clean = '';
  for (const char of val) {
    const upper = char.toUpperCase();
    if (LATIN_TO_CYRILLIC[char]) {
      clean += LATIN_TO_CYRILLIC[char];
    } else if (/[АВЕКМНОРСТУХ0-9]/.test(upper)) {
      clean += upper;
    }
  }

  let p1 = ''; // 1 letter
  let p2 = ''; // 3 digits
  let p3 = ''; // 2 letters
  let p4 = ''; // 2-3 digits

  let idx = 0;
  while (idx < clean.length && p1.length < 1) {
    if (/[АВЕКМНОРСТУХ]/.test(clean[idx])) p1 += clean[idx];
    idx++;
  }
  while (idx < clean.length && p2.length < 3) {
    if (/[0-9]/.test(clean[idx])) p2 += clean[idx];
    idx++;
  }
  while (idx < clean.length && p3.length < 2) {
    if (/[АВЕКМНОРСТУХ]/.test(clean[idx])) p3 += clean[idx];
    idx++;
  }
  while (idx < clean.length && p4.length < 3) {
    if (/[0-9]/.test(clean[idx])) p4 += clean[idx];
    idx++;
  }

  let result = '';
  if (p1) result += p1;

  if (p2) {
    result += ' ' + p2;
  } else if (clean.length > 1) {
    result += ' ';
  }

  if (p3) {
    result += ' ' + p3;
  } else if (p2.length === 3 && clean.length > 4) {
    result += ' ';
  }

  if (p4) {
    result += ' ' + p4;
  } else if (p3.length === 2 && clean.length >= 6) {
    result += ' ';
  }

  return result;
}

/**
 * Format MVZ Code: 10 digits max (0000000000)
 */
export function formatMvzCode(val: string): string {
  return val.replace(/\D/g, '').slice(0, 10);
}

/**
 * Format Phone Number: +7 (000) 000-00-00
 * Handles pasting +7..., 8..., or typing directly without losing digits or duplicating prefixes.
 */
export function formatPhoneNumber(val: string): string {
  if (!val) return '';

  let digits = val.replace(/\D/g, '');
  if (!digits) return '';

  // 1. If digits contains duplicated country/trunk prefixes (e.g. when pasting +79854655375 or 89854655375 into an input with +7),
  // strip leading 7 or 8 while total length > 10.
  while (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }

  // 2. If digits starts with '7' (which happens when val contains '+7' mask or typed 7)
  // or starts with '89' (which is trunk code 8 + mobile code 9xx)
  if (digits.startsWith('7')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('89')) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  let formatted = '+7';
  if (digits.length > 0) {
    formatted += ' (' + digits.slice(0, 3);
  }
  if (digits.length >= 3) {
    formatted += ') ' + digits.slice(3, 6);
  }
  if (digits.length >= 6) {
    formatted += '-' + digits.slice(6, 8);
  }
  if (digits.length >= 8) {
    formatted += '-' + digits.slice(8, 10);
  }
  return formatted;
}

/**
 * Format Time Input as user types: HH:MM
 */
export function formatTimeInput(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  
  let hh = parseInt(digits.slice(0, 2), 10);
  if (hh > 23) hh = 23;
  const hhStr = hh.toString().padStart(2, '0');

  const mmDigits = digits.slice(2);
  if (mmDigits.length === 1) {
    return `${hhStr}:${mmDigits}`;
  }
  let mm = parseInt(mmDigits, 10);
  if (mm > 59) mm = 59;
  const mmStr = mm.toString().padStart(2, '0');

  return `${hhStr}:${mmStr}`;
}

/**
 * Finalize time format on blur (e.g. "630" -> "06:30", "6" -> "06:00")
 */
export function finalizeTimeFormat(val: string, defaultTime: string = '06:00'): string {
  const digits = val.replace(/\D/g, '');
  if (digits.length === 0) return defaultTime;
  if (digits.length === 1) return `0${digits}:00`;
  if (digits.length === 2) {
    const hh = Math.min(23, parseInt(digits, 10)).toString().padStart(2, '0');
    return `${hh}:00`;
  }
  if (digits.length === 3) {
    const hh = `0${digits[0]}`;
    let mm = parseInt(digits.slice(1), 10);
    if (mm > 59) mm = 59;
    return `${hh}:${mm.toString().padStart(2, '0')}`;
  }
  let hh = Math.min(23, parseInt(digits.slice(0, 2), 10)).toString().padStart(2, '0');
  let mm = Math.min(59, parseInt(digits.slice(2, 4), 10)).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}
