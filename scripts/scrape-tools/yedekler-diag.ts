/**
 * Yedekler İnşaat DOM keşif aracı — Feature 010.
 *
 * Iteratif keşif için tek seferlik tool:
 *   - Phase: login   → 3-alanlı form selector'larını ve success marker'ı tespit et
 *   - Phase: orders  → sipariş listesi URL + satır + alan selector'ları
 *   - Phase: order-detail → sipariş detayı / item satırları
 *   - Phase: catalog → catalog sayfası + ürün + fiyat selector'ları (US2)
 *
 * Her phase HTML + screenshot'ı `tmp/yedekler-diag/<phase>/` altına yazar.
 * Sonuçlar `lib/scraper/adapters/yedekler.constants.ts`'i refine etmek için kullanılır.
 *
 * Kullanım:
 *   npm run diag:yedekler -- --phase login
 *   npm run diag:yedekler -- --phase orders
 *   npm run diag:yedekler -- --phase order-detail
 *   npm run diag:yedekler -- --phase catalog
 *   npm run diag:yedekler -- --phase login --headed   (browser görünür)
 *
 * .env.local'dan credentials okur. Şifreyi log'lamaz.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

import { loadYedeklerCredentials } from "@/scripts/scrape/credentials";
import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  CATALOG_PATHS,
  LOGIN_SELECTORS,
  LOGIN_SUCCESS_MARKERS,
} from "@/lib/scraper/adapters/yedekler.constants";

type Phase = "login" | "orders" | "order-detail" | "catalog" | "orders-pagination" | "all";

const DIAG_ROOT = path.resolve(process.cwd(), "tmp/yedekler-diag");

function parseArgs(): { phase: Phase; headed: boolean } {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf("--phase");
  const phase = (phaseIdx >= 0 ? args[phaseIdx + 1] : "login") as Phase;
  const headed = args.includes("--headed");
  if (!["login", "orders", "order-detail", "catalog", "orders-pagination", "all"].includes(phase)) {
    console.error(`Geçersiz --phase: ${phase}`);
    process.exit(1);
  }
  return { phase, headed };
}

async function dumpPage(page: Page, phaseDir: string, label: string) {
  await fs.mkdir(phaseDir, { recursive: true });
  const htmlPath = path.join(phaseDir, `${label}.html`);
  const pngPath = path.join(phaseDir, `${label}.png`);
  const html = await page.content();
  await fs.writeFile(htmlPath, html, "utf-8");
  await page.screenshot({ path: pngPath, fullPage: true });
  console.log(`  📄 ${htmlPath}`);
  console.log(`  🖼️  ${pngPath}`);
}

async function tryGoto(page: Page, paths: readonly string[]): Promise<string | null> {
  for (const p of paths) {
    const url = SITE_BASE_URL + p;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (resp && resp.status() < 400) {
        console.log(`  ↪ Navigated: ${url} (${resp.status()})`);
        return p;
      }
      console.log(`  ✗ ${url} → status ${resp?.status()}`);
    } catch (e) {
      console.log(`  ✗ ${url} → error: ${(e as Error).message}`);
    }
  }
  return null;
}

async function tryFindFirstSelector(
  page: Page,
  selectors: readonly string[],
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) return sel;
    } catch {
      // sonraki
    }
  }
  return null;
}

async function detectProtocol(page: Page) {
  const url = page.url();
  const protocol = url.startsWith("https://") ? "HTTPS" : url.startsWith("http://") ? "HTTP" : "UNKNOWN";
  console.log(`\n🔒 Detected protocol: ${protocol} (${url})`);
  const headers = await page.evaluate(() => ({
    server: document.documentElement?.outerHTML?.length ?? 0,
  }));
  console.log(`  Page HTML length: ${headers.server}`);
}

async function phaseLogin(page: Page) {
  console.log("\n=== Phase: login ===");
  const phaseDir = path.join(DIAG_ROOT, "login");

  // 1. Login sayfasına git
  const loginPath = await tryGoto(page, LOGIN_PATHS);
  if (!loginPath) {
    console.error("  ❌ Login URL bulunamadı; LOGIN_PATHS'ı genişlet");
    await dumpPage(page, phaseDir, "login-page-not-found");
    return false;
  }

  await detectProtocol(page);
  await dumpPage(page, phaseDir, "01-login-page");

  // 2. 3 input selector'ını test et
  const customerSel = await tryFindFirstSelector(page, LOGIN_SELECTORS.CUSTOMER_CODE_INPUTS);
  const userSel = await tryFindFirstSelector(page, LOGIN_SELECTORS.USER_CODE_INPUTS);
  const passSel = await tryFindFirstSelector(page, LOGIN_SELECTORS.PASSWORD_INPUTS);
  const submitSel = await tryFindFirstSelector(page, LOGIN_SELECTORS.SUBMIT_BUTTONS);

  console.log("\n🔍 Login selector tespiti:");
  console.log(`  customer code: ${customerSel ?? "❌ NOT FOUND"}`);
  console.log(`  user code:     ${userSel ?? "❌ NOT FOUND"}`);
  console.log(`  password:      ${passSel ?? "❌ NOT FOUND"}`);
  console.log(`  submit button: ${submitSel ?? "❌ NOT FOUND"}`);

  if (!customerSel || !userSel || !passSel || !submitSel) {
    console.error("  ⚠️  Bazı selector'lar bulunamadı — HTML dump'ı incele ve constants'ı güncelle");
    return false;
  }

  // 3. Login dene
  const creds = loadYedeklerCredentials();
  console.log("\n🔑 Login deneniyor (credentials log'lanmıyor)...");
  await page.fill(customerSel, creds.customerCode);
  await page.fill(userSel, creds.userCode);
  await page.fill(passSel, creds.password);
  await dumpPage(page, phaseDir, "02-form-filled");

  await page.click(submitSel);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(2000); // CSR / redirect için
  await dumpPage(page, phaseDir, "03-after-submit");

  // 4. Success kontrol
  const currentUrl = page.url();
  const successByUrl = LOGIN_SUCCESS_MARKERS.URL_PATTERNS.some((p) => currentUrl.includes(p));
  const successBySel = await tryFindFirstSelector(page, LOGIN_SUCCESS_MARKERS.DOM_SELECTORS);
  console.log(`\n  Post-submit URL: ${currentUrl}`);
  console.log(`  Success by URL pattern: ${successByUrl}`);
  console.log(`  Success by DOM marker: ${successBySel ?? "no marker matched"}`);

  return successByUrl || !!successBySel;
}

async function phaseOrders(page: Page) {
  console.log("\n=== Phase: orders (list) ===");
  const phaseDir = path.join(DIAG_ROOT, "orders");
  const ordersPath = await tryGoto(page, ORDER_HISTORY_PATHS);
  if (!ordersPath) {
    console.error("  ❌ Orders URL bulunamadı; constants'ı genişlet");
    await dumpPage(page, phaseDir, "orders-not-found");
    return;
  }
  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "01-orders-list");
}

async function phaseOrderDetail(page: Page) {
  console.log("\n=== Phase: order-detail ===");
  const phaseDir = path.join(DIAG_ROOT, "order-detail");
  // önce orders'a git
  const ordersPath = await tryGoto(page, ORDER_HISTORY_PATHS);
  if (!ordersPath) {
    console.error("  ❌ Orders URL bulunamadı");
    return;
  }
  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "01-orders-list");

  // İlk sipariş detay link'ini bul ve tıkla.
  // Yedekler'de detail URL pattern: Siparislerim.asp?Pages=SiparisListele&ID=<id>
  // "Görüntüle" buton-link tablonun son sütununda — diğer Siparişlerim menü
  // link'lerinden ayırmak için "SiparisListele" substring'i hedef alıyoruz.
  const link = page.locator("a[href*='SiparisListele&ID=']").first();
  const count = await link.count();
  if (count === 0) {
    console.error("  ❌ Sipariş detay link'i bulunamadı (SiparisListele&ID arandı); HTML dump'ı incele");
    return;
  }
  const href = await link.getAttribute("href");
  console.log(`  ↪ Detail link: ${href}`);
  // Navigate yerine click (button olabilir + relative href çözümü kolay)
  await link.click().catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "02-order-detail");
  console.log(`  Final URL: ${page.url()}`);
}

async function phaseOrdersPagination(page: Page) {
  console.log("\n=== Phase: orders-pagination ===");
  const phaseDir = path.join(DIAG_ROOT, "orders-pagination");

  // 1) Default sayfa (sayfa 1)
  const ordersPath = await tryGoto(page, ORDER_HISTORY_PATHS);
  if (!ordersPath) {
    console.error("  ❌ Orders URL bulunamadı");
    return;
  }
  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "page-1-default");

  // Sayfa 1 üzerinde satır sayısı ve "pagination control" işaretleri
  const rows1 = await page.locator("table#sort tbody tr").count();
  console.log(`  Sayfa 1: ${rows1} sipariş satırı`);

  // Pagination DOM işaretleri ara — Bootstrap pagination yaygın
  const paginationCandidates = [
    "ul.pagination",
    "nav.pagination",
    "div.pagination",
    "a[href*='sayfa=']",
    "a[href*='page=']",
    "a:has-text('Sonraki')",
    "a:has-text('Next')",
    "a:has-text('»')",
  ];
  console.log("\n  Pagination DOM candidate'ları:");
  for (const sel of paginationCandidates) {
    const c = await page.locator(sel).count();
    if (c > 0) {
      console.log(`    ✓ "${sel}" → ${c} eşleşme`);
      // İlk eşleşmenin href'ini de yaz
      try {
        const first = page.locator(sel).first();
        const href = await first.getAttribute("href").catch(() => null);
        const text = (await first.textContent().catch(() => null))?.trim();
        if (href || text) console.log(`       href="${href ?? ""}" text="${text ?? ""}"`);
      } catch {/* noop */}
    }
  }

  // Tüm <a href> içinde "sayfa" geçenleri listele
  const allHrefs = await page.locator("a").evaluateAll(
    (els) => els
      .map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
      .filter((h) => /sayfa|page/i.test(h)),
  );
  console.log(`\n  href'inde 'sayfa' veya 'page' geçen ${allHrefs.length} link:`);
  for (const h of allHrefs.slice(0, 20)) console.log(`    ${h}`);

  // 2) ?sayfa=2 dene
  console.log("\n  → ?sayfa=2 deneniyor");
  const sayfa2Url = SITE_BASE_URL + "/Siparislerim.asp?sayfa=2";
  try {
    const resp = await page.goto(sayfa2Url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    console.log(`  Status: ${resp?.status()}`);
    await page.waitForTimeout(1000);
    const rows2 = await page.locator("table#sort tbody tr").count();
    console.log(`  Sayfa 2: ${rows2} sipariş satırı`);
    await dumpPage(page, phaseDir, "page-2-via-sayfa-query");

    // sayfa 2'deki ilk orderNo sayfa 1'deki ilk orderNo'dan farklı mı?
    if (rows2 > 0) {
      const firstOrderNo = (await page.locator("table#sort tbody tr td:nth-child(1)").first().textContent())?.trim();
      console.log(`  Sayfa 2 ilk orderNo: ${firstOrderNo}`);
    }
  } catch (e) {
    console.log(`  ?sayfa=2 hata: ${(e as Error).message}`);
  }

  // 3) ?sayfa=99 (out-of-range) dene
  console.log("\n  → ?sayfa=99 (out-of-range) deneniyor");
  try {
    const resp = await page.goto(SITE_BASE_URL + "/Siparislerim.asp?sayfa=99", { waitUntil: "domcontentloaded", timeout: 10_000 });
    console.log(`  Status: ${resp?.status()}`);
    await page.waitForTimeout(800);
    const rows99 = await page.locator("table#sort tbody tr").count();
    console.log(`  Sayfa 99: ${rows99} sipariş satırı (out-of-range bekleniyor)`);
    await dumpPage(page, phaseDir, "page-99-out-of-range");
  } catch (e) {
    console.log(`  ?sayfa=99 hata: ${(e as Error).message}`);
  }
}

async function phaseCatalog(page: Page) {
  console.log("\n=== Phase: catalog ===");
  const phaseDir = path.join(DIAG_ROOT, "catalog");
  const catalogPath = await tryGoto(page, CATALOG_PATHS);
  if (!catalogPath) {
    console.error("  ❌ Catalog URL bulunamadı; constants'ı genişlet veya sayfa keşfi yap");
    await dumpPage(page, phaseDir, "catalog-not-found");
    return;
  }
  await page.waitForTimeout(2000);
  await dumpPage(page, phaseDir, "01-catalog-list");

  // İlk ürün resmini test et (image scrape edilebilir mi kontrol)
  const imgCount = await page.locator("img").count();
  console.log(`  Sayfa toplam <img> sayısı: ${imgCount}`);
  const firstImg = await page.locator("img").first().getAttribute("src").catch(() => null);
  console.log(`  İlk img src: ${firstImg ?? "(yok)"}`);
}

async function main() {
  const { phase, headed } = parseArgs();
  console.log(`🚀 Yedekler diag — phase: ${phase}, headed: ${headed}`);
  console.log(`📁 Output: ${DIAG_ROOT}/<phase>/`);

  await fs.mkdir(DIAG_ROOT, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    if (phase === "login" || phase === "all") {
      const ok = await phaseLogin(page);
      if (!ok && phase === "all") {
        console.error("  ❌ Login başarısız → diğer phase'ler atlanıyor");
        return;
      }
    } else {
      // Diğer phase'ler için önce login gerek
      const ok = await phaseLogin(page);
      if (!ok) {
        console.error("  ❌ Login başarısız; phase çalıştırılamıyor");
        return;
      }
    }

    if (phase === "orders" || phase === "all") await phaseOrders(page);
    if (phase === "order-detail" || phase === "all") await phaseOrderDetail(page);
    if (phase === "orders-pagination" || phase === "all") await phaseOrdersPagination(page);
    if (phase === "catalog" || phase === "all") await phaseCatalog(page);

    console.log("\n✅ Diag complete. Artifact'ları incele ve yedekler.constants.ts'i refine et.");
  } catch (e) {
    console.error(`\n❌ Diag error: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
