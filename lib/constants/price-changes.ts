// Feature 012: pencere kaldırıldı; yerine minimum zam % chip preset'leri.
export const MIN_CHANGE_PRESETS = [0, 0.05, 0.10, 0.25, 0.50] as const;
export const DEFAULT_MIN_CHANGE_PCT = 0;

export const SORT_OPTIONS = [
  "last_ordered_desc",
  "last_ordered_asc",
  "change_pct",
  "change_amount",
  "days_since",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: SortOption = "last_ordered_desc";

export const PRICE_CHANGES_PAGE_SIZE = 20;
