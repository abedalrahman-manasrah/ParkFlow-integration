/**
 * Palestinian plates are commonly shown as 6-1234-56 (region-serial-region).
 * We store digits only and format for display so users can type freely.
 */
export function normalizePlate(input: string): string {
  return input.replace(/\D/g, '').slice(0, 9);
}

export function formatPlate(input: string): string {
  const digits = normalizePlate(input);
  if (digits.length <= 1) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 1)}-${digits.slice(1)}`;
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 7)}`;
}

export function isValidPlate(input: string): boolean {
  const digits = normalizePlate(input);
  return digits.length >= 6 && digits.length <= 8;
}

/**
 * A vehicle saved without a nickname falls back to its plate as its name. Screens
 * that already show the plate badge use this to show the vehicle type instead of
 * the same number twice.
 */
export function isPlateOnlyName(displayName: string, plateNumber: string): boolean {
  const digits = normalizePlate(plateNumber);
  return digits.length > 0 && displayName.replace(/\D/g, '') === digits && !/\p{L}/u.test(displayName);
}
