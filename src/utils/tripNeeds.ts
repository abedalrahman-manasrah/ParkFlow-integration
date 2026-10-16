import type { CarServiceCategory, GeoPoint } from '@/types';
import { normalizeArabic } from './arabic';

export type TripNeedCategoryId =
  | 'bakery'
  | 'restaurant'
  | 'cafe'
  | 'supermarket'
  | 'pharmacy'
  | 'fuel'
  | 'bank_atm'
  | 'exchange'
  | 'post_office'
  | 'mall'
  | 'clothes'
  | 'shoes'
  | 'electronics'
  | 'mobile_shop'
  | 'park'
  | 'playground'
  | 'amusement'
  | 'doctor_clinic'
  | 'hospital'
  | 'lab'
  | 'hotel'
  | 'mosque'
  | 'church'
  | 'toilets'
  | 'parking'
  | 'barber'
  | 'salon'
  | 'laundry'
  | 'printing'
  | 'stationery'
  | 'car_parts'
  | CarServiceCategory;

export interface TripNeedCategory {
  id: TripNeedCategoryId | string;
  labelAr: string;
  labelEn: string;
  searchQueries: string[];
  aliases: string[];
  carServiceCategory?: CarServiceCategory;
  needKey?: string;
  needLabelAr?: string;
  needLabelEn?: string;
}

export interface TripNeedPlace {
  id: string;
  categoryId: TripNeedCategoryId | string;
  labelAr: string;
  labelEn: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  location: GeoPoint;
  source: 'place' | 'car_service';
  needKey?: string;
}

export interface TripNeedFreeText {
  id: string;
  phrase: string;
  normalized: string;
  searchQueries?: string[];
}

const ar = (value: string) => value;

export const TRIP_NEED_CATEGORIES: TripNeedCategory[] = [
  {
    id: 'bakery',
    labelAr: ar('\u0645\u062e\u0628\u0632'),
    labelEn: 'bakery',
    searchQueries: ['bakery', 'bread'],
    aliases: ['bakery', 'bakeries', 'bread', 'loaf', 'pastry', 'pastries', 'baked goods', 'khubz', ar('\u0645\u062e\u0628\u0632'), ar('\u0645\u062e\u0627\u0628\u0632'), ar('\u062e\u0628\u0632'), ar('\u0645\u0639\u062c\u0646\u0627\u062a'), ar('\u0645\u062e\u0628\u0648\u0632\u0627\u062a'), ar('\u0641\u0631\u0646')],
  },
  {
    id: 'restaurant',
    labelAr: ar('\u0645\u0637\u0639\u0645'),
    labelEn: 'restaurant',
    searchQueries: ['restaurant', 'food'],
    aliases: ['restaurant', 'restaurants', 'food', 'eat', 'meal', 'dining', 'pizza', 'burger', 'shawarma', 'falafel', 'chicken', 'grill', ar('\u0645\u0637\u0639\u0645'), ar('\u0645\u0637\u0627\u0639\u0645'), ar('\u0627\u0643\u0644'), ar('\u0623\u0643\u0644'), ar('\u0637\u0639\u0627\u0645'), ar('\u0628\u064a\u062a\u0632\u0627'), ar('\u0628\u0631\u063a\u0631'), ar('\u0634\u0627\u0648\u0631\u0645\u0627'), ar('\u0641\u0644\u0627\u0641\u0644'), ar('\u062f\u062c\u0627\u062c'), ar('\u0645\u0634\u0627\u0648\u064a')],
  },
  {
    id: 'cafe',
    labelAr: ar('\u0642\u0647\u0648\u0629'),
    labelEn: 'cafe',
    searchQueries: ['cafe', 'coffee'],
    aliases: ['cafe', 'coffee', 'coffee shop', 'espresso', 'latte', 'cappuccino', ar('\u0642\u0647\u0648\u0629'), ar('\u0643\u0627\u0641\u064a\u0647'), ar('\u0643\u0627\u0641\u064a'), ar('\u0645\u0642\u0647\u0649'), ar('\u0645\u0642\u0627\u0647\u064a'), ar('\u0643\u0627\u0628\u062a\u0634\u064a\u0646\u0648')],
  },
  {
    id: 'supermarket',
    labelAr: ar('\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062a'),
    labelEn: 'supermarket',
    searchQueries: ['supermarket', 'grocery'],
    aliases: [
      'supermarket', 'grocery', 'groceries', 'market', 'minimarket', 'chips', 'crisps', 'juice', 'water', 'milk',
      'eggs', 'egg', 'rice', 'sugar', 'oil', 'vegetables', 'fruit', 'diapers', 'tissues', 'napkins', 'soap',
      'shampoo', 'detergent', 'household', 'household items', 'home supplies', 'snacks', 'soda', 'soft drink',
      'cleaning supplies', 'cleaning products',
      ar('\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062a'), ar('\u0633\u0648\u0628\u0631'), ar('\u0628\u0642\u0627\u0644\u0629'), ar('\u062a\u0645\u0648\u064a\u0646\u0627\u062a'), ar('\u0645\u0627\u0631\u0643\u062a'),
      ar('\u0634\u0628\u0633'), ar('\u0634\u064a\u0628\u0633'), ar('\u0639\u0635\u064a\u0631'), ar('\u0645\u064a\u0627\u0647'), ar('\u0645\u064a'), ar('\u0645\u0627\u064a'), ar('\u062d\u0644\u064a\u0628'),
      ar('\u0628\u064a\u0636'), ar('\u0631\u0632'), ar('\u0633\u0643\u0631'), ar('\u0632\u064a\u062a'), ar('\u062e\u0636\u0627\u0631'), ar('\u0641\u0648\u0627\u0643\u0647'), ar('\u062d\u0641\u0627\u0636\u0627\u062a'), ar('\u0645\u0646\u0627\u062f\u064a\u0644'), ar('\u0645\u062d\u0627\u0631\u0645'), ar('\u0635\u0627\u0628\u0648\u0646'), ar('\u0634\u0627\u0645\u0628\u0648'),
      ar('\u0645\u0646\u0638\u0641\u0627\u062a'), ar('\u0623\u063a\u0631\u0627\u0636'), ar('\u0627\u063a\u0631\u0627\u0636'), ar('\u0623\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'),
      ar('\u0623\u063a\u0631\u0627\u0636 \u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0628\u064a\u062a'), ar('\u0644\u0644\u0628\u064a\u062a'), ar('\u0628\u064a\u062a'), ar('\u0633\u0646\u0627\u0643\u0633'),
    ],
  },
  {
    id: 'pharmacy',
    labelAr: ar('\u0635\u064a\u062f\u0644\u064a\u0629'),
    labelEn: 'pharmacy',
    searchQueries: ['pharmacy'],
    aliases: ['pharmacy', 'pharmacies', 'drugstore', 'medicine', 'medication', 'painkiller', 'pain killer', 'ibuprofen', 'paracetamol', 'aspirin', ar('\u0635\u064a\u062f\u0644\u064a\u0629'), ar('\u0635\u064a\u062f\u0644\u064a\u0627\u062a'), ar('\u062f\u0648\u0627\u0621'), ar('\u062f\u0648\u0627'), ar('\u0645\u0633\u0643\u0646'), ar('\u0645\u0633\u0643\u0646\u0627\u062a'), ar('\u0628\u0646\u0627\u062f\u0648\u0644')],
  },
  {
    id: 'doctor_clinic',
    labelAr: ar('\u0639\u064a\u0627\u062f\u0629'),
    labelEn: 'clinic',
    searchQueries: ['clinic', 'doctor'],
    aliases: ['doctor', 'clinic', 'doctors', 'medical clinic', ar('\u062f\u0643\u062a\u0648\u0631'), ar('\u0637\u0628\u064a\u0628'), ar('\u0639\u064a\u0627\u062f\u0629'), ar('\u0639\u064a\u0627\u062f\u0627\u062a')],
  },
  {
    id: 'hospital',
    labelAr: ar('\u0645\u0633\u062a\u0634\u0641\u0649'),
    labelEn: 'hospital',
    searchQueries: ['hospital'],
    aliases: ['hospital', 'emergency', ar('\u0645\u0633\u062a\u0634\u0641\u0649'), ar('\u0645\u0634\u0641\u0649'), ar('\u0637\u0648\u0627\u0631\u0626')],
  },
  {
    id: 'lab',
    labelAr: ar('\u0645\u062e\u062a\u0628\u0631'),
    labelEn: 'lab',
    searchQueries: ['medical lab', 'laboratory'],
    aliases: ['lab', 'laboratory', 'medical lab', 'blood test', ar('\u0645\u062e\u062a\u0628\u0631'), ar('\u0645\u062e\u062a\u0628\u0631\u0627\u062a'), ar('\u062a\u062d\u0627\u0644\u064a\u0644')],
  },
  {
    id: 'fuel',
    labelAr: ar('\u0645\u062d\u0637\u0629 \u0648\u0642\u0648\u062f'),
    labelEn: 'gas station',
    searchQueries: ['gas station', 'fuel'],
    aliases: ['gas', 'gas station', 'fuel', 'petrol', 'petrol station', 'diesel', ar('\u0628\u0646\u0632\u064a\u0646'), ar('\u0648\u0642\u0648\u062f'), ar('\u0633\u0648\u0644\u0627\u0631'), ar('\u062f\u064a\u0632\u0644'), ar('\u0645\u062d\u0637\u0629 \u0648\u0642\u0648\u062f'), ar('\u0645\u062d\u0631\u0648\u0642\u0627\u062a')],
  },
  {
    id: 'bank_atm',
    labelAr: ar('\u0628\u0646\u0643 \u0623\u0648 \u0635\u0631\u0627\u0641'),
    labelEn: 'bank or ATM',
    searchQueries: ['bank', 'atm'],
    aliases: ['bank', 'banks', 'atm', 'cash', 'cash machine', ar('\u0628\u0646\u0643'), ar('\u0628\u0646\u0648\u0643'), ar('\u0635\u0631\u0627\u0641'), ar('\u0635\u0631\u0627\u0641 \u0627\u0644\u064a'), ar('\u0635\u0631\u0627\u0641 \u0622\u0644\u064a')],
  },
  {
    id: 'exchange',
    labelAr: ar('\u0635\u0631\u0627\u0641\u0629'),
    labelEn: 'exchange',
    searchQueries: ['currency exchange', 'exchange'],
    aliases: ['exchange', 'currency exchange', 'money exchange', ar('\u0635\u0631\u0627\u0641\u0629'), ar('\u0635\u0631\u0627\u0641'), ar('\u062a\u0628\u062f\u064a\u0644 \u0639\u0645\u0644\u0629')],
  },
  {
    id: 'post_office',
    labelAr: ar('\u0628\u0631\u064a\u062f'),
    labelEn: 'post office',
    searchQueries: ['post office'],
    aliases: ['post office', 'post', 'mail', ar('\u0628\u0631\u064a\u062f'), ar('\u0645\u0643\u062a\u0628 \u0628\u0631\u064a\u062f')],
  },
  {
    id: 'mall',
    labelAr: ar('\u0645\u0648\u0644'),
    labelEn: 'mall',
    searchQueries: ['mall', 'shopping mall'],
    aliases: ['mall', 'shopping', 'shopping mall', ar('\u0645\u0648\u0644'), ar('\u0645\u0631\u0643\u0632 \u062a\u062c\u0627\u0631\u064a'), ar('\u062a\u0633\u0648\u0642')],
  },
  {
    id: 'clothes',
    labelAr: ar('\u0645\u0644\u0627\u0628\u0633'),
    labelEn: 'clothes',
    searchQueries: ['clothes', 'clothing store'],
    aliases: ['clothes', 'clothing', 'fashion', ar('\u0645\u0644\u0627\u0628\u0633'), ar('\u0627\u0648\u0627\u0639\u064a'), ar('\u0623\u0648\u0627\u0639\u064a')],
  },
  {
    id: 'shoes',
    labelAr: ar('\u0623\u062d\u0630\u064a\u0629'),
    labelEn: 'shoes',
    searchQueries: ['shoes', 'shoe store'],
    aliases: ['shoes', 'shoe store', ar('\u0623\u062d\u0630\u064a\u0629'), ar('\u0627\u062d\u0630\u064a\u0629'), ar('\u0643\u0646\u0627\u062f\u0631')],
  },
  {
    id: 'electronics',
    labelAr: ar('\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a'),
    labelEn: 'electronics',
    searchQueries: ['electronics'],
    aliases: ['electronics', 'electrical', ar('\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a'), ar('\u0627\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a'), ar('\u0643\u0647\u0631\u0628\u0627\u0626\u064a\u0627\u062a')],
  },
  {
    id: 'mobile_shop',
    labelAr: ar('\u0645\u062d\u0644 \u0645\u0648\u0628\u0627\u064a\u0644'),
    labelEn: 'mobile shop',
    searchQueries: ['mobile shop', 'phone shop'],
    aliases: ['mobile shop', 'phone shop', 'cell phone', 'mobile', ar('\u0645\u0648\u0628\u0627\u064a\u0644'), ar('\u062c\u0648\u0627\u0644'), ar('\u062e\u0644\u0648\u064a'), ar('\u0645\u062d\u0644 \u062c\u0648\u0627\u0644\u0627\u062a')],
  },
  {
    id: 'park',
    labelAr: ar('\u062d\u062f\u064a\u0642\u0629'),
    labelEn: 'park',
    searchQueries: ['park'],
    aliases: ['park', 'family place', 'kids', 'family', ar('\u062d\u062f\u064a\u0642\u0629'), ar('\u062d\u062f\u0627\u0626\u0642'), ar('\u0645\u0646\u062a\u0632\u0647'), ar('\u0623\u0637\u0641\u0627\u0644'), ar('\u0627\u0637\u0641\u0627\u0644'), ar('\u0639\u0627\u0626\u0644\u0629')],
  },
  {
    id: 'playground',
    labelAr: ar('\u0645\u0644\u0639\u0628 \u0623\u0637\u0641\u0627\u0644'),
    labelEn: 'playground',
    searchQueries: ['playground'],
    aliases: ['playground', 'kids playground', ar('\u0645\u0644\u0639\u0628'), ar('\u0645\u0644\u0627\u0639\u0628'), ar('\u0623\u0644\u0639\u0627\u0628 \u0623\u0637\u0641\u0627\u0644'), ar('\u0627\u0644\u0639\u0627\u0628 \u0627\u0637\u0641\u0627\u0644')],
  },
  {
    id: 'amusement',
    labelAr: ar('\u0645\u0644\u0627\u0647\u064a'),
    labelEn: 'amusement',
    searchQueries: ['amusement', 'theme park'],
    aliases: ['amusement', 'theme park', 'kids amusement', ar('\u0645\u0644\u0627\u0647\u064a'), ar('\u0645\u0644\u0627\u0647\u064a \u0644\u0644\u0627\u0637\u0641\u0627\u0644'), ar('\u0645\u0644\u0627\u0647\u064a \u0644\u0644\u0623\u0637\u0641\u0627\u0644')],
  },
  {
    id: 'car_wash',
    labelAr: ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0629'),
    labelEn: 'car wash',
    searchQueries: ['car wash'],
    carServiceCategory: 'car_wash',
    aliases: ['car wash', 'wash car', 'car cleaning', ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0629'), ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0627\u062a'), ar('\u0645\u063a\u0633\u0644\u0629')],
  },
  {
    id: 'maintenance',
    labelAr: ar('\u0635\u064a\u0627\u0646\u0629'),
    labelEn: 'maintenance',
    searchQueries: ['car repair', 'mechanic'],
    carServiceCategory: 'maintenance',
    aliases: ['maintenance', 'mechanic', 'garage', 'car repair', 'repair', 'battery', 'car battery', ar('\u0635\u064a\u0627\u0646\u0629'), ar('\u062a\u0635\u0644\u064a\u062d'), ar('\u0645\u064a\u0643\u0627\u0646\u064a\u0643'), ar('\u0643\u0631\u0627\u062c'), ar('\u0628\u0637\u0627\u0631\u064a\u0629'), ar('\u0628\u0637\u0627\u0631\u064a\u0629 \u0633\u064a\u0627\u0631\u0629')],
  },
  {
    id: 'tire_service',
    labelAr: ar('\u062e\u062f\u0645\u0629 \u0625\u0637\u0627\u0631\u0627\u062a'),
    labelEn: 'tire service',
    searchQueries: ['tire service', 'tyre service'],
    carServiceCategory: 'tire_service',
    aliases: ['tire', 'tires', 'tyre', 'tyres', 'tire service', ar('\u0625\u0637\u0627\u0631'), ar('\u0627\u0637\u0627\u0631'), ar('\u0625\u0637\u0627\u0631\u0627\u062a'), ar('\u062f\u0648\u0627\u0644\u064a\u0628'), ar('\u0643\u0641\u0631\u0627\u062a')],
  },
  {
    id: 'oil_change',
    labelAr: ar('\u062a\u063a\u064a\u064a\u0631 \u0632\u064a\u062a'),
    labelEn: 'oil change',
    searchQueries: ['oil change'],
    carServiceCategory: 'oil_change',
    aliases: ['oil', 'oil change', 'engine oil', ar('\u0632\u064a\u062a'), ar('\u062a\u063a\u064a\u064a\u0631 \u0632\u064a\u062a'), ar('\u063a\u064a\u0627\u0631 \u0632\u064a\u062a')],
  },
  {
    id: 'car_parts',
    labelAr: ar('\u0642\u0637\u0639 \u0633\u064a\u0627\u0631\u0627\u062a'),
    labelEn: 'car parts',
    searchQueries: ['car parts', 'spare parts'],
    aliases: ['spare parts', 'car parts', 'parts', ar('\u0642\u0637\u0639'), ar('\u0642\u0637\u0639 \u0633\u064a\u0627\u0631\u0627\u062a'), ar('\u0642\u0637\u0639 \u063a\u064a\u0627\u0631')],
  },
  {
    id: 'hotel',
    labelAr: ar('\u0641\u0646\u062f\u0642'),
    labelEn: 'hotel',
    searchQueries: ['hotel'],
    aliases: ['hotel', 'hostel', ar('\u0641\u0646\u062f\u0642'), ar('\u0641\u0646\u0627\u062f\u0642'), ar('\u0646\u0632\u0644')],
  },
  {
    id: 'mosque',
    labelAr: ar('\u0645\u0633\u062c\u062f'),
    labelEn: 'mosque',
    searchQueries: ['mosque'],
    aliases: ['mosque', 'masjid', ar('\u0645\u0633\u062c\u062f'), ar('\u0645\u0633\u0627\u062c\u062f'), ar('\u062c\u0627\u0645\u0639')],
  },
  {
    id: 'church',
    labelAr: ar('\u0643\u0646\u064a\u0633\u0629'),
    labelEn: 'church',
    searchQueries: ['church'],
    aliases: ['church', ar('\u0643\u0646\u064a\u0633\u0629'), ar('\u0643\u0646\u0627\u0626\u0633')],
  },
  {
    id: 'toilets',
    labelAr: ar('\u062d\u0645\u0627\u0645\u0627\u062a'),
    labelEn: 'toilets',
    searchQueries: ['toilets', 'restroom'],
    aliases: ['toilet', 'toilets', 'restroom', 'bathroom', 'wc', ar('\u062d\u0645\u0627\u0645'), ar('\u062d\u0645\u0627\u0645\u0627\u062a'), ar('\u0645\u0631\u062d\u0627\u0636')],
  },
  {
    id: 'parking',
    labelAr: ar('\u0645\u0648\u0642\u0641'),
    labelEn: 'parking',
    searchQueries: ['parking'],
    aliases: ['parking', 'car park', ar('\u0645\u0648\u0642\u0641'), ar('\u0645\u0648\u0627\u0642\u0641')],
  },
  {
    id: 'barber',
    labelAr: ar('\u062d\u0644\u0627\u0642'),
    labelEn: 'barber',
    searchQueries: ['barber'],
    aliases: ['barber', 'haircut', ar('\u062d\u0644\u0627\u0642'), ar('\u062d\u0644\u0627\u0642\u0629')],
  },
  {
    id: 'salon',
    labelAr: ar('\u0635\u0627\u0644\u0648\u0646'),
    labelEn: 'salon',
    searchQueries: ['salon', 'beauty salon'],
    aliases: ['salon', 'beauty salon', ar('\u0635\u0627\u0644\u0648\u0646'), ar('\u0643\u0648\u0627\u0641\u064a\u0631')],
  },
  {
    id: 'laundry',
    labelAr: ar('\u0645\u063a\u0633\u0644\u0629'),
    labelEn: 'laundry',
    searchQueries: ['laundry'],
    aliases: ['laundry', 'dry clean', ar('\u0645\u063a\u0633\u0644\u0629'), ar('\u063a\u0633\u064a\u0644 \u0645\u0644\u0627\u0628\u0633')],
  },
  {
    id: 'printing',
    labelAr: ar('\u0637\u0628\u0627\u0639\u0629'),
    labelEn: 'printing',
    searchQueries: ['printing', 'copy shop'],
    aliases: ['printing', 'print', 'copy shop', 'photocopy', ar('\u0637\u0628\u0627\u0639\u0629'), ar('\u062a\u0635\u0648\u064a\u0631'), ar('\u0646\u0633\u062e')],
  },
  {
    id: 'stationery',
    labelAr: ar('\u0645\u0643\u062a\u0628\u0629'),
    labelEn: 'stationery',
    searchQueries: ['stationery', 'bookshop'],
    aliases: ['stationery', 'bookshop', 'office supplies', ar('\u0645\u0643\u062a\u0628\u0629'), ar('\u0642\u0631\u0637\u0627\u0633\u064a\u0629'), ar('\u0627\u062f\u0648\u0627\u062a \u0645\u062f\u0631\u0633\u064a\u0629')],
  },
];

const CATEGORY_BY_ID = new Map(TRIP_NEED_CATEGORIES.map((category) => [category.id, category]));

export const getTripNeedCategory = (id: TripNeedCategoryId) => CATEGORY_BY_ID.get(id);

const semanticNeedQueries: { aliases: string[]; queries: string[] }[] = [
  {
    aliases: ['chocolate', 'candy', 'sweets', ar('\u0634\u0648\u0643\u0648\u0644\u0627\u062a\u0629'), ar('\u0634\u0643\u0648\u0644\u0627\u062a\u0629'), ar('\u062d\u0644\u0648\u064a\u0627\u062a'), ar('\u062d\u0644\u0648\u064a\u0627\u062a \u0634\u0631\u0642\u064a\u0629')],
    queries: ['supermarket', 'grocery', 'confectionery', 'sweets shop', 'chocolate'],
  },
  {
    aliases: ['medicine', 'medication', ar('\u062f\u0648\u0627\u0621'), ar('\u062f\u0648\u0627')],
    queries: ['pharmacy', 'drugstore'],
  },
  {
    aliases: ['bread', 'loaf', ar('\u062e\u0628\u0632')],
    queries: ['bakery', 'supermarket', 'grocery', 'bread'],
  },
  {
    aliases: ['juice', ar('\u0639\u0635\u064a\u0631')],
    queries: ['supermarket', 'grocery', 'cafe', 'juice'],
  },
  {
    aliases: ['milk', ar('\u062d\u0644\u064a\u0628')],
    queries: ['supermarket', 'grocery', 'milk'],
  },
  {
    aliases: ['chips', 'crisps', ar('\u0634\u0628\u0633'), ar('\u0634\u064a\u0628\u0633')],
    queries: ['supermarket', 'grocery', 'chips'],
  },
  {
    aliases: ['tissues', 'napkins', ar('\u0645\u0646\u0627\u062f\u064a\u0644'), ar('\u0645\u062d\u0627\u0631\u0645')],
    queries: ['supermarket', 'grocery', 'tissues'],
  },
  {
    aliases: ['coffee beans', 'roastery', 'coffee', ar('\u0645\u062d\u0627\u0645\u0635'), ar('\u0645\u062d\u0645\u0635\u0629'), ar('\u0642\u0647\u0648\u0629')],
    queries: ['roastery', 'coffee roaster', 'coffee shop', 'nuts shop', 'coffee'],
  },
  {
    aliases: ['nuts', ar('\u0645\u0643\u0633\u0631\u0627\u062a')],
    queries: ['roastery', 'nuts shop', 'supermarket', 'grocery', 'nuts'],
  },
  {
    aliases: ['flowers', 'flower', 'florist', ar('\u0648\u0631\u062f'), ar('\u0632\u0647\u0648\u0631')],
    queries: ['florist', 'flower shop', 'flowers'],
  },
  {
    aliases: ['household items', 'home goods', 'home supplies', ar('\u0623\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'), ar('\u0623\u063a\u0631\u0627\u0636 \u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0628\u064a\u062a')],
    queries: ['supermarket', 'home goods store', 'household items', 'grocery'],
  },
  {
    aliases: ['car battery', 'battery', ar('\u0628\u0637\u0627\u0631\u064a\u0629 \u0633\u064a\u0627\u0631\u0629'), ar('\u0628\u0637\u0627\u0631\u064a\u0629')],
    queries: ['auto parts', 'car parts', 'car repair', 'mechanic', 'car battery'],
  },
  {
    aliases: ['tires', 'tire', 'tyres', 'tyre', ar('\u0643\u0641\u0631\u0627\u062a'), ar('\u0625\u0637\u0627\u0631\u0627\u062a'), ar('\u0627\u0637\u0627\u0631\u0627\u062a')],
    queries: ['tire service', 'tyre service', 'tires'],
  },
];

const normalizedSemanticNeedQueries = semanticNeedQueries.map((entry) => ({
  aliases: entry.aliases.map(normalizeArabic),
  queries: entry.queries,
}));

function semanticQueriesForTerm(normalized: string) {
  const matches = normalizedSemanticNeedQueries
    .filter((entry) => entry.aliases.some((alias) => alias === normalized || normalized.includes(alias)))
    .flatMap((entry) => entry.queries);
  return [...new Set(matches)];
}

export function tripNeedCategoryMatchesTerm(category: TripNeedCategory, normalizedTerm: string) {
  return category.aliases.some((alias) => normalizeArabic(alias) === normalizedTerm);
}

export function parseTripNeeds(input: string): TripNeedCategory[] {
  const normalized = normalizeArabic(input);
  if (normalized.length < 2) return [];
  const withoutArabicConjunction = normalized.replace(/(^|\s)\u0648(?=\S{2,})/g, '$1');
  const padded = ` ${normalized} ${withoutArabicConjunction} `;
  return TRIP_NEED_CATEGORIES.filter((category) =>
    category.aliases.some((alias) => {
      const needle = normalizeArabic(alias);
      return needle.length > 1 && padded.includes(` ${needle} `);
    }),
  );
}

export function parseTripNeedFreeText(input: string, categories: TripNeedCategory[] = parseTripNeeds(input)): TripNeedFreeText[] {
  const rawParts = input
    .split(/[,،؛;،\n]+|\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const parts = rawParts.length ? rawParts : [input.trim()].filter((part) => part.length >= 2);
  const knownAliases = new Set(categories.flatMap((category) => category.aliases.map(normalizeArabic)));
  const seen = new Set<string>();
  return parts.flatMap((phrase): TripNeedFreeText[] => {
    const normalized = normalizeArabic(phrase);
    if (normalized.length < 2 || seen.has(normalized) || knownAliases.has(normalized)) return [];
    seen.add(normalized);
    return [{ id: `free:${normalized}`, phrase, normalized }];
  });
}

export function freeTextNeedCategories(terms: TripNeedFreeText[]): TripNeedCategory[] {
  return terms.map((term) => ({
    id: term.id,
    labelAr: term.phrase,
    labelEn: term.phrase,
    needKey: term.id,
    needLabelAr: term.phrase,
    needLabelEn: term.phrase,
    searchQueries: [...new Set([...(term.searchQueries ?? []), term.phrase])],
    aliases: [term.phrase],
  }));
}

export function parseTripNeedSemanticText(input: string, categories: TripNeedCategory[] = parseTripNeeds(input)): TripNeedFreeText[] {
  const rawParts = input
    .split(/[,،؛;\n+]+|\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const parts = rawParts.length ? rawParts : [input.trim()].filter((part) => part.length >= 2);
  const knownAliases = new Set(categories.flatMap((category) => category.aliases.map(normalizeArabic)));
  const seen = new Set<string>();
  return parts.flatMap((phrase): TripNeedFreeText[] => {
    const normalized = normalizeArabic(phrase);
    const inferredQueries = semanticQueriesForTerm(normalized);
    if (normalized.length < 2 || seen.has(normalized) || (knownAliases.has(normalized) && !inferredQueries.length)) return [];
    seen.add(normalized);
    return [{ id: `free:${normalized}`, phrase, normalized, searchQueries: inferredQueries }];
  });
}

export function formatNeedLabels(categories: TripNeedCategory[], locale: 'ar' | 'en') {
  return categories.map((category) => locale === 'ar' ? category.labelAr : category.labelEn);
}
