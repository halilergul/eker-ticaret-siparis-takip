import { z } from "zod";
import {
  DEFAULT_MIN_CHANGE_PCT,
  DEFAULT_SORT,
  SORT_OPTIONS,
  type SortOption,
} from "@/lib/constants/price-changes";

export type PriceChangesFilterState = {
  supplierSlug?: string;
  minChangePct: number; // 0..1; 0 = tümü
  sortBy: SortOption;
  page: number;
  hideUnknown: boolean;
};

export const priceChangesFilterSchema = z.object({
  supplier: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  // Min zam % URL'de tamsayı (örn. ?min=5 → %5+ = 0.05); zod 0..100 clamp
  min: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(SORT_OPTIONS).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  unk: z.enum(["1"]).optional(), // ?unk=1 → bilinmeyenleri gizle
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function parsePriceChangesFilter(
  searchParams: URLSearchParams | SearchParamsRecord,
): PriceChangesFilterState {
  const obj: SearchParamsRecord =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(searchParams)
      : searchParams;

  const result = priceChangesFilterSchema.safeParse({
    supplier: typeof obj.supplier === "string" ? obj.supplier : undefined,
    min: typeof obj.min === "string" ? obj.min : undefined,
    sort: typeof obj.sort === "string" ? obj.sort : undefined,
    page: typeof obj.page === "string" ? obj.page : undefined,
    unk: typeof obj.unk === "string" ? obj.unk : undefined,
  });
  if (!result.success) {
    return {
      minChangePct: DEFAULT_MIN_CHANGE_PCT,
      sortBy: DEFAULT_SORT,
      page: 1,
      hideUnknown: false,
    };
  }
  const minPctInt = result.data.min ?? 0;
  return {
    supplierSlug: result.data.supplier,
    minChangePct: minPctInt / 100, // 5 → 0.05
    sortBy: result.data.sort ?? DEFAULT_SORT,
    page: result.data.page ?? 1,
    hideUnknown: result.data.unk === "1",
  };
}
