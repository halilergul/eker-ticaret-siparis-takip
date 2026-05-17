#!/usr/bin/env tsx
/**
 * Catalog scrape orchestrator — ürün başına KDV dahil özel birim fiyatı çek + price_snapshots'a yaz.
 *
 * Kullanım:
 *   npm run scrape:catalog -- --supplier <slug> [--limit N] [--product-code "118 049"] [--only-stale 24] [--headed] [--verbose]
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { chromium, type Browser } from "playwright";

import { getAdapter } from "@/lib/scraper/adapter-registry";
import { ScrapeError, formatError } from "@/lib/scraper/errors";
import {
  ensureProduct,
  getServiceClient,
  getSupplierIdBySlug,
  writePriceSnapshot,
} from "@/lib/scraper/supabase-writer";
import {
  startRun,
  succeedRun,
  partialRun,
  failRun,
} from "@/lib/scraper/run-logger";
import {
  emptySummary,
  type CatalogScrapeTarget,
  type ScrapeContext,
} from "@/lib/scraper/types";

dotenv.config({ path: ".env.local" });

const GLOBAL_TIMEOUT_MS = Number(process.env.TIMEOUT_OVERRIDE_MS) || 5 * 60 * 1000;

type Args = {
  supplier?: string;
  headed: boolean;
  verbose: boolean;
  limit?: number;
  onlyStaleHours?: number;
  productCode?: string;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { headed: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--supplier") args.supplier = argv[++i];
    else if (a === "--limit") {
      args.limit = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.limit) || args.limit <= 0) {
        console.error(`[catalog] --limit geçersiz: ${argv[i]}`);
        process.exit(2);
      }
    } else if (a === "--only-stale") {
      args.onlyStaleHours = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.onlyStaleHours) || args.onlyStaleHours < 0) {
        console.error(`[catalog] --only-stale geçersiz: ${argv[i]}`);
        process.exit(2);
      }
    } else if (a === "--product-code") {
      args.productCode = argv[++i];
    } else if (a?.startsWith("--")) {
      console.error(`[catalog] Bilinmeyen flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Catalog scrape — KDV dahil özel birim fiyat snapshot'larını çeker.

Kullanım:
  npm run scrape:catalog -- --supplier <slug> [opsiyonlar]

Opsiyonlar:
  --supplier <slug>          Hedef tedarikçi (zorunlu, örn. enderyapi)
  --product-code "<kod>"     Tek ürün scrape et (test/keşif için)
  --limit N                  Toplam N ürün ile sınırla
  --only-stale <saat>        Son snapshot N saatten eskiyse refresh
  --headed                   Browser'ı görünür çalıştır (selector keşif için)
  --verbose, -v              Detaylı log
  --help, -h                 Bu yardım

Örnekler:
  npm run scrape:catalog -- --supplier enderyapi --product-code "118 049" --headed
  npm run scrape:catalog -- --supplier enderyapi --limit 20
`);
}

async function selectTargets(
  supplierId: string,
  args: Args,
): Promise<CatalogScrapeTarget[]> {
  if (args.productCode) {
    // Tek ürün: cache'i kontrol et
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("products")
      .select("catalog_url")
      .eq("supplier_id", supplierId)
      .eq("code", args.productCode)
      .maybeSingle();
    return [{ productCode: args.productCode, catalogUrl: data?.catalog_url ?? null }];
  }

  const supabase = getServiceClient();

  // 1) products tablosundaki kayıtlı ürünler (cached URL ile)
  const productsRes = await supabase
    .from("products")
    .select("code, last_seen_at, catalog_url")
    .eq("supplier_id", supplierId);
  if (productsRes.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "select-product-codes",
      details: productsRes.error.message,
    });
  }
  const productRows = productsRes.data ?? [];

  // 2) order_items'tan ek ürün kodları
  const orderItemsRes = await supabase
    .from("order_items")
    .select("product_code, order:supplier_orders!inner(supplier_id)")
    .eq("order.supplier_id", supplierId);
  if (orderItemsRes.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "select-product-codes",
      details: orderItemsRes.error.message,
    });
  }
  const orderCodes = (orderItemsRes.data ?? []).map((r) => r.product_code);

  const productMap = new Map(
    productRows.map((r) => [r.code, r]),
  );

  // Birleştir + tekleştir
  const allCodes = Array.from(
    new Set([...productRows.map((r) => r.code), ...orderCodes]),
  );

  let targets: CatalogScrapeTarget[] = allCodes.map((code) => ({
    productCode: code,
    catalogUrl: productMap.get(code)?.catalog_url ?? null,
  }));

  // only-stale filtresi
  if (args.onlyStaleHours !== undefined) {
    const thresholdMs = args.onlyStaleHours * 60 * 60 * 1000;
    const now = Date.now();
    targets = targets.filter((t) => {
      const row = productMap.get(t.productCode);
      const lastSeen = row?.last_seen_at;
      if (!lastSeen) return true;
      return now - new Date(lastSeen).getTime() > thresholdMs;
    });
  }

  if (args.limit) targets = targets.slice(0, args.limit);
  return targets;
}

async function runCatalog(args: Args): Promise<void> {
  if (!args.supplier) {
    console.error(
      "[catalog] --supplier zorunlu. --help için: npm run scrape:catalog -- --help",
    );
    process.exit(2);
  }

  const adapter = getAdapter(args.supplier);
  if (!adapter.scrapeCatalog) {
    console.error(
      `[catalog] ${adapter.displayName} adapter'ı catalog scrape desteklemiyor`,
    );
    process.exit(2);
  }

  console.log(`[catalog] Tedarikçi: ${adapter.displayName}`);
  const supplierId = await getSupplierIdBySlug(args.supplier);
  const targets = await selectTargets(supplierId, args);

  if (targets.length === 0) {
    console.log(
      "[catalog] Scrape edilecek ürün yok. Önce sipariş scrape çalıştırın veya --product-code belirtin.",
    );
    process.exit(0);
  }

  const cachedCount = targets.filter((t) => t.catalogUrl).length;
  console.log(
    `[catalog] ${targets.length} ürün scrape edilecek (${cachedCount} cached URL, ${targets.length - cachedCount} search gerekecek)`,
  );

  const runId = await startRun(supplierId);
  const summary = emptySummary();
  const debugDir = path.join("scrape-debug", runId);
  let browser: Browser | null = null;
  const startTime = Date.now();

  const ctx: ScrapeContext = {
    page: null as never,
    supplierId,
    runId,
    verbose: args.verbose,
    debugDir,
    pushError(step, mode, detail) {
      summary.errors.push({
        step,
        mode,
        detail,
        timestamp: new Date().toISOString(),
      });
      if (args.verbose) {
        process.stderr.write(`[catalog] ⚠ ${step} [${mode}]: ${detail}\n`);
      }
    },
  };

  let written = 0;
  let failed = 0;
  let skipped = 0;

  try {
    await fs.mkdir(debugDir, { recursive: true });

    browser = await chromium.launch({ headless: !args.headed });
    const context = await browser.newContext({
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
    });
    ctx.page = await context.newPage();

    console.log("[catalog] Login deneniyor...");
    await adapter.login(ctx);
    console.log("[catalog] ✓ Login başarılı");

    console.log("[catalog] Catalog detay sayfaları işleniyor...");
    const results = await adapter.scrapeCatalog!(ctx, targets);

    for (const r of results) {
      if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
        console.error("[catalog] Global timeout (5dk) — duruyorum");
        break;
      }

      if (!r.ok) {
        failed++;
        ctx.pushError(`scrape-${r.productCode}`, r.mode, r.message);
        console.error(`[catalog] ✗ ${r.productCode} → ${r.mode}: ${r.message}`);
        continue;
      }

      try {
        const ensured = await ensureProduct({
          supplierId,
          code: r.productCode,
          productName: r.productName,
          brand: r.brand,
          vatRate: r.vatRate,
          currentUnitPrice: r.unitPriceWithVat,
          catalogUrl: r.catalogUrl,
        });
        await writePriceSnapshot({
          productId: ensured.productId,
          unitPriceWithVat: r.unitPriceWithVat,
          unitPriceExclVat: r.unitPriceExclVat,
          listPrice: r.listPrice,
          discountText: r.discountText,
          vatRate: r.vatRate,
          source: "catalog",
        });
        written++;
        summary.snapshots_added++;
        summary.products_observed++;
        const niceName = r.productName ? ` ${r.productName}` : "";
        console.log(
          `[catalog] ✓ ${r.productCode}${niceName} → ${r.unitPriceWithVat.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺ (KDV ${(r.vatRate * 100).toFixed(0)}%, +${ensured.backfilledOrderItems} order_items linked)`,
        );
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        ctx.pushError(`write-${r.productCode}`, "db-write-failed", msg);
        console.error(`[catalog] ✗ ${r.productCode} write failed: ${msg}`);
      }
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `\n[catalog] DONE: ${written} yazıldı / ${failed} hata / ${skipped} atlandı (toplam ${elapsedSec}sn)`,
    );

    if (failed === 0 && written > 0) {
      await succeedRun(runId, summary);
    } else if (written > 0) {
      await partialRun(runId, summary);
    } else {
      await failRun(runId, "all-failed", summary);
    }
  } catch (err) {
    const formatted = err instanceof ScrapeError
      ? formatError(err, args.verbose)
      : { stderr: `Hata: ${err instanceof Error ? err.message : String(err)}\n`, exitCode: 1 };
    process.stderr.write(formatted.stderr);
    await failRun(runId, formatted.stderr, summary);
    process.exit(formatted.exitCode);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

runCatalog(args).catch((err) => {
  console.error("[catalog] beklenmedik hata:", err);
  process.exit(1);
});
