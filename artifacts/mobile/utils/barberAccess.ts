const ACCESS_CODE_LENGTH = 6;
const ACCESS_CODE_PATTERN = /^\d{6}$/;

function isSixDigitCode(value: string): boolean {
  return ACCESS_CODE_PATTERN.test(value);
}

/**
 * Keeps only the first six digits. Intended for a controlled numeric TextInput.
 */
export function normalizeBarberAccessCode(value: string | number): string {
  return String(value).replace(/\D/g, "").slice(0, ACCESS_CODE_LENGTH);
}

/**
 * Extracts and validates a code from manual input or the app QR deep link.
 */
export function parseBarberAccessCode(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;

  const rawValue = String(value).trim();
  if (!rawValue) return null;

  // Manual entry may contain visual separators such as "123 456" or "123-456".
  if (/^[\d\s-]+$/.test(rawValue)) {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length !== ACCESS_CODE_LENGTH) return null;

    const normalized = normalizeBarberAccessCode(digits);
    return isSixDigitCode(normalized) ? normalized : null;
  }

  const queryCode = rawValue.match(/[?&#]code=(\d{6})(?=$|[&#/])/i)?.[1];
  if (queryCode && isSixDigitCode(queryCode)) return queryCode;

  const pathCode = rawValue.match(
    /(?:barbers?|barber-access|berber)[/:](\d{6})(?=$|[/?#&])/i,
  )?.[1];
  if (pathCode && isSixDigitCode(pathCode)) return pathCode;

  return null;
}

export function getBarberQrValue(
  code: string | number,
  publicAppUrl = process.env.EXPO_PUBLIC_APP_URL,
): string {
  const parsedCode = parseBarberAccessCode(code);
  if (!parsedCode) {
    throw new Error("QR kodu için geçerli bir berber kodu gereklidir.");
  }

  const query = `code=${encodeURIComponent(parsedCode)}`;
  const baseUrl = publicAppUrl?.trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/barbers?${query}` : `mobile://barbers?${query}`;
}

export function isValidBarberAccessCode(
  value: string | number | null | undefined,
): boolean {
  return parseBarberAccessCode(value) !== null;
}
