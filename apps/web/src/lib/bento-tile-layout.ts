import type { ColSpan, RowSpan } from "@/lib/dashboard-layout";

export type BentoSize = {
  col: ColSpan;
  row: RowSpan;
};

export type BentoLayoutRule<V extends string> = {
  minCol?: ColSpan;
  maxCol?: ColSpan;
  minRow?: RowSpan;
  maxRow?: RowSpan;
  variant: V;
};

export const bentoSizeKey = (size: BentoSize): string => `${size.col}x${size.row}`;

const ruleMatches = <V extends string>(rule: BentoLayoutRule<V>, size: BentoSize): boolean => {
  if (rule.minCol != null && size.col < rule.minCol) {
    return false;
  }
  if (rule.maxCol != null && size.col > rule.maxCol) {
    return false;
  }
  if (rule.minRow != null && size.row < rule.minRow) {
    return false;
  }
  if (rule.maxRow != null && size.row > rule.maxRow) {
    return false;
  }
  return true;
};

const ruleScore = <V extends string>(rule: BentoLayoutRule<V>): number =>
  (rule.minCol ?? 0) * 100 + (rule.maxCol != null ? 12 - rule.maxCol : 0) * 10 + (rule.minRow ?? 0);

/** Pick a curated layout variant from exact size keys, then best-matching rule, then fallback. */
export const pickBentoLayout = <V extends string>(
  exact: Partial<Record<string, V>>,
  rules: readonly BentoLayoutRule<V>[],
  size: BentoSize,
  fallback: V,
): V => {
  const keyed = exact[bentoSizeKey(size)];
  if (keyed) {
    return keyed;
  }

  let best: V | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!ruleMatches(rule, size)) {
      continue;
    }
    const score = ruleScore(rule);
    if (score > bestScore) {
      bestScore = score;
      best = rule.variant;
    }
  }
  return best ?? fallback;
};
