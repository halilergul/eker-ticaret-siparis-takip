#!/usr/bin/env tsx
/**
 * Combined scrape orchestrator: order + catalog in tek scrape_runs row.
 *
 * Workflow ve tek-tıkla manuel tetiklemeler bu script'i çağırır. Tek browser
 * session + tek login + tek runId paylaşılır.
 *
 * Kullanım:
 *   npm run scrape:all -- --supplier <slug> [--trigger-type auto|manual]
 *                       [--skip-catalog] [--only-stale 24] [--headed] [--verbose]
 *
 * Local debugging için run.ts ve catalog.ts standalone olarak da çalışır.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { chromium, type Browser } from "playwright";

import { getAdapter } from "@/lib/scraper/adapter-registry";
import { ScrapeError, formatError, type FailureMode } from "@/lib/scraper/errors";
import {
  ensureProduct,
  getServiceClient,
  getSupplierIdBySlug,
  writeOrderHeader,
  writeOrderItems,
  writePriceSnapshot,
} from "@/lib/scraper/supabase-writer";
import {
  startRun,
  succeedRun,
  partialRun,
  failRun,
  abortRun,
  updateScheduleCache,
} from "@/lib/scraper/run-logger";
import {
  emptySummary,
  type CatalogScrapeTarget,
  type ScrapeContext,
  type ScrapeSummary,
} from "@/lib/scraper/types";

dotenv.config({ path: ".env.local" });

const GLOBAL_TIMEOUT_MS = Number(process.env.TIMEOUT_OVERRIDE_MS) || 8 * 60 * 1000;

type TriggerType = "auto" | "manual" | "unknown";

type ActiveRun = {
  runId: string;
  summary: ScrapeSummary;
  triggerType: TriggerType;
  supplierId: string;
};

// Outer timeout handler bu referansa bakar; runAll finalize edince null'a çekilir.
let activeRun: ActiveRun | null = null;

type Args = {
  supplier?: string;
  headed: boolean;
  verbose: boolean;
  limit?: number;
  skipCatalog: boolean;
  onlyStaleHours?: number;
  triggerType: TriggerType;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    headed: false,
    verbose: false,
    skipCatalog: false,
    triggerType: "unknown",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--skip-catalog") args.skipCatalog = true;
    else if (a === "--supplier") args.supplier = argv[++i];
    else if (a === "--trigger-type") {
      const value = argv[++i] ?? "";
      if (value !== "auto" && value !== "manual" && value !== "unknown") {
        console.error(`[scrape:all] --trigger-type geçersiz: ${value}`);
        process.exit(2);
      }
      args.triggerType = value;
    } else if (a === "--limit") {
      args.limit = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.limit) || args.limit <= 0) {
        console.error(`[scrape:all] --limit geçersiz: ${argv[i]}`);
        process.exit(2);
      }
    } else if (a === "--only-stale") {
      args.onlyStaleHours = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.onlyStaleHours) || args.onlyStaleHours < 0) {
        console.error(`[scrape:all] --only-stale geçersiz: ${argv[i]}`);
        process.exit(2);
      }
    } else if (a?.startsWith("--")) {
      console.error(`[scrape:all] Bilinmeyen flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Combined scrape — order + catalog tek run/row.

Kullanım:
  npm run scrape:all -- --supplier <slug> [opsiyonlar]

Opsiyonlar:
  --supplier <slug>     Tedarikçi (zorunlu). Örn: enderyapi
  --trigger-type <t>    auto | manual | unknown (default unknown)
  --limit N             En yeni N sipariş ile sınırla (sipariş aşaması)
  --skip-catalog        Catalog aşamasını atla
  --only-stale <saat>   Catalog: son N saatten eski snapshot'lar
  --headed              Browser görünür (debug)
  --verbose, -v         Detaylı log
  --help, -h            Yardım

Örnekler:
  npm run scrape:all -- --supplier enderyapi --trigger-type manual
  npm run scrape:all -- --supplier enderyapi --skip-catalog
`);
}

async function selectCatalogTargets(
  supplierId: string,
  args: Args,
): Promise<CatalogScrapeTarget[]> {
  const supabase = getServiceClient();

  const productsRes = await supabase
    .from("products")
    .select("code, last_seen_at, catalog_url, barcode, name")
    .eq("supplier_id", supplierId);
  if (productsRes.error) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "select-product-codes",
      details: productsRes.error.message,
    });
  }
  const productRows = productsRes.data ?? [];

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

  const productMap = new Map(productRows.map((r) => [r.code, r]));
  const allCodes = Array.from(
    new Set([...productRows.map((r) => r.code), ...orderCodes]),
  );

  let targets: CatalogScrapeTarget[] = allCodes.map((code) => {
    const row = productMap.get(code);
    return {
      productCode: code,
      catalogUrl: row?.catalog_url ?? null,
      barcode: row?.barcode ?? null,
      productName: row?.name ?? null,
    };
  });

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

  return targets;
}

async function orderPhase(
  ctx: ScrapeContext,
  supplierId: string,
  args: Args,
  summary: ScrapeSummary,
): Promise<void> {
  const adapter = getAdapter(args.supplier!);

  console.log("[scrape:all] Sipariş listesi okunuyor...");
  const orders = await adapter.listOrders(ctx, args.limit);
  summary.orders_total = orders.length;
  console.log(`[scrape:all] ${orders.length} sipariş bulundu`);

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order) continue;
    try {
      const headerResult = await writeOrderHeader(supplierId, order);
      if (headerResult.inserted) summary.orders_inserted++;
      else summary.orders_skipped++;

      const detail = await adapter.getOrderDetail(ctx, order);
      const itemsResult = await writeOrderItems(supplierId, headerResult.orderId, detail.items);
      summary.items_inserted += itemsResult.inserted;
      summary.items_skipped += itemsResult.skipped;

      if (args.verbose || (i + 1) % 5 === 0) {
        process.stdout.write(`[scrape:all]   ${i + 1}/${orders.length} işlendi\r`);
      }
    } catch (err) {
      const mode: FailureMode = err instanceof ScrapeError ? err.mode : "unknown";
      const detail = err instanceof Error ? err.message : String(err);
      ctx.pushError("order-process", mode, `${order.orderNo}: ${detail}`);
    }
  }
  console.log(
    `\n[scrape:all] Sipariş aşaması: ${summary.orders_inserted} yeni, ${summary.orders_skipped} mevcut`,
  );
}

async function catalogPhase(
  ctx: ScrapeContext,
  supplierId: string,
  args: Args,
  summary: ScrapeSummary,
  startTime: number,
): Promise<void> {
  const adapter = getAdapter(args.supplier!);
  if (!adapter.scrapeCatalog) {
    console.log(`[scrape:all] ${adapter.displayName} catalog scrape desteklemiyor, atlanıyor`);
    return;
  }

  const targets = await selectCatalogTargets(supplierId, args);
  if (targets.length === 0) {
    console.log("[scrape:all] Catalog hedefi yok (henüz sipariş yok ya da hepsi taze)");
    return;
  }

  const cachedCount = targets.filter((t) => t.catalogUrl).length;
  console.log(
    `[scrape:all] Catalog: ${targets.length} ürün (${cachedCount} cached URL)`,
  );

  const results = await adapter.scrapeCatalog(ctx, targets);

  for (const r of results) {
    if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
      const timeoutMin = Math.round(GLOBAL_TIMEOUT_MS / 60_000);
      console.error(`[scrape:all] Global timeout (${timeoutMin}dk) — catalog yarıda kesildi`);
      break;
    }

    if (!r.ok) {
      ctx.pushError(`catalog-${r.productCode}`, r.mode, r.message);
      console.error(`[scrape:all] ✗ ${r.productCode} → ${r.mode}: ${r.message}`);
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
        imageUrl: r.imageUrl,
      });
      const snapResult = await writePriceSnapshot({
        productId: ensured.productId,
        unitPriceWithVat: r.unitPriceWithVat,
        unitPriceExclVat: r.unitPriceExclVat,
        listPrice: r.listPrice,
        discountText: r.discountText,
        vatRate: r.vatRate,
        source: "catalog",
      });
      summary.products_observed++;
      if (snapResult.inserted) {
        summary.snapshots_added++;
      } else {
        summary.snapshots_skipped = (summary.snapshots_skipped ?? 0) + 1;
      }
      const niceName = r.productName ? ` ${r.productName}` : "";
      const status = snapResult.inserted ? "yeni" : "mevcut";
      console.log(
        `[scrape:all] ✓ ${r.productCode}${niceName} → ${r.unitPriceWithVat.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺ (${status}, +${ensured.backfilledOrderItems} link)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.pushError(`catalog-write-${r.productCode}`, "db-write-failed", msg);
      console.error(`[scrape:all] ✗ ${r.productCode} write failed: ${msg}`);
    }
  }

  const skipped = summary.snapshots_skipped ?? 0;
  console.log(
    `[scrape:all] Catalog aşaması: ${summary.snapshots_added} yeni snapshot, ${skipped} mevcut atlandı, ${summary.errors.length} hata`,
  );
}

async function runAll(args: Args): Promise<void> {
  if (!args.supplier) {
    console.error("[scrape:all] --supplier zorunlu. --help için: npm run scrape:all -- --help");
    process.exit(2);
  }

  let adapter;
  try {
    adapter = getAdapter(args.supplier);
  } catch (err) {
    if (err instanceof ScrapeError && err.mode === "supplier-not-found") {
      console.error(`[scrape:all] ${err.details ?? err.message}`);
      process.exit(2);
    }
    throw err;
  }
  console.log(`[scrape:all] Tedarikçi: ${adapter.displayName} (tetik: ${args.triggerType})`);

  const supplierId = await getSupplierIdBySlug(args.supplier);
  const runId = await startRun(supplierId, args.triggerType);
  const summary: ScrapeSummary = emptySummary();
  activeRun = { runId, summary, triggerType: args.triggerType, supplierId };
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
      summary.errors.push({ step, mode, detail, timestamp: new Date().toISOString() });
      if (args.verbose) {
        process.stderr.write(`[scrape:all] ⚠ ${step} [${mode}]: ${detail}\n`);
      }
    },
  };

  try {
    await fs.mkdir(debugDir, { recursive: true });

    browser = await chromium.launch({ headless: !args.headed });
    const context = await browser.newContext({
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
    });
    ctx.page = await context.newPage();

    console.log("[scrape:all] Login deneniyor...");
    await adapter.login(ctx);
    console.log("[scrape:all] ✓ Login başarılı");

    await orderPhase(ctx, supplierId, args, summary);

    if (!args.skipCatalog) {
      await catalogPhase(ctx, supplierId, args, summary, startTime);
    } else {
      console.log("[scrape:all] Catalog atlandı (--skip-catalog)");
    }

    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsedSec / 60);
    const seconds = elapsedSec % 60;
    const timeStr = `${minutes}m ${seconds}s`;
    const hasErrors = summary.errors.length > 0;
    const hasWork =
      summary.orders_inserted > 0 ||
      summary.items_inserted > 0 ||
      summary.snapshots_added > 0;

    console.log("[scrape:all] Özet:");
    printSummary(summary);

    if (hasErrors && hasWork) {
      console.log(`[scrape:all] ⚠ Kısmi başarı (${summary.errors.length} hata) — ${timeStr}`);
      await partialRun(runId, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "partial").catch(() => undefined);
      }
      activeRun = null;
      process.exit(0);
    } else if (hasErrors) {
      console.log(`[scrape:all] ❌ Başarısız (${summary.errors.length} hata) — ${timeStr}`);
      await failRun(runId, `${summary.errors.length} hata kaydedildi`, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "failed").catch(() => undefined);
      }
      activeRun = null;
      process.exit(1);
    } else {
      console.log(`[scrape:all] ✅ Başarılı (${timeStr})`);
      await succeedRun(runId, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "success").catch(() => undefined);
      }
      activeRun = null;
      process.exit(0);
    }
  } catch (err) {
    let scrapeError: ScrapeError;
    if (err instanceof ScrapeError) {
      scrapeError = err;
    } else {
      scrapeError = new ScrapeError({
        mode: "unknown",
        details: err instanceof Error ? err.message : String(err),
      });
    }
    const formatted = formatError(scrapeError, args.verbose);
    process.stderr.write(formatted.stderr);
    await failRun(runId, scrapeError.message, summary).catch(() => undefined);
    if (args.triggerType === "auto") {
      await updateScheduleCache(supplierId, "failed").catch(() => undefined);
    }
    activeRun = null;
    if (
      scrapeError.mode === "login-failed" ||
      scrapeError.mode === "2fa-required" ||
      scrapeError.mode === "captcha"
    ) {
      process.exit(3);
    }
    process.exit(formatted.exitCode);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function printSummary(s: ScrapeSummary): void {
  console.log(`  - Yeni sipariş: ${s.orders_inserted}`);
  console.log(`  - Mevcut sipariş atlandı: ${s.orders_skipped}`);
  console.log(`  - Yeni satır: ${s.items_inserted}`);
  console.log(`  - Mevcut satır atlandı: ${s.items_skipped}`);
  if (s.products_observed > 0 || s.snapshots_added > 0) {
    console.log(`  - Catalog ürün gözlemi: ${s.products_observed}`);
    console.log(`  - Yeni fiyat snapshot: ${s.snapshots_added}`);
  }
  if (s.errors.length > 0) {
    console.log(`  - Hatalar: ${s.errors.length}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new ScrapeError({ mode: "timeout" })),
      GLOBAL_TIMEOUT_MS + 60_000, // catalog phase has its own check; outer cap +1 dk
    ),
  );

  try {
    await Promise.race([runAll(args), timeoutPromise]);
  } catch (err) {
    if (err instanceof ScrapeError && err.mode === "timeout") {
      console.error("[scrape:all] ❌ Global outer timeout aşıldı — aborted");
      if (activeRun) {
        await abortRun(
          activeRun.runId,
          activeRun.summary,
          "Global outer timeout aşıldı (main race)",
        ).catch(() => undefined);
        if (activeRun.triggerType === "auto") {
          await updateScheduleCache(activeRun.supplierId, "aborted").catch(
            () => undefined,
          );
        }
        activeRun = null;
      }
      process.exit(4);
    }
    if (err instanceof ScrapeError) {
      const formatted = formatError(err, true);
      process.stderr.write(formatted.stderr);
      process.exit(formatted.exitCode);
    }
    console.error("[scrape:all] Beklenmedik hata:", err);
    process.exit(1);
  }
}

main();
