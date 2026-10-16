import type { Landmark } from '@/types';
import { levenshtein, normalizeArabic, tokenSetOverlap } from './arabic';

/**
 * Finds the landmark in a search like "قرب دوار المنارة", "جنب السينما
 * القديمة" or "near the clock circle" — how people in Palestine actually give
 * directions. Relation words are dropped, then names and aliases are compared
 * on normalised text, the same way Wusool matches landmarks.
 */

const FILLER = new Set(
  [
    'قرب', 'قريب', 'جنب', 'جانب', 'بجانب', 'بجنب', 'عند', 'مقابل', 'قبال', 'خلف', 'ورا',
    'وراء', 'حد', 'بالقرب', 'من', 'في', 'near', 'next', 'to', 'behind', 'opposite', 'by',
    'at', 'the', 'close', 'around', 'in', 'al', 'el',
  ].map(normalizeArabic),
);

/** City names on their own are too broad to pin a landmark on. */
const TOO_BROAD = new Set(
  ['رام الله', 'البيرة', 'بيرة', 'ramallah', 'bireh', 'al bireh'].map(normalizeArabic),
);

function prepare(text: string): string {
  return normalizeArabic(text)
    .split(' ')
    .filter((token) => token && !FILLER.has(token))
    .map((token) => token.replace(/^ال(?=\S{2,})/, ''))
    .join(' ');
}

export interface LandmarkMatch {
  landmark: Landmark;
  /** 0..1 — how confident the match is. */
  score: number;
}

export function findLandmark(query: string, landmarks: Landmark[]): LandmarkMatch | undefined {
  if (TOO_BROAD.has(normalizeArabic(query))) return undefined;
  const q = prepare(query);
  if (q.length < 3 || TOO_BROAD.has(q)) return undefined;

  let best: LandmarkMatch | undefined;
  for (const landmark of landmarks) {
    for (const name of [landmark.nameAr, landmark.nameEn, ...(landmark.aliases ?? [])]) {
      const n = prepare(name);
      if (!n) continue;

      let score = 0;
      if (n === q) score = 1;
      else if (n.length >= 4 && q.includes(n)) score = 0.9;
      else if (q.length >= 4 && n.includes(q)) score = 0.8;
      else {
        const overlap = tokenSetOverlap(q, n);
        if (overlap >= 0.5) score = 0.6 + overlap * 0.2;
        else if (q.length >= 5 && levenshtein(q, n, 2) <= 2) score = 0.65;
      }

      if (score >= 0.6 && score > (best?.score ?? 0)) best = { landmark, score };
    }
  }
  return best;
}
