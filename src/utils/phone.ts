/** Palestinian mobile numbers are 9 digits after the country code: 59x/56x. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
}

/** Groups as 59 123 4567 while typing. */
export function formatPhone(input: string): string {
  const digits = normalizePhone(input);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9)].filter(Boolean);
  return parts.join(' ');
}

export function isValidPalestinianMobile(input: string): boolean {
  return /^(59|56)\d{7}$/.test(normalizePhone(input));
}

export function fullPhone(countryCode: string, national: string): string {
  return `${countryCode}${normalizePhone(national)}`;
}
