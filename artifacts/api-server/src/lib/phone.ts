const CANONICAL_TURKISH_PHONE_RE = /^5\d{9}$/;

/**
 * Accepts only the canonical Turkish mobile-phone format stored by the API:
 * 10 digits starting with 5, without a trunk prefix, country code, or formatting.
 */
export function parseCanonicalTurkishPhone(value: unknown): string | null {
  return typeof value === "string" &&
    CANONICAL_TURKISH_PHONE_RE.test(value)
    ? value
    : null;
}

/**
 * Converts a validated canonical phone number to the E.164 form required by
 * outbound SMS providers.
 */
export function toTurkishPhoneE164(phone: string): string {
  if (!CANONICAL_TURKISH_PHONE_RE.test(phone)) {
    throw new TypeError("Phone number is not in canonical Turkish format");
  }

  return `+90${phone}`;
}
