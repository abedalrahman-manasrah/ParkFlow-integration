import type { BadgeTone } from '@/components/ui/StatusBadge';
import type { HostSpot, RideBookingStatus, SpotBookingStatus } from '@/types';

/** Short weekday names in the UI language, Sunday first (matches the API's 0–6). */
export function weekdayNames(dateLocale: string): string[] {
  const format = new Intl.DateTimeFormat(dateLocale, { weekday: 'short', timeZone: 'UTC' });
  // 2026-01-04 was a Sunday.
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2026, 0, 4 + day))));
}

export function availabilityLabel(spot: Pick<HostSpot, 'weekdays' | 'availableFrom' | 'availableTo'>, dateLocale: string, t: (key: 'spot.everyDay' | 'spot.allDay') => string) {
  const names = weekdayNames(dateLocale);
  const days = spot.weekdays.length === 7 ? t('spot.everyDay') : spot.weekdays.map((day) => names[day]).join(' · ');
  const allDay = spot.availableFrom === '00:00' && spot.availableTo === '00:00';
  // The time range is isolated left-to-right so Arabic text does not flip it to "24:00–07:00".
  const range = `\u2066${spot.availableFrom}–${spot.availableTo === '00:00' ? '24:00' : spot.availableTo}\u2069`;
  return `${days} · ${allDay ? t('spot.allDay') : range}`;
}

export const ratingText = (rating?: number) => (rating ? rating.toFixed(1) : undefined);

export function rideBookingTone(status: RideBookingStatus): BadgeTone {
  if (status === 'accepted' || status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  return 'neutral';
}

export function spotBookingTone(status: SpotBookingStatus): BadgeTone {
  if (status === 'confirmed' || status === 'active' || status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  return 'neutral';
}

/** Whole shekels typed by a person → integer minor units for the API. */
export const shekelsToMinor = (text: string) => {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
};
