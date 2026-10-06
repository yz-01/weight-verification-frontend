/**
 * Which supplier a delivery note names (A5).
 *
 * OCR reads the supplier as printed - 「ABC Hardware Sdn. Bhd.」 - while the
 * supplier list has 「ABC HARDWARE SB」. The phone used to accept only the
 * exact same spelling, so the supplier was almost never filled in. Now the
 * names are compared without punctuation, case or the company-form suffix,
 * and the closest supplier is offered for the worker to confirm.
 *
 * Only an identical name after that clean-up counts as certain. Anything
 * merely close is a suggestion: picking the wrong supplier on a delivery is
 * worse than asking.
 */

export interface SupplierCandidate {
  id: string;
  name: string;
}

export interface SupplierMatch<T extends SupplierCandidate = SupplierCandidate> {
  supplier: T;
  /** 0-1: how alike the two cleaned-up names are. */
  score: number;
  /** The cleaned-up names are the same: safe to fill in without asking. */
  exact: boolean;
}

/** Below this, the closest supplier is not offered at all. */
export const SUPPLIER_MATCH_THRESHOLD = 0.75;

/**
 * Company-form words at the end of a Malaysian name, longest first so that
 * "sdn bhd" goes before "bhd". `m` is the "(M)" of "ABC (M) Sdn Bhd".
 */
const SUFFIXES = [
  "sdn bhd",
  "sendirian berhad",
  "berhad",
  "bhd",
  "sdn",
  "s b",
  "sb",
  "plt",
  "m",
];

/** `ABC (M) Sdn. Bhd.` -> `abc`, `Syarikat X & Y S/B` -> `syarikat x y`. */
export function normalizeSupplierName(name: string): string {
  let text = name
    .normalize("NFKC")
    .toLocaleLowerCase()
    // Anything that is not a letter or a digit (in any script) is a gap.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  let changed = true;
  while (changed && text) {
    changed = false;
    for (const suffix of SUFFIXES) {
      if (text === suffix) break;
      if (text.endsWith(` ${suffix}`)) {
        text = text.slice(0, -suffix.length - 1).trim();
        changed = true;
        break;
      }
    }
  }
  return text;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** How alike two names are once cleaned up, 0-1. Spaces do not count. */
export function supplierNameSimilarity(left: string, right: string): number {
  const a = normalizeSupplierName(left).replace(/ /g, "");
  const b = normalizeSupplierName(right).replace(/ /g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  // "ABC Hardware" against "ABC Hardware Trading": one name is the whole
  // other one plus a word. Counted as close, but never as the same.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const contained = shorter.length >= 4 && longer.includes(shorter) ? 0.85 : 0;
  return Math.max(edit, contained);
}

/** The supplier the read name is closest to, or null when none is close enough. */
export function matchSupplier<T extends SupplierCandidate>(
  readName: string | undefined | null,
  suppliers: readonly T[],
  threshold: number = SUPPLIER_MATCH_THRESHOLD,
): SupplierMatch<T> | null {
  if (!readName || !normalizeSupplierName(readName)) return null;
  let best: SupplierMatch<T> | null = null;
  for (const supplier of suppliers) {
    const score = supplierNameSimilarity(readName, supplier.name);
    if (score > (best?.score ?? 0)) {
      best = { supplier, score, exact: score === 1 };
    }
  }
  return best && best.score >= threshold ? best : null;
}
