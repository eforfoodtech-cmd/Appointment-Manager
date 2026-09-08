const ACCESS_CODE_LENGTH = 6;
const ACCESS_CODE_SPACE = 900_000;
const ACCESS_CODE_MULTIPLIER = 7_919;
const ACCESS_CODE_OFFSET = 104_729;

const ACCESS_CODE_PATTERN = /^\d{6}$/;

function isSixDigitCode(value: string): boolean {
  return ACCESS_CODE_PATTERN.test(value);
}

/**
 * Returns the stable six-digit demo access code for a barber profile.
 *
 * 7,919 and 900,000 are coprime, so this affine mapping is a permutation
 * (and therefore collision-free) for profile IDs in the 0..899,999 range.
 */
export function getBarberAccessCode(barberId: number): string {
  if (!Number.isSafeInteger(barberId) || barberId < 0) {
    throw new Error("Berber kimliği negatif olmayan bir tam sayı olmalıdır.");
  }

  const idInDemoRange =
    ((barberId % ACCESS_CODE_SPACE) + ACCESS_CODE_SPACE) % ACCESS_CODE_SPACE;
  const numericCode =
    (idInDemoRange * ACCESS_CODE_MULTIPLIER + ACCESS_CODE_OFFSET) %
    ACCESS_CODE_SPACE;

  // TODO(backend): Replace this deterministic demo mapping with a persisted,
  // server-issued unique access code once the barber access API is available.
  return String(numericCode).padStart(ACCESS_CODE_LENGTH, "0");
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
