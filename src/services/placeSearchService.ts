import type { GeoPoint } from '@/types';
import { LANDMARKS, RAMALLAH_CENTER } from '@/data/mapDefaults';
import { levenshtein, normalizeArabic, tokenSetOverlap } from '@/utils/arabic';
import { distanceMeters } from '@/utils/geo';

export interface PlaceSuggestion {
  id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  category?: string;
  address?: string;
  location: GeoPoint;
  source: 'nominatim' | 'osm' | 'landmark';
}

type OsmKey = 'amenity' | 'shop' | 'tourism' | 'leisure' | 'office';
type OsmTag = { key: OsmKey; value: string };
type CategoryDefinition = {
  id: string;
  labelAr: string;
  labelEn: string;
  aliases: string[];
  tags: OsmTag[];
};

export interface PlaceSearchOptions {
  limit?: number;
  center?: GeoPoint;
  radiusMeters?: number;
}

const DEFAULT_RADIUS_METERS = 14_000;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: 'bakery',
    labelAr: '\u0645\u062e\u0628\u0632',
    labelEn: 'Bakery',
    aliases: ['bakery', 'bakeries', 'bread', 'khubz', '\u0645\u062e\u0628\u0632', '\u0645\u062e\u0627\u0628\u0632', '\u062e\u0628\u0632', '\u0641\u0631\u0646'],
    tags: [{ key: 'shop', value: 'bakery' }],
  },
  {
    id: 'restaurant',
    labelAr: 'مطعم',
    labelEn: 'Restaurant',
    aliases: ['restaurant', 'restaurants', 'rest', 'food', 'eat', 'dining', 'مطعم', 'مطاعم', 'اكل', 'أكل'],
    tags: [{ key: 'amenity', value: 'restaurant' }, { key: 'amenity', value: 'fast_food' }],
  },
  {
    id: 'cafe',
    labelAr: 'مقهى',
    labelEn: 'Cafe',
    aliases: ['cafe', 'coffee', 'coffee shop', 'قهوة', 'كافيه', 'مقهى', 'مقاهي'],
    tags: [{ key: 'amenity', value: 'cafe' }],
  },
  {
    id: 'hotel',
    labelAr: 'فندق',
    labelEn: 'Hotel',
    aliases: ['hotel', 'hotels', 'hostel', 'guest house', 'فندق', 'فنادق', 'نزل'],
    tags: [{ key: 'tourism', value: 'hotel' }, { key: 'tourism', value: 'guest_house' }, { key: 'tourism', value: 'hostel' }],
  },
  {
    id: 'hospital',
    labelAr: 'مستشفى',
    labelEn: 'Hospital',
    aliases: ['hospital', 'hospitals', 'medical', 'clinic', 'مستشفى', 'مستشفيات', 'عيادة', 'طوارئ'],
    tags: [{ key: 'amenity', value: 'hospital' }, { key: 'amenity', value: 'clinic' }, { key: 'amenity', value: 'doctors' }],
  },
  {
    id: 'pharmacy',
    labelAr: 'صيدلية',
    labelEn: 'Pharmacy',
    aliases: ['pharmacy', 'pharmacies', 'drugstore', 'صيدلية', 'صيدليات'],
    tags: [{ key: 'amenity', value: 'pharmacy' }],
  },
  {
    id: 'supermarket',
    labelAr: 'سوبرماركت',
    labelEn: 'Supermarket',
    aliases: ['supermarket', 'grocery', 'market', 'سوبرماركت', 'بقالة', 'تموينات'],
    tags: [{ key: 'shop', value: 'supermarket' }, { key: 'shop', value: 'convenience' }],
  },
  {
    id: 'mall',
    labelAr: 'مول',
    labelEn: 'Mall',
    aliases: ['mall', 'shopping mall', 'shopping', 'مول', 'مركز تجاري', 'سوق'],
    tags: [{ key: 'shop', value: 'mall' }],
  },
  {
    id: 'university',
    labelAr: 'جامعة',
    labelEn: 'University',
    aliases: ['university', 'college', 'جامعة', 'جامعات', 'كلية'],
    tags: [{ key: 'amenity', value: 'university' }, { key: 'amenity', value: 'college' }],
  },
  {
    id: 'school',
    labelAr: 'مدرسة',
    labelEn: 'School',
    aliases: ['school', 'schools', 'kindergarten', 'مدرسة', 'مدارس', 'روضة'],
    tags: [{ key: 'amenity', value: 'school' }, { key: 'amenity', value: 'kindergarten' }],
  },
  {
    id: 'fuel',
    labelAr: 'محطة وقود',
    labelEn: 'Gas station',
    aliases: ['gas station', 'fuel', 'petrol station', 'محطة وقود', 'بنزين', 'محروقات'],
    tags: [{ key: 'amenity', value: 'fuel' }],
  },
  {
    id: 'bank',
    labelAr: 'بنك',
    labelEn: 'Bank',
    aliases: ['bank', 'banks', 'بنك', 'بنوك'],
    tags: [{ key: 'amenity', value: 'bank' }],
  },
  {
    id: 'atm',
    labelAr: 'صراف آلي',
    labelEn: 'ATM',
    aliases: ['atm', 'cash machine', 'صراف', 'صراف آلي', 'صراف الي'],
    tags: [{ key: 'amenity', value: 'atm' }],
  },
  {
    id: 'government',
    labelAr: 'دائرة حكومية',
    labelEn: 'Government office',
    aliases: ['government office', 'government', 'municipality', 'ministry', 'دائرة حكومية', 'حكومي', 'وزارة', 'بلدية'],
    tags: [{ key: 'office', value: 'government' }, { key: 'amenity', value: 'townhall' }, { key: 'amenity', value: 'courthouse' }],
  },
  {
    id: 'post_office',
    labelAr: '\u0628\u0631\u064a\u062f',
    labelEn: 'Post office',
    aliases: ['post office', 'post', 'mail', '\u0628\u0631\u064a\u062f', '\u0645\u0643\u062a\u0628 \u0628\u0631\u064a\u062f'],
    tags: [{ key: 'amenity', value: 'post_office' }],
  },
  {
    id: 'exchange',
    labelAr: '\u0635\u0631\u0627\u0641\u0629',
    labelEn: 'Exchange',
    aliases: ['exchange', 'currency exchange', 'money exchange', '\u0635\u0631\u0627\u0641\u0629', '\u062a\u0628\u062f\u064a\u0644 \u0639\u0645\u0644\u0629'],
    tags: [{ key: 'amenity', value: 'bureau_de_change' }],
  },
  {
    id: 'clothes',
    labelAr: '\u0645\u0644\u0627\u0628\u0633',
    labelEn: 'Clothes',
    aliases: ['clothes', 'clothing', 'clothing store', 'fashion', '\u0645\u0644\u0627\u0628\u0633', '\u0627\u0648\u0627\u0639\u064a', '\u0623\u0648\u0627\u0639\u064a'],
    tags: [{ key: 'shop', value: 'clothes' }],
  },
  {
    id: 'shoes',
    labelAr: '\u0623\u062d\u0630\u064a\u0629',
    labelEn: 'Shoes',
    aliases: ['shoes', 'shoe store', '\u0623\u062d\u0630\u064a\u0629', '\u0627\u062d\u0630\u064a\u0629', '\u0643\u0646\u0627\u062f\u0631'],
    tags: [{ key: 'shop', value: 'shoes' }],
  },
  {
    id: 'electronics',
    labelAr: '\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a',
    labelEn: 'Electronics',
    aliases: ['electronics', 'electrical', '\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a', '\u0627\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0627\u062a'],
    tags: [{ key: 'shop', value: 'electronics' }, { key: 'shop', value: 'electrical' }],
  },
  {
    id: 'mobile_shop',
    labelAr: '\u0645\u062d\u0644 \u0645\u0648\u0628\u0627\u064a\u0644',
    labelEn: 'Mobile shop',
    aliases: ['mobile shop', 'phone shop', 'cell phone', 'mobile', '\u0645\u0648\u0628\u0627\u064a\u0644', '\u062c\u0648\u0627\u0644', '\u062e\u0644\u0648\u064a'],
    tags: [{ key: 'shop', value: 'mobile_phone' }],
  },
  {
    id: 'park',
    labelAr: 'حديقة',
    labelEn: 'Park',
    aliases: ['park', 'garden', 'حديقة', 'حدائق', 'منتزه'],
    tags: [{ key: 'leisure', value: 'park' }, { key: 'leisure', value: 'garden' }],
  },
  {
    id: 'playground',
    labelAr: '\u0645\u0644\u0639\u0628 \u0623\u0637\u0641\u0627\u0644',
    labelEn: 'Playground',
    aliases: ['playground', 'kids playground', '\u0645\u0644\u0639\u0628', '\u0645\u0644\u0627\u0639\u0628', '\u0623\u0644\u0639\u0627\u0628 \u0623\u0637\u0641\u0627\u0644'],
    tags: [{ key: 'leisure', value: 'playground' }],
  },
  {
    id: 'amusement',
    labelAr: '\u0645\u0644\u0627\u0647\u064a',
    labelEn: 'Amusement',
    aliases: ['amusement', 'theme park', 'kids amusement', '\u0645\u0644\u0627\u0647\u064a', '\u0645\u0644\u0627\u0647\u064a \u0644\u0644\u0627\u0637\u0641\u0627\u0644'],
    tags: [{ key: 'tourism', value: 'theme_park' }, { key: 'leisure', value: 'amusement_arcade' }],
  },
  {
    id: 'laboratory',
    labelAr: '\u0645\u062e\u062a\u0628\u0631',
    labelEn: 'Laboratory',
    aliases: ['lab', 'laboratory', 'medical lab', 'blood test', '\u0645\u062e\u062a\u0628\u0631', '\u0645\u062e\u062a\u0628\u0631\u0627\u062a', '\u062a\u062d\u0627\u0644\u064a\u0644'],
    tags: [{ key: 'amenity', value: 'laboratory' }],
  },
  {
    id: 'mosque',
    labelAr: '\u0645\u0633\u062c\u062f',
    labelEn: 'Mosque',
    aliases: ['mosque', 'masjid', '\u0645\u0633\u062c\u062f', '\u0645\u0633\u0627\u062c\u062f', '\u062c\u0627\u0645\u0639'],
    tags: [{ key: 'amenity', value: 'place_of_worship' }],
  },
  {
    id: 'church',
    labelAr: '\u0643\u0646\u064a\u0633\u0629',
    labelEn: 'Church',
    aliases: ['church', '\u0643\u0646\u064a\u0633\u0629', '\u0643\u0646\u0627\u0626\u0633'],
    tags: [{ key: 'amenity', value: 'place_of_worship' }],
  },
  {
    id: 'toilets',
    labelAr: '\u062d\u0645\u0627\u0645\u0627\u062a',
    labelEn: 'Toilets',
    aliases: ['toilet', 'toilets', 'restroom', 'bathroom', 'wc', '\u062d\u0645\u0627\u0645', '\u062d\u0645\u0627\u0645\u0627\u062a', '\u0645\u0631\u062d\u0627\u0636'],
    tags: [{ key: 'amenity', value: 'toilets' }],
  },
  {
    id: 'barber',
    labelAr: '\u062d\u0644\u0627\u0642',
    labelEn: 'Barber',
    aliases: ['barber', 'haircut', '\u062d\u0644\u0627\u0642', '\u062d\u0644\u0627\u0642\u0629'],
    tags: [{ key: 'shop', value: 'hairdresser' }],
  },
  {
    id: 'salon',
    labelAr: '\u0635\u0627\u0644\u0648\u0646',
    labelEn: 'Salon',
    aliases: ['salon', 'beauty salon', '\u0635\u0627\u0644\u0648\u0646', '\u0643\u0648\u0627\u0641\u064a\u0631'],
    tags: [{ key: 'shop', value: 'beauty' }, { key: 'shop', value: 'hairdresser' }],
  },
  {
    id: 'laundry',
    labelAr: '\u0645\u063a\u0633\u0644\u0629',
    labelEn: 'Laundry',
    aliases: ['laundry', 'dry clean', '\u0645\u063a\u0633\u0644\u0629', '\u063a\u0633\u064a\u0644 \u0645\u0644\u0627\u0628\u0633'],
    tags: [{ key: 'shop', value: 'laundry' }, { key: 'shop', value: 'dry_cleaning' }],
  },
  {
    id: 'printing',
    labelAr: '\u0637\u0628\u0627\u0639\u0629',
    labelEn: 'Printing',
    aliases: ['printing', 'print', 'copy shop', 'photocopy', '\u0637\u0628\u0627\u0639\u0629', '\u062a\u0635\u0648\u064a\u0631', '\u0646\u0633\u062e'],
    tags: [{ key: 'shop', value: 'copyshop' }],
  },
  {
    id: 'stationery',
    labelAr: '\u0645\u0643\u062a\u0628\u0629',
    labelEn: 'Stationery',
    aliases: ['stationery', 'bookshop', 'office supplies', '\u0645\u0643\u062a\u0628\u0629', '\u0642\u0631\u0637\u0627\u0633\u064a\u0629'],
    tags: [{ key: 'shop', value: 'stationery' }, { key: 'shop', value: 'books' }],
  },
  {
    id: 'parking',
    labelAr: 'موقف سيارات',
    labelEn: 'Parking',
    aliases: ['parking', 'car park', 'موقف', 'مواقف', 'موقف سيارات', 'مواقف سيارات'],
    tags: [{ key: 'amenity', value: 'parking' }],
  },
  {
    id: 'car_service',
    labelAr: 'خدمة سيارات',
    labelEn: 'Car service',
    aliases: ['car service', 'car repair', 'mechanic', 'garage', 'car wash', 'خدمة سيارات', 'تصليح سيارات', 'ميكانيكي', 'كراج', 'غسيل سيارات'],
    tags: [{ key: 'shop', value: 'car_repair' }, { key: 'shop', value: 'car' }, { key: 'shop', value: 'car_parts' }, { key: 'amenity', value: 'car_wash' }],
  },
  {
    id: 'car_parts',
    labelAr: '\u0642\u0637\u0639 \u0633\u064a\u0627\u0631\u0627\u062a',
    labelEn: 'Car parts',
    aliases: ['car parts', 'spare parts', 'parts', '\u0642\u0637\u0639', '\u0642\u0637\u0639 \u0633\u064a\u0627\u0631\u0627\u062a', '\u0642\u0637\u0639 \u063a\u064a\u0627\u0631'],
    tags: [{ key: 'shop', value: 'car_parts' }],
  },
];

const CATEGORY_BY_ALIAS = new Map<string, CategoryDefinition>();
for (const category of CATEGORY_DEFINITIONS) {
  for (const alias of category.aliases) CATEGORY_BY_ALIAS.set(normalizeArabic(alias), category);
}

const COMMON_LOCAL_ALIASES: Record<string, string[]> = {
  lm_manara: ['manara', 'al manara', 'el manara', 'dowar manara', 'manara square'],
  lm_second_circle: ['second circle', '2nd circle', 'dowar tani', 'dowar al tani'],
  lm_clock_circle: ['clock', 'clock circle', 'dowar al saa', 'sa3a', 'saa circle'],
  lm_quds_cinema: ['quds cinema', 'old cinema', 'cinema al quds'],
  lm_central_market: ['hasba', 'hisbeh', 'central market', 'vegetable market'],
  lm_bireh_station: ['bireh station', 'al bireh station', 'el bireh station', 'bireh bus station'],
  lm_municipality: ['baladiya', 'municipality', 'ramallah municipality'],
  lm_gov_hospital: ['government hospital', 'ramallah hospital', 'ramallah governmental hospital'],
  lm_pmc: ['pmc', 'palestine medical complex', 'medical complex'],
  lm_birzeit_uni: ['birzeit', 'birzeit university', 'berzeit'],
  lm_friends: ['friends', 'friends school', 'frends'],
  lm_bravo: ['bravo', 'bravo supermarket'],
  lm_kasaba: ['kasaba', 'qasaba', 'al kasaba'],
  lm_aqsa_bakery: ['aqsa bakery', 'al aqsa bakery'],
  lm_natsheh: ['natsheh', 'natsha building', 'natsheh building'],
  lm_zeitouna: ['zeitouna', 'zeituna', 'zeitouna building'],
  lm_trade_tower: ['palestine trade tower', 'trade tower'],
};

const labelOf = (item: Record<string, unknown>) =>
  String(item.name || item.display_name || '').split(',')[0]?.trim() || 'Place';

const titleCase = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const categoryLabel = (key?: string, value?: string): string | undefined => {
  if (!value) return undefined;
  const category = CATEGORY_DEFINITIONS.find((item) =>
    item.tags.some((tag) => tag.key === key && tag.value === value)
  );
  return category?.labelEn ?? titleCase(value);
};

const categoryOf = (item: Record<string, unknown>) =>
  categoryLabel(String(item.category || item.class || ''), String(item.type || '')) ??
  String(item.type || item.class || '').replace(/_/g, ' ');

const normalizeQuery = (query: string) => normalizeArabic(query);

const COMMAND_PREFIX =
  /^\s*(?:(?:بدي|بدنا|أريد|اريد|أبي|ابي|عايز|عاوز)\s*)?(?:(?:أروح|اروح|نروح|روح|أذهب|اذهب|نذهب|وديني|خذني)\s*)?(?:(?:على|إلى|الى|لـ|ل|ع)\s*)?/u;
const ENGLISH_PREFIX = /^\s*(?:i want to go to|i want to|take me to|navigate to|go to|drive to|directions to)\s+/i;

const searchableQuery = (query: string) => {
  const trimmed = query.trim();
  const stripped = trimmed.replace(ENGLISH_PREFIX, '').replace(COMMAND_PREFIX, '').trim();
  return stripped.length >= 2 ? stripped : trimmed;
};

const stripArabicArticle = (text: string) =>
  text
    .split(' ')
    .map((token) => token.replace(/^ال(?=\S{2,})/, ''))
    .join(' ');

const comparableForms = (value: string): string[] => {
  const normalized = normalizeQuery(value);
  const withoutArticle = stripArabicArticle(normalized);
  return Array.from(new Set([normalized, withoutArticle].filter((item) => item.length > 0)));
};

const matchScore = (query: string, candidate: string): number => {
  let best = 0;
  for (const q of comparableForms(query)) {
    for (const name of comparableForms(candidate)) {
      if (q === name) best = Math.max(best, 1);
      else if (name.length >= 3 && q.includes(name)) best = Math.max(best, 0.9);
      else if (q.length >= 3 && name.includes(q)) best = Math.max(best, 0.82);
      else {
        const overlap = tokenSetOverlap(q, name);
        if (overlap >= 0.5) best = Math.max(best, 0.6 + overlap * 0.2);
        if (q.length >= 5 && levenshtein(q, name, 2) <= 2) best = Math.max(best, 0.66);
      }
    }
  }
  return best;
};

function landmarkSuggestions(query: string): PlaceSuggestion[] {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  return LANDMARKS
    .flatMap((landmark): PlaceSuggestion[] => {
      const names = [
        landmark.nameEn,
        landmark.nameAr,
        ...(landmark.aliases ?? []),
        ...(COMMON_LOCAL_ALIASES[landmark.id] ?? []),
      ];
      const score = Math.max(...names.map((name) => matchScore(q, name)));
      if (score < 0.6) return [];
      return [{
        id: `landmark:${landmark.id}`,
        name: landmark.nameEn,
        nameAr: landmark.nameAr,
        nameEn: landmark.nameEn,
        category: landmark.kind,
        address: 'Ramallah',
        location: landmark.location,
        source: 'landmark',
      }];
    })
    .sort((a, b) => distanceMeters(a.location, RAMALLAH_CENTER) - distanceMeters(b.location, RAMALLAH_CENTER));
}

const viewboxAround = (center: GeoPoint, radiusMeters: number) => {
  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / (111_320 * Math.max(0.25, Math.cos(center.latitude * Math.PI / 180)));
  const west = center.longitude - lonDelta;
  const east = center.longitude + lonDelta;
  const north = center.latitude + latDelta;
  const south = center.latitude - latDelta;
  return `${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)},${south.toFixed(5)}`;
};

const categoryForQuery = (query: string): CategoryDefinition | undefined => {
  const normalized = normalizeQuery(query);
  return CATEGORY_BY_ALIAS.get(normalized);
};

const addressOf = (address: Record<string, unknown> | undefined, fallback?: unknown) => {
  const area = [
    address?.road,
    address?.suburb || address?.neighbourhood || address?.residential,
    address?.city || address?.town || address?.village || 'Ramallah',
  ]
    .filter(Boolean)
    .map(String)
    .join(', ');
  return area || String(fallback ?? '');
};

async function fetchNominatim(url: URL): Promise<Record<string, unknown>[]> {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ar,en',
    },
  });
  if (!response.ok) return [];
  return await response.json() as Record<string, unknown>[];
}

function fromNominatim(item: Record<string, unknown>): PlaceSuggestion | undefined {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const address = item.address as Record<string, unknown> | undefined;
  const names = item.namedetails as Record<string, unknown> | undefined;
  const nameAr = String(names?.['name:ar'] || '').trim() || undefined;
  const nameEn = String(names?.['name:en'] || names?.name || item.name || '').trim() || undefined;
  return {
    id: `nominatim:${item.place_id}`,
    name: labelOf(item),
    nameAr,
    nameEn,
    category: categoryOf(item),
    address: addressOf(address, item.display_name),
    location: { latitude, longitude },
    source: 'nominatim',
  };
}

async function searchNominatimByName(query: string, center: GeoPoint, radiusMeters: number, limit: number) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('countrycodes', 'ps');
  url.searchParams.set('viewbox', viewboxAround(center, radiusMeters));
  url.searchParams.set('bounded', '0');
  url.searchParams.set('dedupe', '1');
  const json = await fetchNominatim(url);
  return json.map(fromNominatim).filter((item): item is PlaceSuggestion => Boolean(item));
}

async function searchNominatimAmenity(category: CategoryDefinition, center: GeoPoint, radiusMeters: number, limit: number) {
  const amenityTags = category.tags.filter((tag) => tag.key === 'amenity');
  const results = await Promise.all(amenityTags.map(async (tag) => {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('amenity', tag.value);
    url.searchParams.set('city', 'Ramallah');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('countrycodes', 'ps');
    url.searchParams.set('viewbox', viewboxAround(center, radiusMeters));
    url.searchParams.set('bounded', '0');
    url.searchParams.set('dedupe', '1');
    const json = await fetchNominatim(url);
    return json.filter((item) => item.category === tag.key && item.type === tag.value);
  }));
  return results.flat().map(fromNominatim).filter((item): item is PlaceSuggestion => Boolean(item));
}

const tagMatches = (item: Record<string, unknown>, category: CategoryDefinition) =>
  category.tags.some((tag) => item.category === tag.key && item.type === tag.value);

const tagPhrase = (tag: OsmTag) => tag.value.replace(/_/g, ' ');

async function searchNominatimCategoryPhrase(category: CategoryDefinition, center: GeoPoint, radiusMeters: number, limit: number) {
  const phrases = [
    ...category.tags.map((tag) => `[${tagPhrase(tag)}] Ramallah`),
    `${category.labelEn} Ramallah`,
    `${category.labelAr} رام الله`,
  ];
  const results = await Promise.all(Array.from(new Set(phrases)).map(async (phrase) => {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', phrase);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('countrycodes', 'ps');
    url.searchParams.set('viewbox', viewboxAround(center, radiusMeters));
    url.searchParams.set('bounded', '0');
    url.searchParams.set('dedupe', '1');
    return fetchNominatim(url);
  }));
  return results
    .flat()
    .filter((item) => tagMatches(item, category))
    .map(fromNominatim)
    .filter((item): item is PlaceSuggestion => Boolean(item));
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const overpassName = (tags: Record<string, string> | undefined, category: CategoryDefinition) =>
  tags?.['name:en'] || tags?.['name:ar'] || tags?.name || tags?.brand || tags?.operator || category.labelEn;

const overpassAddress = (tags: Record<string, string> | undefined) =>
  [
    tags?.['addr:street'],
    tags?.['addr:housenumber'],
    tags?.['addr:city'] || tags?.['addr:suburb'] || 'Ramallah',
  ].filter(Boolean).join(', ');

function fromOverpass(element: OverpassElement, category: CategoryDefinition): PlaceSuggestion | undefined {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  const tag = category.tags.find((item) => element.tags?.[item.key] === item.value);
  const nameAr = element.tags?.['name:ar'];
  const nameEn = element.tags?.['name:en'];
  return {
    id: `osm:${element.type}:${element.id}`,
    name: overpassName(element.tags, category),
    nameAr,
    nameEn,
    category: categoryLabel(tag?.key, tag?.value) ?? category.labelEn,
    address: overpassAddress(element.tags),
    location: { latitude, longitude },
    source: 'osm',
  };
}

async function searchOverpassCategory(category: CategoryDefinition, center: GeoPoint, radiusMeters: number, limit: number) {
  const selectors = category.tags.flatMap((tag) => [
    `node(around:${radiusMeters},${center.latitude},${center.longitude})["${tag.key}"="${tag.value}"]`,
    `way(around:${radiusMeters},${center.latitude},${center.longitude})["${tag.key}"="${tag.value}"]`,
    `relation(around:${radiusMeters},${center.latitude},${center.longitude})["${tag.key}"="${tag.value}"]`,
  ]);
  const query = `[out:json][timeout:12];(${selectors.join(';')};);out center tags ${Math.max(limit * 4, 30)};`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const json = await response.json() as { elements?: OverpassElement[] };
      return (json.elements ?? [])
        .map((item) => fromOverpass(item, category))
        .filter((item): item is PlaceSuggestion => Boolean(item));
    } catch {
      // Try the next public Overpass endpoint.
    } finally {
      clearTimeout(timeout);
    }
  }
  return [];
}

const ranked = (items: PlaceSuggestion[], query: string, center: GeoPoint, category?: CategoryDefinition) =>
  items.sort((a, b) => {
    const categoryBoostA = category && a.category === category.labelEn ? 1 : 0;
    const categoryBoostB = category && b.category === category.labelEn ? 1 : 0;
    const scoreA = Math.max(matchScore(query, a.name), matchScore(query, a.nameAr ?? ''), matchScore(query, a.nameEn ?? ''));
    const scoreB = Math.max(matchScore(query, b.name), matchScore(query, b.nameAr ?? ''), matchScore(query, b.nameEn ?? ''));
    return (
      categoryBoostB - categoryBoostA ||
      scoreB - scoreA ||
      distanceMeters(a.location, center) - distanceMeters(b.location, center)
    );
  });

function unique(items: PlaceSuggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalizeQuery(item.name)}:${item.location.latitude.toFixed(4)},${item.location.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchPlaces(query: string, options: PlaceSearchOptions | number = {}): Promise<PlaceSuggestion[]> {
  const limit = typeof options === 'number' ? options : options.limit ?? 7;
  const center = typeof options === 'number' ? RAMALLAH_CENTER : options.center ?? RAMALLAH_CENTER;
  const radiusMeters = typeof options === 'number' ? DEFAULT_RADIUS_METERS : options.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const trimmed = searchableQuery(query);
  if (trimmed.length < 2) return [];
  const local = landmarkSuggestions(trimmed);
  const category = categoryForQuery(trimmed);
  try {
    const remote = category
      ? [
        ...(await searchNominatimAmenity(category, center, radiusMeters, limit)),
        ...(await searchNominatimCategoryPhrase(category, center, radiusMeters, limit)),
        ...(await searchOverpassCategory(category, center, radiusMeters, limit)),
      ]
      : await searchNominatimByName(trimmed, center, radiusMeters, limit * 2);
    return unique(ranked([...remote, ...local], trimmed, center, category)).slice(0, limit);
  } catch {
    return local.slice(0, limit);
  }
}
