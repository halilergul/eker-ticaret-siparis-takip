#!/usr/bin/env tsx
/**
 * Multi-supplier scraper orchestrator.
 *
 * Kullanım:
 *   npm run scrape -- --supplier <slug> [--headed] [--verbose] [--limit N] [--skip-catalog]
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { chromium, type Browser } from "playwright";

import {
  getAdapter,
  listRegisteredAdapters,
} from "@/lib/scraper/adapter-registry";
import { ScrapeError, formatError, type FailureMode } from "@/lib/scraper/errors";
import {
  getSupplierIdBySlug,
  writeOrderHeader,
  writeOrderItems,
  recordPriceObservation,
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
  type ScrapeContext,
  type ScrapeSummary,
} from "@/lib/scraper/types";

dotenv.config({ path: ".env.local" });

const GLOBAL_TIMEOUT_MS = Number(process.env.TIMEOUT_OVERRIDE_MS) || 5 * 60 * 1000;

type TriggerType = "auto" | "manual" | "unknown";

type Args = {
  supplier?: string;
  headed: boolean;
  verbose: boolean;
  limit?: number;
  skipCatalog: boolean;
  help: boolean;
  triggerType: TriggerType;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    headed: false,
    verbose: false,
    skipCatalog: false,
    help: false,
    triggerType: "unknown",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--skip-catalog") args.skipCatalog = true;
    else if (a === "--supplier") {
      args.supplier = argv[++i];
    } else if (a === "--trigger-type") {
      const value = argv[++i] ?? "";
      if (value !== "auto" && value !== "manual" && value !== "unknown") {
        console.error(`[scrape] --trigger-type geçersiz: ${value} (auto|manual|unknown bekleniyor)`);
        process.exit(2);
      }
      args.triggerType = value;
    } else if (a === "--limit") {
      args.limit = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.limit) || args.limit <= 0) {
        console.error(`[scrape] --limit geçersiz: ${argv[i]}`);
        process.exit(2);
      }
    } else if (a?.startsWith("--")) {
      console.error(`[scrape] Bilinmeyen flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  const registered = listRegisteredAdapters()
    .map((a) => `  - ${a.slug} (${a.displayName})`)
    .join("\n");
  console.log(`Kullanım: npm run scrape -- --supplier <slug> [--headed] [--verbose] [--limit N] [--skip-catalog]

Bir B2B tedarikçi sitesinden siparişleri ve güncel fiyatları çeker; veritabanına yazar.

Argümanlar:
  --supplier <slug>     Tedarikçi slug (zorunlu). Örn: enderyapi
  --headed              Browser görünür açılır (debug)
  --verbose             Her adımı log'lar
  --limit <n>           En yeni N sipariş ile sınırla
  --skip-catalog        Katalog enrichment'i atla (sadece sipariş yansıt)
  --trigger-type <t>    auto | manual | unknown (default unknown). Workflow'dan geçirilir.
  --help                Bu mesajı göster

Kayıtlı tedarikçiler:
${registered}

Örnekler:
  npm run scrape -- --supplier enderyapi
  npm run scrape -- --supplier enderyapi --verbose --limit 5
  npm run scrape -- --supplier enderyapi --skip-catalog
`);
}

async function runScrape(args: Args): Promise<void> {
  if (!args.supplier) {
    console.error("[scrape] --supplier zorunlu. --help için: npm run scrape -- --help");
    process.exit(2);
  }

  // Adapter çöz
  let adapter;
  try {
    adapter = getAdapter(args.supplier);
  } catch (err) {
    if (err instanceof ScrapeError && err.mode === "supplier-not-found") {
      console.error(`[scrape] ${err.details ?? err.message}`);
      process.exit(2);
    }
    throw err;
  }

  console.log(`[scrape] Tedarikçi: ${adapter.displayName}`);

  // Supplier id (DB'deki UUID) çöz
  const supplierId = await getSupplierIdBySlug(args.supplier);

  // scrape_runs row başlat
  const runId = await startRun(supplierId, args.triggerType);
  const summary: ScrapeSummary = emptySummary();
  const debugDir = path.join("scrape-debug", runId);

  let browser: Browser | null = null;
  const startTime = Date.now();

  const ctx: ScrapeContext = {
    page: null as never, // page launch sonrası set edilecek
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
        process.stderr.write(`[scrape] ⚠ ${step} [${mode}]: ${detail}\n`);
      }
    },
  };

  try {
    await fs.mkdir(debugDir, { recursive: true });

    browser = await chromium.launch({ headless: !args.headed });
    const context = await browser.newContext({
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      // Yedekler (010) bot/headless tespiti için modern Chrome UA override.
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    ctx.page = await context.newPage();

    // 1) Login
    console.log("[scrape] Login deneniyor...");
    await adapter.login(ctx);
    console.log("[scrape] ✓ Login başarılı");

    // 2) Sipariş listesi
    console.log("[scrape] Sipariş listesi okunuyor...");
    const orders = await adapter.listOrders(ctx, args.limit);
    summary.orders_total = orders.length;
    if (ctx.pagesVisited !== undefined) summary.pages_visited = ctx.pagesVisited;
    const pagesNote = ctx.pagesVisited !== undefined ? ` (${ctx.pagesVisited} sayfa)` : "";
    console.log(`[scrape] ${orders.length} sipariş bulundu${pagesNote}`);

    // 3) Sipariş detayları + DB yazma
    console.log("[scrape] Sipariş detayları işleniyor...");
    const productCodesSet = new Set<{
      code: string;
      name: string;
    }>();

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

        // Collect unique product codes for US2
        for (const item of detail.items) {
          productCodesSet.add({ code: item.productCode, name: item.productName });
        }

        if (args.verbose || (i + 1) % 5 === 0) {
          process.stdout.write(`[scrape]   ${i + 1}/${orders.length} işlendi\r`);
        }
      } catch (err) {
        const mode: FailureMode =
          err instanceof ScrapeError ? err.mode : "unknown";
        const detail = err instanceof Error ? err.message : String(err);
        ctx.pushError("order-process", mode, `${order.orderNo}: ${detail}`);
        // Bir siparişin hatası diğerlerini etkilememeli
      }
    }
    console.log(`\n[scrape] Sipariş detay işleme tamamlandı: ${summary.orders_inserted} yeni, ${summary.orders_skipped} mevcut`);

    // 4) Katalog enrichment (US2)
    if (!args.skipCatalog && productCodesSet.size > 0) {
      // Dedupe by code
      const uniqueProducts = new Map<string, string>();
      for (const p of productCodesSet) {
        if (!uniqueProducts.has(p.code)) {
          uniqueProducts.set(p.code, p.name);
        }
      }
      console.log(
        `[scrape] Katalog güncel fiyatlar: ${uniqueProducts.size} unique ürün`,
      );
      let observed = 0;
      let snapshots = 0;
      for (const [code, name] of uniqueProducts.entries()) {
        try {
          const price = await adapter.getProductPrice(ctx, code);
          const result = await recordPriceObservation(supplierId, code, name, price);
          observed++;
          if (result.snapshotAdded) snapshots++;
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          const mode: FailureMode =
            err instanceof ScrapeError ? err.mode : "unknown";
          const detail = err instanceof Error ? err.message : String(err);
          ctx.pushError("catalog-visit", mode, `${code}: ${detail}`);
        }
      }
      summary.products_observed = observed;
      summary.snapshots_added = snapshots;
      console.log(
        `[scrape] Katalog tamamlandı: ${observed} gözlem, ${snapshots} yeni snapshot`,
      );
    } else if (args.skipCatalog) {
      console.log("[scrape] Katalog atlandı (--skip-catalog)");
    }

    // 5) Terminal state
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsedSec / 60);
    const seconds = elapsedSec % 60;
    const timeStr = `${minutes}m ${seconds}s`;

    if (summary.errors.length > 0 && (summary.orders_inserted > 0 || summary.items_inserted > 0)) {
      console.log("[scrape] Özet:");
      printSummary(summary);
      console.log(`[scrape] ⚠ Kısmi başarı (${summary.errors.length} hata) — ${timeStr}`);
      await partialRun(runId, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "partial").catch(() => undefined);
      }
      process.exit(0);
    } else if (summary.errors.length > 0) {
      console.log("[scrape] Özet:");
      printSummary(summary);
      console.log(`[scrape] ❌ Başarısız (${summary.errors.length} hata) — ${timeStr}`);
      await failRun(runId, `${summary.errors.length} hata kaydedildi`, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "failed").catch(() => undefined);
      }
      process.exit(1);
    } else {
      console.log("[scrape] Özet:");
      printSummary(summary);
      console.log(`[scrape] ✅ Başarılı (${timeStr})`);
      await succeedRun(runId, summary);
      if (args.triggerType === "auto") {
        await updateScheduleCache(supplierId, "success").catch(() => undefined);
      }
      process.exit(0);
    }
  } catch (err) {
    // Login/init seviyesinde fatal hata
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

    // Login fail → exit 3; diğer fatal → 1
    if (scrapeError.mode === "login-failed" || scrapeError.mode === "2fa-required" || scrapeError.mode === "captcha") {
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
  if (s.products_observed > 0) {
    console.log(`  - Ürün katalog gözlemi: ${s.products_observed}`);
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

  // Global 5dk timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new ScrapeError({ mode: "timeout" })), GLOBAL_TIMEOUT_MS),
  );

  try {
    await Promise.race([runScrape(args), timeoutPromise]);
  } catch (err) {
    if (err instanceof ScrapeError && err.mode === "timeout") {
      console.error("[scrape] ❌ Global timeout (5dk) aşıldı — aborted");
      process.exit(4);
    }
    if (err instanceof ScrapeError) {
      const formatted = formatError(err, true);
      process.stderr.write(formatted.stderr);
      process.exit(formatted.exitCode);
    }
    console.error("[scrape] Beklenmedik hata:", err);
    process.exit(1);
  }
}

main();
