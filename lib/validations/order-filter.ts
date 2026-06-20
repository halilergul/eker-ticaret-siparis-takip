import { z } from "zod";

export const ORDERS_PAGE_SIZE = 20;

export type FilterState = {
  supplierSlug?: string;
  status?: string;
  page: number;
};

export const orderFilterSchema = z.object({
  supplier: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  status: z.string().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
});

export type OrderFilterInput = z.infer<typeof orderFilterSchema>;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function parseFilter(
  searchParams: URLSearchParams | SearchParamsRecord,
): FilterState {
  const obj: SearchParamsRecord =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(searchParams)
      : searchParams;

  const result = orderFilterSchema.safeParse({
    supplier: typeof obj.supplier === "string" ? obj.supplier : undefined,
    status: typeof obj.status === "string" ? obj.status : undefined,
    page: typeof obj.page === "string" ? obj.page : undefined,
  });
  if (!result.success) return { page: 1 };
  return {
    supplierSlug: result.data.supplier,
    status: result.data.status,
    page: result.data.page ?? 1,
  };
}
