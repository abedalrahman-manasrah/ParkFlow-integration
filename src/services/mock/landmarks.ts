import type { Landmark } from '@/types';

/**
 * Curated Ramallah / Al-Bireh landmarks from the Wusool project, with the
 * informal names people use ("السينما القديمة", "الحسبة") as aliases — the
 * "ghost landmarks" Google Maps does not know.
 */
const lm = (
  id: string,
  nameAr: string,
  nameEn: string,
  latitude: number,
  longitude: number,
  aliases?: string[],
  kind: Landmark['kind'] = 'landmark',
): Landmark => ({ id, nameAr, nameEn, kind, location: { latitude, longitude }, aliases });

export const LANDMARKS: Landmark[] = [
  lm('lm_nasser_mosque', 'مسجد جمال عبد الناصر', 'Jamal Abdel Nasser Mosque', 31.90512, 35.19942, [
    'جامع جمال عبد الناصر',
    'مسجد عبد الناصر',
  ]),
  lm('lm_grand_mosque', 'المسجد الكبير', 'Grand Mosque Ramallah', 31.89845, 35.20401, ['الجامع الكبير']),
  lm('lm_manara', 'دوار المنارة', 'Al-Manara Square', 31.90332, 35.20583, ['المنارة', 'Manara']),
  lm('lm_second_circle', 'الدوار الثاني', 'Second Circle', 31.90381, 35.20719, ['الدوار التاني']),
  lm('lm_clock_circle', 'دوار الساعة', 'Clock Circle', 31.90366, 35.20702, ['الساعة']),
  lm('lm_gov_hospital', 'مستشفى رام الله الحكومي', 'Ramallah Governmental Hospital', 31.90097, 35.19318, [
    'المستشفى الحكومي',
    'مستشفى رام الله',
  ]),
  lm('lm_arab_care', 'المستشفى الاستشاري العربي', 'Arab Care Hospital', 31.91123, 35.19882, ['الاستشاري']),
  lm('lm_birzeit_uni', 'جامعة بيرزيت', 'Birzeit University', 31.96128, 35.18426, ['بيرزيت', 'Birzeit']),
  lm('lm_friends', 'مدرسة الفرندز', 'Friends School', 31.90045, 35.20983, ['الفرندز', 'Friends']),
  lm('lm_municipality', 'بلدية رام الله', 'Ramallah Municipality', 31.90211, 35.20604, ['البلدية']),
  lm('lm_quds_cinema', 'سينما القدس', 'Al-Quds Cinema', 31.9038, 35.2034, [
    'السينما القديمة',
    'سينما القدس القديمة',
    'old cinema',
  ]),
  lm('lm_kasaba', 'مسرح وسينما القصبة', 'Al-Kasaba Theatre', 31.90463, 35.20147, ['القصبة']),
  lm('lm_central_market', 'سوق رام الله المركزي', 'Ramallah Central Market', 31.89924, 35.20455, [
    'الحسبة',
    'سوق الخضار',
  ]),
  lm('lm_bireh_station', 'كراج البيرة', 'Al-Bireh Bus Station', 31.90701, 35.21387, ['مجمع البيرة']),
  lm('lm_zayed_hospital', 'مستشفى الشيخ زايد', 'Sheikh Zayed Hospital', 31.91594, 35.20845, ['الشيخ زايد']),
  lm('lm_shifa_pharmacy', 'صيدلية الشفاء', 'Al-Shifa Pharmacy', 31.90126, 35.20488),
  lm('lm_amal_market', 'سوبرماركت الأمل', 'Al-Amal Supermarket', 31.89958, 35.20425),
  lm('lm_bravo', 'سوبرماركت برافو', 'Bravo Supermarket', 31.90855, 35.20132, ['برافو', 'Bravo']),
  lm('lm_aqsa_bakery', 'مخبز الأقصى', 'Al-Aqsa Bakery', 31.89731, 35.20612),
  lm('lm_arab_bank', 'البنك العربي فرع رام الله', 'Arab Bank Ramallah', 31.90287, 35.20461, ['البنك العربي']),
  lm('lm_municipal_park', 'حديقة البلدية', 'Municipal Park', 31.90159, 35.20729),
  lm('lm_prince_hassan', 'مدرسة الأمير حسن', 'Prince Hassan School', 31.91032, 35.21744),
  lm('lm_omar_mosque', 'مسجد عمر بن الخطاب', 'Omar Ibn Al-Khattab Mosque', 31.90944, 35.21205),
  lm('lm_pmc', 'مجمع فلسطين الطبي', 'Palestine Medical Complex', 31.90083, 35.19366, ['المجمع الطبي']),
  lm('lm_natsheh', 'عمارة النتشة', 'Al-Natsheh Building', 31.89975, 35.20402, undefined, 'building'),
  lm('lm_zeitouna', 'عمارة الزيتونة', 'Al-Zeitouna Building', 31.90621, 35.20885, undefined, 'building'),
  lm('lm_quds_building', 'عمارة القدس', 'Al-Quds Building', 31.90241, 35.21033, undefined, 'building'),
  lm('lm_trade_tower', 'برج فلسطين التجاري', 'Palestine Trade Tower', 31.90477, 35.20669, undefined, 'building'),
];
