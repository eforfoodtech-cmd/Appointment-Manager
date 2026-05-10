/**
 * Shared time-input helpers for HH:MM saat formatı.
 *
 * Kullanım:
 *   onChangeText={(v) => setTime(formatTimeInput(v))}
 *   value={time}
 *   keyboardType="number-pad"
 *   maxLength={5}
 */

/**
 * Kullanıcı rawInput'u 4 rakama kadar daraltır ve "HH:MM" biçiminde döndürür.
 *
 * - 3. rakam girildiğinde iki nokta otomatik eklenir:
 *   "1"    → "1"
 *   "12"   → "12"
 *   "120"  → "12:0"
 *   "1200" → "12:00"
 * - Mevcut ":"yi silerek backspace yapınca döngüye girmez.
 */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Paste veya elle girilen çeşitli formatları normalize eder:
 *   "1200"  → "12:00"
 *   "0930"  → "09:30"
 *   "12:00" → "12:00"  (zaten geçerli)
 *   "9:30"  → "09:30"  (tek haneli saat)
 */
export function normalizeTimeInput(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;

  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return formatTimeInput(value);
}

/**
 * "HH:MM" formatında geçerli bir saat string'i mi kontrol eder.
 * allowMidnight=true ise "24:00" da kabul edilir (gece yarısı sentinel).
 */
export function isValidTime(value: string, allowMidnight = false): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  if (allowMidnight && h === 24 && m === 0) return true;
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
