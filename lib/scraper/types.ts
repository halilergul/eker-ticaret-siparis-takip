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
  /** Adapter `listOrders` döngü bitiminde gezdiği toplam sayfa sayısını yazar
   *  (011 pagination). Single-page durumda 1; pagination yoksa undefined. */
  pagesVisited?: number;
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
  /** Sipariş detay sayfasında ürün adı/görseli linkliyse buradan yakalanır.
   *  Sonraki catalog scrape direkt navigate eder, search'e gerek kalmaz. */
  catalogUrl?: string | null;
  /** Tedarikçi tarafındaki barkod numarası (Levent Şimşek modal'da gözüküyor:
   *  "Barkod: 212102590 | Muhasebe Kodu: S001"). Catalog scrape'te site search
   *  muhasebe koduyla unique sonuç döndürmeyebilir → barkod fallback olarak
   *  kullanılır. Adapter parse edebilirse doldurur; yoksa null. */
  barcode?: string | null;
};

export type RawOrderDetail = {
  summary: RawOrderSummary;
  items: RawOrderItem[];
};

export type CatalogScrapeTarget = {
  productCode: string;
  /** Eğer DB'de cache'lenmiş URL varsa direkt navigate edilir; yoksa search kullanılır. */
  catalogUrl?: string | null;
  /** Barkod (Levent Şimşek için): site search'inde unique sonuç döndürür; muhasebe
   *  kodu çakışma yaratırsa adapter barkod ile aramaya düşer. */
  barcode?: string | null;
  /** Ürün adı (gelişmiş eşleştirme için; adapter search result filter'da kullanır). */
  productName?: string | null;
};

export type CatalogScrapeResult =
  | {
      ok: true;
      productCode: string;
      catalogUrl: string;
      productName?: string;
      brand?: string;
      listPrice: number | null;
      discountText: string | null;
      unitPriceExclVat: number;
      vatRate: number;
      unitPriceWithVat: number;
      /** Ürün görseli — tedarikçi CDN/uploads üzerinden public hotlink edilebilir
       *  URL. Faz B'de eklendi; eski adapter koşumları için opsiyonel. */
      imageUrl?: string | null;
    }
  | {
      ok: false;
      productCode: string;
      mode: FailureMode;
      message: string;
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
  scrapeCatalog?(
    ctx: ScrapeContext,
    targets: CatalogScrapeTarget[],
    opts?: CatalogScrapeOptions,
  ): Promise<CatalogScrapeResult[]>;
}

/**
 * `onResult` çağrılırsa her ürün için anında yazma yapılır. Timeout fırlarsa
 * o ana kadar yazılanlar DB'de kalır. Adapter callback'in throw etmesine
 * (timeout sinyali) saygı duyup loop'tan çıkmalı.
 */
export type CatalogScrapeOptions = {
  onResult?: (result: CatalogScrapeResult, index: number, total: number) => Promise<void>;
};

export const scrapeSummarySchema = z.object({
  orders_total: z.number().int().nonnegative(),
  orders_inserted: z.number().int().nonnegative(),
  orders_skipped: z.number().int().nonnegative(),
  items_inserted: z.number().int().nonnegative(),
  items_skipped: z.number().int().nonnegative(),
  products_observed: z.number().int().nonnegative(),
  snapshots_added: z.number().int().nonnegative(),
  snapshots_skipped: z.number().int().nonnegative().optional(),
  /** 011 — adapter `listOrders` döngü bitiminde gezdiği sayfa sayısı (single-page=1). */
  pages_visited: z.number().int().positive().optional(),
  /** 015 — tracking_enabled=true ürünlerin başarısızlık sayısı; status badge bunu kullanır. */
  effective_errors: z.number().int().nonnegative().optional(),
  /** 015 — tracking_enabled=false ürünlerin başarısızlık sayısı (bilgi amaçlı; badge'i etkilemez). */
  stale_errors: z.number().int().nonnegative().optional(),
  /** 015 — bu run'da yeni disable edilen ürün sayısı. */
  newly_disabled: z.number().int().nonnegative().optional(),
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
    snapshots_skipped: 0,
    errors: [],
  };
}
