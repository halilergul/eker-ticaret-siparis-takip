import { z } from "zod";
import {
  DEFAULT_DAYS_WINDOW,
  MAX_DAYS_WINDOW,
  MIN_DAYS_WINDOW,
} from "@/lib/constants/price-changes";

export type PriceChangesFilterState = {
  windowDays: number;
  includeDrops: boolean;
};

export const priceChangesFilterSchema = z.object({
  days: z.coerce.number().int().min(MIN_DAYS_WINDOW).max(MAX_DAYS_WINDOW).optional(),
  showDrops: z.enum(["0", "1"]).optional(),
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
    days: typeof obj.days === "string" ? obj.days : undefined,
    showDrops: typeof obj.showDrops === "string" ? obj.showDrops : undefined,
  });
  if (!result.success) {
    return { windowDays: DEFAULT_DAYS_WINDOW, includeDrops: false };
  }
  return {
    windowDays: result.data.days ?? DEFAULT_DAYS_WINDOW,
    includeDrops: result.data.showDrops === "1",
  };
}
