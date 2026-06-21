// Feature 012: pencere kaldırıldı; yerine minimum zam % chip preset'leri.
export const MIN_CHANGE_PRESETS = [0, 0.05, 0.10, 0.25, 0.50] as const;
export const DEFAULT_MIN_CHANGE_PCT = 0;

export const SORT_OPTIONS = ["change_pct", "change_amount", "days_since", "last_ordered_at"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: SortOption = "change_pct";
