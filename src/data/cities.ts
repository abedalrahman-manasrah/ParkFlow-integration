import type { GeoPoint } from '@/types';

/** West Bank cities offered for rides and spot listings, with a centre point. */
export const CITIES: { name: string; nameAr: string; center: GeoPoint }[] = [
  { name: 'Ramallah', nameAr: 'رام الله', center: { latitude: 31.9038, longitude: 35.2034 } },
  { name: 'Al-Bireh', nameAr: 'البيرة', center: { latitude: 31.9100, longitude: 35.2160 } },
  { name: 'Birzeit', nameAr: 'بيرزيت', center: { latitude: 31.9714, longitude: 35.1960 } },
  { name: 'Nablus', nameAr: 'نابلس', center: { latitude: 32.2211, longitude: 35.2544 } },
  { name: 'Hebron', nameAr: 'الخليل', center: { latitude: 31.5326, longitude: 35.0998 } },
  { name: 'Bethlehem', nameAr: 'بيت لحم', center: { latitude: 31.7054, longitude: 35.2024 } },
  { name: 'Jenin', nameAr: 'جنين', center: { latitude: 32.4646, longitude: 35.2939 } },
  { name: 'Tulkarm', nameAr: 'طولكرم', center: { latitude: 32.3104, longitude: 35.0286 } },
  { name: 'Qalqilya', nameAr: 'قلقيلية', center: { latitude: 32.1897, longitude: 34.9706 } },
  { name: 'Jericho', nameAr: 'أريحا', center: { latitude: 31.8667, longitude: 35.4500 } },
  { name: 'Salfit', nameAr: 'سلفيت', center: { latitude: 32.0833, longitude: 35.1833 } },
  { name: 'Tubas', nameAr: 'طوباس', center: { latitude: 32.3209, longitude: 35.3699 } },
];

export const cityLabel = (name: string, locale: string) =>
  locale === 'ar' ? CITIES.find((city) => city.name === name)?.nameAr ?? name : name;
