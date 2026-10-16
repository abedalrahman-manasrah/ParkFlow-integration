import type { ISODateString } from '@/types';

export const nowIso = (): ISODateString => new Date().toISOString();

export const toDate = (iso: ISODateString): Date => new Date(iso);

export const secondsBetween = (from: ISODateString, to: ISODateString | Date = new Date()): number => {
  const end = to instanceof Date ? to.getTime() : new Date(to).getTime();
  return Math.max(0, Math.floor((end - new Date(from).getTime()) / 1000));
};

export const addMinutes = (iso: ISODateString, minutes: number): ISODateString =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

/** "00:42:16" — always HH:MM:SS so the timer never changes width. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "47 min" / "2h 10m" — for lists where seconds are noise. */
export function formatDurationShort(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatTime(iso: ISODateString, locale = 'en-US'): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: locale.startsWith('en'),
  });
}

export function formatDate(iso: ISODateString, locale = 'en-US'): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: ISODateString, locale = 'en-US'): string {
  return `${formatDate(iso, locale)} • ${formatTime(iso, locale)}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Day offset relative to today: 0 today, 1 yesterday, ... */
export function dayOffset(iso: ISODateString): number {
  const days = (startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000;
  return Math.round(days);
}

/** Section headings for history lists. */
export function formatDayHeading(
  iso: ISODateString,
  labels: { today: string; yesterday: string },
  locale = 'en-US',
): string {
  const offset = dayOffset(iso);
  if (offset === 0) return labels.today;
  if (offset === 1) return labels.yesterday;
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "08:00 AM – 06:00 PM" from 24h "08:00" strings. */
export function formatClockRange(opensAt: string, closesAt: string, locale = 'en-US'): string {
  const fmt = (value: string) => {
    const [hRaw, mRaw] = value.split(':');
    const h = Number(hRaw ?? 0);
    const m = Number(mRaw ?? 0);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: locale.startsWith('en'),
    });
  };
  return `${fmt(opensAt)} – ${fmt(closesAt)}`;
}

const clockMinutes = (value: string): number => {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
};

/** True only while the current weekday's configured opening window is active. */
export function isWithinOperatingHours(
  hours: { weekday: number; opensAt: string; closesAt: string; closed?: boolean }[],
  at = new Date(),
): boolean {
  const today = hours.find((entry) => entry.weekday === at.getDay());
  if (!today || today.closed) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  const opens = clockMinutes(today.opensAt);
  const closes = clockMinutes(today.closesAt);
  return closes >= opens ? now >= opens && now <= closes : now >= opens || now <= closes;
}
