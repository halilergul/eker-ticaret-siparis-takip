import type { Page } from "playwright";
import { z } from "zod";

import type { FailureMode } from "./errors";

export type ScrapeContext = {
  page: Page;
  supplierId: string;
  runId: string;
  verbose: boolean;
  debugDir: string;
  pushError(step: string, mode: FailureMode, detail: string): void;
};

export type RawOrderSummary = {
  orderNo: string;
  status: string;
  orderedAt: string;
  totalAmount: number;
  detailUrl?: string;
};

export type RawOrderItem = {
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceAtOrder: number;
};

export type RawOrderDetail = {
  summary: RawOrderSummary;
  items: RawOrderItem[];
};

export interface Adapter {
  readonly slug: string;
  readonly displayName: string;
  login(ctx: ScrapeContext): Promise<void>;
  listOrders(ctx: ScrapeContext, limit?: number): Promise<RawOrderSummary[]>;
  getOrderDetail(
    ctx: ScrapeContext,
    order: RawOrderSummary,
  ): Promise<RawOrderDetail>;
  getProductPrice(
    ctx: ScrapeContext,
    productCode: string,
  ): Promise<number | null>;
}

export const scrapeSummarySchema = z.object({
  orders_total: z.number().int().nonnegative(),
  orders_inserted: z.number().int().nonnegative(),
  orders_skipped: z.number().int().nonnegative(),
  items_inserted: z.number().int().nonnegative(),
  items_skipped: z.number().int().nonnegative(),
  products_observed: z.number().int().nonnegative(),
  snapshots_added: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      step: z.string(),
      mode: z.string(),
      detail: z.string(),
      timestamp: z.string(),
    }),
  ),
});

export type ScrapeSummary = z.infer<typeof scrapeSummarySchema>;

export function emptySummary(): ScrapeSummary {
  return {
    orders_total: 0,
    orders_inserted: 0,
    orders_skipped: 0,
    items_inserted: 0,
    items_skipped: 0,
    products_observed: 0,
    snapshots_added: 0,
    errors: [],
  };
}
