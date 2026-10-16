/**
 * Arabic text helpers, ported from the Wusool project. Run `normalizeArabic`
 * before ANY comparison: people write the same place with and without hamza,
 * taa marbuta, diacritics and joined name prefixes.
 */

/** Diacritics, Quranic marks and tatweel. */
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/**
 * Name prefixes written both joined and separated (عبد الله / عبدالله). Joining
 * the prefix to the next word makes both spellings converge on one form.
 */
const JOIN_PREFIX = /(^|\s)(عبد|ابو|ام|ابن|بن)\s+(?=\S)/g;

export function normalizeArabic(input: string): string {
  if (!input) return '';
  return (
    input
      .replace(TASHKEEL, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      // Arabic punctuation first, then anything that is not a letter or digit.
      // (Explicit ranges rather than \p{L}, which not every JS engine supports.)
      .replace(/[،؛؟]/g, ' ')
      .replace(/[^ء-يa-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(JOIN_PREFIX, '$1$2')
  );
}

/** Bounded Levenshtein — returns max + 1 once the distance is certain to exceed max. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Jaccard overlap of the two word sets, 0..1. */
export function tokenSetOverlap(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const token of A) if (B.has(token)) shared++;
  return shared / new Set([...A, ...B]).size;
}
