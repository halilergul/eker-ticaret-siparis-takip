import { z } from "zod";

export type FilterState = {
  supplierSlug?: string;
  status?: string;
};

export const orderFilterSchema = z.object({
  supplier: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  status: z.string().min(1).max(50).optional(),
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
  });
  if (!result.success) return {};
  return {
    supplierSlug: result.data.supplier,
    status: result.data.status,
  };
}
