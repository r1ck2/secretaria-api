/**
 * Normalizes a phone number by stripping all non-numeric characters.
 * e.g. "+55 (11) 99999-9999" → "5511999999999"
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
