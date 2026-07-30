export const TURKISH_MOBILE_PHONE_PATTERN = /^5\d{9}$/;

export function sanitizeTurkishMobilePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function isTurkishMobilePhone(value: string): boolean {
  return TURKISH_MOBILE_PHONE_PATTERN.test(value);
}

export function toTurkishMobileTelUrl(phone: string): string {
  return `tel:+90${phone}`;
}
