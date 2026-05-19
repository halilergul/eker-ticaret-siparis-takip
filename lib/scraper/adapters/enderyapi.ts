/**
 * Enderyapi B2B adapter — b2b.enderyapi.com.tr için.
 *
 * Site yapısı (002 PoC ile keşfedildi):
 *   - SPA (React/Vue), login AJAX + JS redirect
 *   - Sipariş listesi: /tr veya /siparislerim
 *   - Sipariş detay: /tr/siparis-detay?id=<numeric>
 *   - Ürün katalog: 3. seviye, henüz keşfedilmedi (US2 task T022'de keşif)
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { loadCredentials } from "@/scripts/scrape/credentials";
import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  LOGIN_SELECTORS,
  ORDER_LIST_SELECTORS,
  PRODUCT_DETAIL_SELECTORS,
  TIMEOUTS,
} from "@/scripts/scrape/constants";
import { detectCaptcha, detect2FA } from "@/scripts/scrape/detection";
import { parseTrPrice } from "@/scripts/scrape/price-parse";

import { ScrapeError, type FailureMode } from "../errors";
import type {
  Adapter,
  CatalogScrapeResult,
  CatalogScrapeTarget,
  RawOrderDetail,
  RawOrderItem,
  RawOrderSummary,
  ScrapeContext,
} from "../types";
import type { Page } from "playwright";

async function tryFindSelector(
  page: Page,
  selectors: readonly string[],
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      const count = await el.count();
      if (count > 0 && (await el.isVisible().catch(() => false))) {
        return selector;
      }
    } catch {
      // sonraki adaya geç
    }
  }
  return null;
}

async function saveDebugScreenshot(
  page: Page,
  debugDir: string,
  label: string,
): Promise<string | null> {
  try {
    await fs.mkdir(debugDir, { recursive: true });
    const filePath = path.join(debugDir, `${label}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  } catch {
    return null;
  }
}

function vlog(ctx: ScrapeContext, msg: string): void {
  if (ctx.verbose) process.stderr.write(`[enderyapi] ${msg}\n`);
}

function parseTrDate(text: string): string | null {
  // "DD.MM.YYYY" veya "DD/MM/YYYY" → ISO
  const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo}-${d}T00:00:00Z`;
  }
  // ISO veya "YYYY-MM-DD"
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`;
  }
  return null;
}

async function login(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  vlog(ctx, "Login sayfasına gidiliyor");

  const creds = loadCredentials("enderyapi");

  // 1) Login sayfası açma
  let landedOnLogin = false;
  for (const candidatePath of LOGIN_PATHS) {
    const url = `${SITE_BASE_URL}${candidatePath}`;
    try {
      const response = await page.goto(url, {
        timeout: TIMEOUTS.NAVIGATION_MS,
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() < 400) {
        vlog(ctx, `Login candidate path başarılı: ${candidatePath}`);
        landedOnLogin = true;
        break;
      }
    } catch (err) {
      vlog(ctx, `Login candidate ${candidatePath} başarısız: ${String(err)}`);
    }
  }

  if (!landedOnLogin) {
    throw new ScrapeError({ mode: "network", step: "navigate-login" });
  }

  // 2) Erken CAPTCHA kontrolü
  const earlyCaptcha = await detectCaptcha(page);
  if (earlyCaptcha) {
    await saveDebugScreenshot(page, ctx.debugDir, "login-captcha");
    throw new ScrapeError({
      mode: "captcha",
      step: "pre-login",
      details: `tip: ${earlyCaptcha.kind}`,
    });
  }

  // 3) Form bulma
  const usernameSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.USERNAME_INPUTS,
  );
  const passwordSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.PASSWORD_INPUTS,
  );
  const submitSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.SUBMIT_BUTTONS,
  );

  if (!usernameSelector || !passwordSelector) {
    await saveDebugScreenshot(page, ctx.debugDir, "login-form-missing");
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "login-form-find",
      details: `username=${!!usernameSelector}, password=${!!passwordSelector}`,
    });
  }

  vlog(
    ctx,
    `Form bulundu (u=${usernameSelector}, p=${passwordSelector}, submit=${submitSelector ?? "yok — Enter fallback"})`,
  );

  // 4) Doldur + submit
  await page.fill(usernameSelector, creds.username);
  await page.fill(passwordSelector, creds.password);

  const urlBeforeSubmit = page.url();
  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(passwordSelector, "Enter");
  }

  // 5) Login tamamlanması — URL change + networkidle
  try {
    await page.waitForURL(
      (url) => {
        const u = String(url).toLowerCase();
        return !LOGIN_PATHS.some((p) => u.includes(p.toLowerCase()));
      },
      { timeout: TIMEOUTS.LOGIN_MS },
    );
    vlog(ctx, "URL değişti, login başarılı görünüyor");
  } catch {
    vlog(ctx, "URL değişmedi, networkidle bekleniyor");
    await page
      .waitForLoadState("networkidle", { timeout: 5_000 })
      .catch(() => undefined);
  }

  // 6) Post-submit kontrolleri
  const captchaAfter = await detectCaptcha(page);
  if (captchaAfter) {
    await saveDebugScreenshot(page, ctx.debugDir, "login-captcha-post");
    throw new ScrapeError({
      mode: "captcha",
      step: "post-login",
      details: `tip: ${captchaAfter.kind}`,
    });
  }

  const urlAfterSubmit = page.url();
  const stillOnLoginPath = LOGIN_PATHS.some((p) =>
    urlAfterSubmit.toLowerCase().includes(p.toLowerCase()),
  );

  if (!stillOnLoginPath && urlAfterSubmit !== urlBeforeSubmit) {
    vlog(ctx, `Login başarılı, URL: ${urlAfterSubmit}`);
    if (ctx.verbose) await saveDebugScreenshot(page, ctx.debugDir, "login-ok");
    return;
  }

  // 2FA mı, login-fail mi?
  const tfa = await detect2FA(page);
  if (tfa) {
    await saveDebugScreenshot(page, ctx.debugDir, "login-2fa");
    throw new ScrapeError({
      mode: "2fa-required",
      step: "post-login",
      details: `alan: ${tfa.method}`,
    });
  }

  await saveDebugScreenshot(page, ctx.debugDir, "login-failed");
  throw new ScrapeError({
    mode: "login-failed",
    step: urlAfterSubmit === urlBeforeSubmit ? "no-redirect" : "still-on-login-path",
  });
}

async function navigateToOrdersPage(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  vlog(ctx, "Sipariş listesi sayfasına gidiliyor");

  for (const candidatePath of ORDER_HISTORY_PATHS) {
    const url = `${SITE_BASE_URL}${candidatePath}`;
    try {
      const response = await page.goto(url, {
        timeout: TIMEOUTS.NAVIGATION_MS,
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() < 400) {
        await page
          .waitForLoadState("networkidle", { timeout: 8_000 })
          .catch(() => undefined);
        const rowSelector = await tryFindSelector(
          page,
          ORDER_LIST_SELECTORS.ROW_CONTAINERS,
        );
        if (rowSelector) {
          vlog(ctx, `Sipariş listesi: ${candidatePath} (selector=${rowSelector})`);
          return;
        }
      }
    } catch (err) {
      vlog(ctx, `Orders ${candidatePath} başarısız: ${String(err).slice(0, 100)}`);
    }
  }

  await saveDebugScreenshot(page, ctx.debugDir, "orders-page-not-found");
  throw new ScrapeError({
    mode: "unexpected-dom",
    step: "orders-page-navigate",
  });
}

async function listOrders(
  ctx: ScrapeContext,
  limit?: number,
): Promise<RawOrderSummary[]> {
  await navigateToOrdersPage(ctx);
  const { page } = ctx;

  vlog(ctx, "Sipariş satırları parse ediliyor");
  const rowSelector = await tryFindSelector(
    page,
    ORDER_LIST_SELECTORS.ROW_CONTAINERS,
  );
  if (!rowSelector) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "orders-row-selector",
    });
  }

  const rows = await page.locator(rowSelector).all();
  vlog(ctx, `${rows.length} satır bulundu`);
  if (rows.length === 0) {
    throw new ScrapeError({ mode: "empty-history", step: "no-rows" });
  }

  const results: RawOrderSummary[] = [];
  const max = limit && limit > 0 ? Math.min(limit, rows.length) : rows.length;

  for (let i = 0; i < max; i++) {
    const row = rows[i];
    if (!row) continue;

    try {
      const rowText = (await row.textContent()) ?? "";
      const cells = await row.locator("td, [class*='cell']").allTextContents();

      // detail link: href içinde `id=<n>` veya `/tr/siparis-detay?id=...`
      const linkEl = row.locator("a").first();
      const linkHref = await linkEl.getAttribute("href").catch(() => null);
      const detailUrl = linkHref
        ? linkHref.startsWith("http")
          ? linkHref
          : `${SITE_BASE_URL}${linkHref}`
        : undefined;

      // order_no: cell array'inin ilk metin hücresi (ESP018xxxx pattern beklenir)
      // veya detailUrl'deki id parametresi
      let orderNo = "";
      for (const cell of cells) {
        const t = cell.trim();
        // ESP018-12345 veya ESP019-XXXX gibi pattern'lar; sayı + harf
        if (/^[A-Z]{2,4}[\d-]+/.test(t) || /^\d{6,}$/.test(t)) {
          orderNo = t;
          break;
        }
      }
      if (!orderNo && detailUrl) {
        const idMatch = detailUrl.match(/[?&]id=(\d+)/);
        if (idMatch) orderNo = `ID-${idMatch[1]}`;
      }
      if (!orderNo) {
        vlog(ctx, `Satır ${i + 1}: order_no bulunamadı, atlanıyor`);
        continue;
      }

      // status: "Onaylandı", "Onay bekliyor", "İptal" vb.
      let status = "Bilinmiyor";
      for (const cell of cells) {
        const t = cell.trim();
        if (/onayland[ıi]|onay bekliyor|iptal|teslim|hazırlan[ıi]yor/i.test(t)) {
          status = t;
          break;
        }
      }

      // ordered_at: tarih hücresi
      let orderedAt: string | null = null;
      for (const cell of cells) {
        const parsed = parseTrDate(cell.trim());
        if (parsed) {
          orderedAt = parsed;
          break;
        }
      }
      if (!orderedAt) {
        const m = rowText.match(/(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/);
        if (m) orderedAt = parseTrDate(m[0]);
      }
      if (!orderedAt) {
        vlog(ctx, `Satır ${i + 1}: tarih bulunamadı, atlanıyor (orderNo=${orderNo})`);
        continue;
      }

      // total_amount: ilk fiyat-like değer
      let totalAmount: number | null = null;
      const priceMatches = rowText.match(/[\d.]+,\d{2}\s*(?:₺|TL|TRY)?/g);
      if (priceMatches && priceMatches.length > 0) {
        // Sipariş listesinde genelde son hücre toplam tutar; son fiyatı al
        const last = priceMatches[priceMatches.length - 1];
        if (last) {
          totalAmount = parseTrPrice(last);
        }
      }
      if (totalAmount === null) {
        vlog(ctx, `Satır ${i + 1}: tutar bulunamadı, 0 ile devam (orderNo=${orderNo})`);
        totalAmount = 0;
      }

      results.push({
        orderNo,
        status,
        orderedAt,
        totalAmount,
        detailUrl,
      });
    } catch (err) {
      vlog(ctx, `Satır ${i + 1} parse hata: ${String(err).slice(0, 100)}`);
    }
  }

  if (results.length === 0) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "orders-parse-all-failed",
      details: `${rows.length} satır, hiçbiri parse edilemedi`,
    });
  }

  vlog(ctx, `${results.length} sipariş başlığı parse edildi`);
  return results;
}

async function getOrderDetail(
  ctx: ScrapeContext,
  order: RawOrderSummary,
): Promise<RawOrderDetail> {
  const { page } = ctx;

  if (!order.detailUrl) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "order-detail-no-url",
      details: `orderNo=${order.orderNo}`,
    });
  }

  vlog(ctx, `Detay sayfası: ${order.detailUrl}`);
  await page.goto(order.detailUrl, {
    timeout: TIMEOUTS.NAVIGATION_MS,
    waitUntil: "domcontentloaded",
  });
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);

  // Ürün satırları: detay sayfası tablosundaki her tr bir ürün
  const itemRowSelectors = [
    "table tbody tr",
    '[class*="order-item" i]',
    '[class*="urun" i]',
    '[class*="product-row" i]',
    'tr[class*="row" i]',
  ];

  let itemRowSelector: string | null = null;
  for (const s of itemRowSelectors) {
    const count = await page.locator(s).count();
    if (count > 0) {
      itemRowSelector = s;
      break;
    }
  }

  if (!itemRowSelector) {
    await saveDebugScreenshot(page, ctx.debugDir, `detail-${order.orderNo}-no-rows`);
    ctx.pushError(
      "order-detail",
      "unexpected-dom",
      `orderNo=${order.orderNo}: ürün satırı bulunamadı`,
    );
    return { summary: order, items: [] };
  }

  const rows = await page.locator(itemRowSelector).all();
  const items: RawOrderItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    try {
      const cells = await row.locator("td, [class*='cell']").allTextContents();
      const cleanCells = cells.map((c) => c.trim()).filter((c) => c.length > 0);
      if (cleanCells.length < 3) continue;

      // Catalog URL bayipro DOM'unda anchor'da href yok (Vue @click). Pass 2'de tıkla.
      const catalogUrl: string | null = null;

      // Heuristik:
      //  - product_code: ilk metin-hücre, alfanumerik
      //  - product_name: ikinci uzun metin hücre
      //  - quantity: sayı + birim (adet, kg, m)
      //  - unit_price: TR fiyat formatı
      let productCode = "";
      let productName = "";
      let quantity = 0;
      let unitPriceAtOrder: number | null = null;

      const pricesInRow: number[] = [];
      const textCells: string[] = [];

      for (const cell of cleanCells) {
        // Fiyat?
        if (/[\d.]+,\d{2}/.test(cell)) {
          const p = parseTrPrice(cell);
          if (p !== null && p > 0) pricesInRow.push(p);
          continue;
        }
        // Sayı + birim?
        const qtyMatch = cell.match(/^(\d+([.,]\d+)?)\s*(adet|kg|m|metre)?$/i);
        if (qtyMatch && qtyMatch[1]) {
          const num = parseFloat(qtyMatch[1].replace(",", "."));
          if (!isNaN(num) && quantity === 0) quantity = num;
          continue;
        }
        // Tarih → atla
        if (/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(cell)) continue;
        // Metin
        if (cell.length >= 2) textCells.push(cell);
      }

      // İlk text = code, ikinci = name (en yaygın B2B tablo formatı)
      if (textCells.length >= 1) productCode = textCells[0] ?? "";
      if (textCells.length >= 2) productName = textCells[1] ?? productCode;
      else productName = productCode;

      // Birim fiyat: pricesInRow'da en küçük olan (toplam değil); yoksa ilki
      if (pricesInRow.length > 1) {
        unitPriceAtOrder = Math.min(...pricesInRow);
      } else if (pricesInRow.length === 1) {
        unitPriceAtOrder = pricesInRow[0] ?? null;
      }

      if (!productCode || !productName || quantity <= 0 || unitPriceAtOrder === null) {
        continue;
      }

      items.push({
        productCode,
        productName,
        quantity,
        unitPriceAtOrder,
        catalogUrl,
      });
      if (catalogUrl) {
        vlog(ctx, `  ↳ ${productCode} catalog link: ${catalogUrl}`);
      }
    } catch (err) {
      vlog(ctx, `Detail satır ${i + 1} hata: ${String(err).slice(0, 100)}`);
    }
  }

  vlog(ctx, `${items.length} ürün satırı parse edildi (orderNo=${order.orderNo})`);

  // Pass 2: catalog URL keşfi (anchor click + URL capture + goBack)
  // Sipariş detay sayfasında ürün adı anchor'unda href yok (Vue @click).
  // Her satır için tıkla, ürün detay URL'sini al, geri dön.
  for (let i = 0; i < items.length; i++) {
    const currentItem = items[i];
    if (!currentItem || currentItem.catalogUrl) continue;

    try {
      // goBack sonrası rows[] stale olabilir; her seferinde fresh locate et
      const freshRows = await page.locator(itemRowSelector).all();
      const freshRow = freshRows[i];
      if (!freshRow) continue;

      const anchor = freshRow.locator(`.bs-pt-name a, a[title]`).first();
      if ((await anchor.count()) === 0) {
        vlog(ctx, `  ↳ ${currentItem.productCode} anchor bulunamadı`);
        continue;
      }

      const beforeUrl = page.url();
      await anchor.click({ timeout: 3000 });
      await page
        .waitForURL(/-p-\d+/, { timeout: 8000 })
        .catch(() => undefined);
      const afterUrl = page.url();

      if (afterUrl !== beforeUrl && /-p-\d+/.test(afterUrl)) {
        currentItem.catalogUrl = afterUrl;
        vlog(ctx, `  ↳ ${currentItem.productCode} catalog: ${afterUrl}`);
      } else {
        vlog(
          ctx,
          `  ↳ ${currentItem.productCode} click sonrası URL değişmedi (before=${beforeUrl}, after=${afterUrl})`,
        );
      }

      // Geri dön — sipariş detay sayfasına dönmek için
      if (afterUrl !== beforeUrl) {
        await page
          .goBack({ waitUntil: "networkidle", timeout: 10000 })
          .catch(() => undefined);
        await page.waitForTimeout(500);
      }
    } catch (err) {
      vlog(
        ctx,
        `  ↳ ${currentItem.productCode} URL discovery fail: ${err instanceof Error ? err.message.slice(0, 120) : err}`,
      );
    }
  }

  return { summary: order, items };
}

async function getProductPrice(
  ctx: ScrapeContext,
  productCode: string,
): Promise<number | null> {
  // Eski PoC method'u. 006'dan itibaren scrapeCatalog kullanılır.
  vlog(
    ctx,
    `getProductPrice(${productCode}) deprecated — scrapeCatalog kullanın`,
  );
  return null;
}

// Enderyapı catalog URL pattern: /tr/<slug>-p-<numeric-id>
// Bu pattern ürün kodundan (örn. "118 049") doğrudan üretilemez — bağ kurulamıyor.
// İlk keşifte site search kullanılır, sonuç URL'i products.catalog_url'a cache'lenir.

// Enderyapı (bayipro.com platform) — DOM yapısı CSS class id'li hücreler.
// Sayfa HTML'inde her field şu yapıda:
//   <X title="Liste Fiyatı" class="normalprice-id Cell">VALUE</X>
//   <X title="KDV'siz Net Fiyat" class="price-id Cell">VALUE</X>
//   <X title="KDV" class="tax-id Cell">VALUE</X>
//   <X title="İskonto" class="discount-id Cell">VALUE</X>
//   <X class="stock-id stock-id_<id>_0 Cell">VALUE</X>
const FIELD_CSS = {
  listPrice: ".normalprice-id",
  netExclVat: ".price-id",
  vat: ".tax-id",
  discount: ".discount-id",
  stock: ".stock-id",
} as const;

function parsePriceFromLabel(raw: string | null | undefined): number | null {
  if (!raw) return null;
  return parseTrPrice(raw);
}

function parseVatRate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const pct = Number(m[1]!.replace(",", "."));
  return Number.isFinite(pct) ? pct / 100 : null;
}

async function findFieldValue(
  ctx: ScrapeContext,
  labels: readonly string[],
  pageText?: string,
): Promise<string | null> {
  // Strategy 1: Full page text + regex (most robust against custom DOM)
  if (pageText) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        // "Label: value" or "Label\nvalue"
        new RegExp(
          `${escaped}\\s*[:\\n]\\s*([+\\-]?[0-9][0-9.,%+\\-\\s]*(?:TL|₺|%)?)`,
          "i",
        ),
        // "Label   value" (multiple whitespace, single line)
        new RegExp(`${escaped}\\s{2,}([+\\-]?[0-9][0-9.,%+\\-\\s]*)`, "i"),
        // Marka için harf değer (Liste Fiyatı/KDV'siz Net Fiyat için çalışmaz):
        new RegExp(`${escaped}\\s*[:\\n]\\s*([A-Za-zÀ-ÿ0-9][^\\n]{0,40})`, "i"),
      ];
      for (const pat of patterns) {
        const m = pageText.match(pat);
        if (m && m[1]) {
          const val = m[1].trim().split("\n")[0]!.trim();
          if (val && val.length > 0 && val.length < 80) return val;
        }
      }
    }
  }

  // Strategy 2: xpath fallback
  for (const label of labels) {
    const xpathQueries = [
      `//td[normalize-space()="${label}"]/following-sibling::td[1]`,
      `//dt[normalize-space()="${label}"]/following-sibling::dd[1]`,
      `//*[normalize-space(text())="${label}" or normalize-space(text())="${label}:"]/following-sibling::*[1]`,
      `//*[contains(normalize-space(.), "${label}")]/following-sibling::*[1]`,
    ];
    for (const q of xpathQueries) {
      try {
        const value = await ctx.page
          .locator(`xpath=${q}`)
          .first()
          .textContent({ timeout: 1000 });
        if (value?.trim()) return value.trim();
      } catch {
        // try next
      }
    }
  }
  return null;
}

async function dumpPageHtml(
  ctx: ScrapeContext,
  productCode: string,
): Promise<string | null> {
  try {
    const html = await ctx.page.content();
    const safeName = productCode.replace(/[^a-zA-Z0-9_-]/g, "_");
    await fs.mkdir(ctx.debugDir, { recursive: true });
    const filePath = path.join(ctx.debugDir, `catalog-${safeName}.html`);
    await fs.writeFile(filePath, html, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

async function navigateDirect(
  ctx: ScrapeContext,
  url: string,
): Promise<boolean> {
  vlog(ctx, `catalog: direct nav → ${url}`);
  try {
    // domcontentloaded yeterli: aşağıdaki FIELD_INDICATORS waitFor (20s) zaten
    // SPA render'ını doğruluyor. networkidle Vue/Nuxt'ta arka plan istekleri
    // yüzünden ürün başına 5-10sn fazladan bekletiyordu.
    const response = await ctx.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (!response || response.status() === 404) {
      vlog(ctx, `catalog: response ${response?.status() ?? "null"}`);
      return false;
    }

    // Vue/Nuxt SPA — content lazy render. Birkaç olası field label'ından
    // herhangi biri görünene kadar bekle (max 20sn).
    const FIELD_INDICATORS = [
      "KDV'siz Net Fiyat",
      "KDVsiz Net Fiyat",
      "Liste Fiyatı",
      "Liste Fiyati",
      "Ürün Kodu",
      "Stok",
    ];
    const orXpath = FIELD_INDICATORS.map(
      (label) => `contains(normalize-space(.), "${label}")`,
    ).join(" or ");
    try {
      await ctx.page
        .locator(`xpath=//*[${orXpath}]`)
        .first()
        .waitFor({ timeout: 20000, state: "attached" });
      vlog(ctx, `catalog: field indicator render oldu`);
    } catch {
      vlog(ctx, `catalog: 20sn içinde hiçbir field indicator gelmedi`);
    }

    // Scroll down + up — intersection observer / lazy-load tetiklemek için
    await ctx.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await ctx.page.waitForTimeout(800);
    await ctx.page.evaluate(() => window.scrollTo(0, 0));
    await ctx.page.waitForTimeout(800);

    return true;
  } catch (err) {
    vlog(ctx, `catalog: direct nav exception: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Site search box'ını kullanarak ürün kodu ile arama yapar, ilk sonuç linkine
 * tıklayıp ürün detay sayfasını açar. Başarılıysa final URL döner; aksi halde null.
 *
 * Enderyapı SPA — search box muhtemelen tüm sayfalarda var (`#inputsearchh-0`).
 * Arama sonucu dropdown veya yeni sayfa olabilir; iki senaryoyu da deniyoruz.
 */
async function navigateBySearch(
  ctx: ScrapeContext,
  productCode: string,
): Promise<string | null> {
  // Ana sayfaya/login sonrasındaki sayfaya emin ol — search box her yerde olsa da
  // navigation history temiz başlasın.
  try {
    const currentUrl = ctx.page.url();
    if (!currentUrl.includes("enderyapi.com.tr")) {
      await ctx.page.goto(`${SITE_BASE_URL}/tr`, {
        waitUntil: "networkidle",
        timeout: 15000,
      });
    }

    const searchSelectors = [
      "#inputsearchh-0",
      `input[placeholder*="Arama" i]`,
      `input[type="text"][placeholder*="arama" i]`,
    ];
    let searchInput = null;
    for (const sel of searchSelectors) {
      const loc = ctx.page.locator(sel).first();
      if ((await loc.count()) > 0) {
        searchInput = loc;
        vlog(ctx, `catalog: search input found via ${sel}`);
        break;
      }
    }
    if (!searchInput) {
      vlog(ctx, `catalog: search input bulunamadı`);
      return null;
    }

    await searchInput.click();
    await searchInput.fill("");
    await searchInput.type(productCode, { delay: 40 });
    vlog(ctx, `catalog: aranıyor → "${productCode}"`);

    // İki senaryo: (1) dropdown'da ilk sonuç linkleniyor (2) Enter sonra arama sayfası
    // Dropdown ilk: kısa bir bekleme + ilk link tıklama
    await ctx.page.waitForTimeout(1200);

    // Olasılık 1: dropdown linkleri — `a[href*="-p-"]` veya benzeri
    const dropdownLinks = ctx.page.locator(`a[href*="-p-"]`);
    const dropdownCount = await dropdownLinks.count();
    if (dropdownCount > 0) {
      vlog(ctx, `catalog: dropdown'da ${dropdownCount} link bulundu, ilki tıklanıyor`);
      const href = await dropdownLinks.first().getAttribute("href");
      if (href) {
        const absoluteUrl = href.startsWith("http")
          ? href
          : `${SITE_BASE_URL}${href}`;
        await Promise.all([
          ctx.page.waitForURL(/-p-\d+/, { timeout: 15000 }).catch(() => null),
          dropdownLinks.first().click(),
        ]);
        await ctx.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
        const finalUrl = ctx.page.url();
        if (finalUrl.match(/-p-\d+/)) {
          vlog(ctx, `catalog: search nav → ${finalUrl}`);
          return finalUrl;
        }
        // Doğrudan navigate dene
        if (absoluteUrl.match(/-p-\d+/)) {
          const ok = await navigateDirect(ctx, absoluteUrl);
          if (ok) return absoluteUrl;
        }
      }
    }

    // Olasılık 2: Enter sonrası arama sonuç sayfası
    vlog(ctx, `catalog: dropdown sonuç yok, Enter denenir`);
    await searchInput.press("Enter");
    await ctx.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
    await ctx.page.waitForTimeout(800);

    const resultLinks = ctx.page.locator(`a[href*="-p-"]`);
    const resultCount = await resultLinks.count();
    if (resultCount > 0) {
      vlog(ctx, `catalog: sonuç sayfasında ${resultCount} link, ilki açılıyor`);
      const href = await resultLinks.first().getAttribute("href");
      if (href) {
        const absoluteUrl = href.startsWith("http")
          ? href
          : `${SITE_BASE_URL}${href}`;
        const ok = await navigateDirect(ctx, absoluteUrl);
        if (ok) return absoluteUrl;
      }
    }

    return null;
  } catch (err) {
    vlog(ctx, `catalog: search nav exception: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function scrapeCatalog(
  ctx: ScrapeContext,
  targets: CatalogScrapeTarget[],
): Promise<CatalogScrapeResult[]> {
  const results: CatalogScrapeResult[] = [];

  for (const target of targets) {
    const code = target.productCode;
    try {
      let resolvedUrl: string | null = null;

      // Önce cache'den dene
      if (target.catalogUrl) {
        const ok = await navigateDirect(ctx, target.catalogUrl);
        if (ok) {
          resolvedUrl = target.catalogUrl;
          vlog(ctx, `catalog: cache hit ${code} → ${resolvedUrl}`);
        } else {
          vlog(ctx, `catalog: cache miss for ${code}, search'e düşülüyor`);
        }
      }

      // Cache yoksa veya geçersizse search ile bul
      if (!resolvedUrl) {
        resolvedUrl = await navigateBySearch(ctx, code);
      }

      if (!resolvedUrl) {
        results.push({
          ok: false,
          productCode: code,
          mode: "product-not-found",
          message: "Catalog detay sayfası açılamadı (direct + search ikisi de başarısız)",
        });
        continue;
      }

      const productNameRaw = await ctx.page
        .locator("h1")
        .first()
        .textContent({ timeout: 2000 })
        .catch(() => null);

      // CSS class id'li hücrelerden değerleri çek
      const readCell = async (sel: string): Promise<string | null> => {
        try {
          return (
            await ctx.page
              .locator(sel)
              .first()
              .textContent({ timeout: 3000 })
          )?.trim() ?? null;
        } catch {
          return null;
        }
      };

      const listPriceRaw = await readCell(FIELD_CSS.listPrice);
      const netExclVatRaw = await readCell(FIELD_CSS.netExclVat);
      const vatRaw = await readCell(FIELD_CSS.vat);
      const discountRaw = await readCell(FIELD_CSS.discount);

      // Marka — sayfada banner ya da link içinde olabilir; SEGNAN.jpg alt text dump'ta görünüyor.
      // Bazı ürün sayfalarında bu selector hiç yok → 30sn default timeout'a düşmesin diye
      // 1sn'lik tight budget. Marka kritik değil, null bile döndürülebilir.
      const brandRaw = await ctx.page
        .locator(`[alt][title]`)
        .filter({
          hasNot: ctx.page.locator(`img[alt*="logo" i]`),
        })
        .first()
        .getAttribute("title", { timeout: 1000 })
        .catch(() => null);

      // Ürün görseli — bayipro CDN (images.bayipro.com) üzerinden public.
      // SPA olduğu için DOM evaluate ile en uygun adayı seç: src bayipro CDN'inde
      // olsun, logo/banner içermesin, src "product" veya ürün kodu içersin.
      const imageUrl: string | null = await ctx.page
        .evaluate((codeArg) => {
          const imgs = Array.from(document.querySelectorAll("img"));
          for (const img of imgs) {
            const src = img.getAttribute("src") ?? "";
            const alt = (img.getAttribute("alt") ?? "").toLowerCase();
            if (!src) continue;
            // Skip logos, banners, data URIs
            if (/^data:/i.test(src)) continue;
            if (/logo/i.test(src) || /banner/i.test(src)) continue;
            if (alt.includes("logo") || alt.includes("banner")) continue;
            // Tercih: bayipro CDN ürün görselleri
            if (/images\.bayipro\.com/.test(src) && /products?/i.test(src)) {
              return src;
            }
          }
          // 2. tercih: bayipro CDN'de herhangi bir uygun img (Product hariç)
          for (const img of imgs) {
            const src = img.getAttribute("src") ?? "";
            if (!src || /^data:/i.test(src)) continue;
            if (/logo/i.test(src) || /banner/i.test(src)) continue;
            if (/images\.bayipro\.com/.test(src)) {
              const codeNorm = codeArg.toLowerCase().replace(/\s+/g, "");
              if (src.toLowerCase().includes(codeNorm)) return src;
            }
          }
          return null;
        }, code)
        .catch(() => null);

      vlog(
        ctx,
        `catalog: raw netExclVat=${netExclVatRaw ?? "null"}, vat=${vatRaw ?? "null"}, list=${listPriceRaw ?? "null"}, brand=${brandRaw ?? "null"}, discount=${discountRaw ?? "null"}, image=${imageUrl ?? "null"}`,
      );

      const unitPriceExclVat = parsePriceFromLabel(netExclVatRaw);
      const vatRate = parseVatRate(vatRaw);
      const listPrice = parsePriceFromLabel(listPriceRaw);

      if (unitPriceExclVat === null) {
        const dumped = await dumpPageHtml(ctx, code);
        results.push({
          ok: false,
          productCode: code,
          mode: "catalog-parse-failed",
          message: `KDV'siz Net Fiyat parse edilemedi (raw: ${netExclVatRaw ?? "null"})${dumped ? `; HTML dump: ${dumped}` : ""}`,
        });
        continue;
      }
      if (vatRate === null) {
        const dumped = await dumpPageHtml(ctx, code);
        results.push({
          ok: false,
          productCode: code,
          mode: "vat-rate-missing",
          message: `KDV oranı parse edilemedi (raw: ${vatRaw ?? "null"})${dumped ? `; HTML dump: ${dumped}` : ""}`,
        });
        continue;
      }

      const unitPriceWithVat = Number(
        (unitPriceExclVat * (1 + vatRate)).toFixed(2),
      );

      results.push({
        ok: true,
        productCode: code,
        catalogUrl: resolvedUrl,
        productName: productNameRaw?.trim(),
        brand: brandRaw?.trim() || undefined,
        listPrice,
        discountText: discountRaw?.trim() || null,
        unitPriceExclVat,
        vatRate,
        unitPriceWithVat,
        imageUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ok: false,
        productCode: code,
        mode: "catalog-parse-failed",
        message,
      });
    }
  }

  return results;
}

export const enderyapiAdapter: Adapter = {
  slug: "enderyapi",
  displayName: "Enderyapi B2B",
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,
  scrapeCatalog,
};

// Public export to silence unused warning + allow direct imports if needed
export const _selectorsForReference = PRODUCT_DETAIL_SELECTORS;
