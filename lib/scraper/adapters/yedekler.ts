/**
 * Yedekler İnşaat B2B adapter — https://bayi.yedekler.com.tr için.
 *
 * Site yapısı (Feature 010 — diag 2026-06-04 ile doğrulandı):
 *   - Platform: Classic ASP (Login.asp, Siparislerim.asp, Urunler.asp, ...)
 *   - Login: 3-alanlı form — KullaniciAdi (Müşteri Kodu) + KullaniciKodu + Sifre
 *     loadYedeklerCredentials() helper'ı kullanılır
 *   - Protocol: HTTPS ✓
 *   - Order list table: 5 sütun (No, Tarih, Kanal, Tutar, Durum)
 *   - Order detail URL pattern: Siparislerim.asp?Pages=SiparisListele&ID=<id>
 *   - Tarih format: dd.MM.yyyy (örn. 19.06.2026)
 *   - Para format: TR locale "3.752,58 TL" (binlik nokta, ondalık virgül)
 *
 * NOT: getOrderDetail() ve scrapeCatalog() henüz implement edilmedi
 * (T013 + T024 diag çıktısı bekleniyor).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { loadYedeklerCredentials } from "@/scripts/scrape/credentials";
import { detectCaptcha, detect2FA } from "@/scripts/scrape/detection";
import { parseTrPrice } from "@/scripts/scrape/price-parse";

import { ScrapeError } from "../errors";
import type {
  Adapter,
  CatalogScrapeResult,
  CatalogScrapeTarget,
  RawOrderDetail,
  RawOrderSummary,
  ScrapeContext,
} from "../types";

import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  LOGIN_SELECTORS,
  LOGIN_SUCCESS_MARKERS,
  ORDER_LIST_SELECTORS,
  ORDER_DETAIL_SELECTORS,
  CATALOG_SELECTORS,
  CATALOG_FIRST_PAGE_PATHS,
  CATALOG_PAGE_URL_TEMPLATES,
  CATALOG_MAX_PAGES,
  DEFAULT_VAT_RATE,
} from "./yedekler.constants";

import type { Page } from "playwright";

const TIMEOUTS = {
  NAVIGATION_MS: 15_000,
  ELEMENT_WAIT_MS: 5_000,
} as const;

async function tryFindSelector(
  page: Page,
  selectors: readonly string[],
  requireVisible: boolean = true,
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      const count = await el.count();
      if (count === 0) continue;
      if (!requireVisible) return selector;
      if (await el.isVisible().catch(() => false)) return selector;
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
  if (ctx.verbose) process.stderr.write(`[yedekler] ${msg}\n`);
}

// "19.06.2026" → "2026-06-19T00:00:00Z" (TR kısa tarih → ISO).
function parseTrDateShort(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${(mo ?? "01").padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}T00:00:00Z`;
}

async function login(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  vlog(ctx, "Login sayfasına gidiliyor");

  const creds = loadYedeklerCredentials();

  // 1) Login sayfasına git
  let landed = false;
  for (const candidate of LOGIN_PATHS) {
    const url = `${SITE_BASE_URL}${candidate}`;
    try {
      const resp = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.NAVIGATION_MS,
      });
      if (resp && resp.status() < 400) {
        const hasForm = await page.locator('input[type="password"]').count();
        if (hasForm > 0) {
          vlog(ctx, `Login path başarılı: ${candidate}`);
          landed = true;
          break;
        }
      }
    } catch (e) {
      vlog(ctx, `Login candidate ${candidate} fail: ${(e as Error).message}`);
    }
  }

  if (!landed) {
    throw new ScrapeError({ mode: "network", step: "navigate-login" });
  }

  // 2) Captcha / 2FA erken kontrol
  const captcha = await detectCaptcha(page);
  if (captcha) {
    await saveDebugScreenshot(page, ctx.debugDir, "yedekler-login-captcha");
    throw new ScrapeError({
      mode: "captcha",
      step: "pre-login",
      details: `tip: ${captcha.kind}`,
    });
  }

  const twofa = await detect2FA(page);
  if (twofa) {
    throw new ScrapeError({
      mode: "2fa-required",
      step: "pre-login",
      details: "2FA tespit edildi",
    });
  }

  // 3) Form selector'larını bul
  const customerSel = await tryFindSelector(
    page,
    LOGIN_SELECTORS.CUSTOMER_CODE_INPUTS,
    false,
  );
  const userSel = await tryFindSelector(
    page,
    LOGIN_SELECTORS.USER_CODE_INPUTS,
    false,
  );
  const passSel = await tryFindSelector(
    page,
    LOGIN_SELECTORS.PASSWORD_INPUTS,
    false,
  );
  const submitSel = await tryFindSelector(page, LOGIN_SELECTORS.SUBMIT_BUTTONS);

  if (!customerSel || !userSel || !passSel || !submitSel) {
    await saveDebugScreenshot(page, ctx.debugDir, "yedekler-login-form-missing");
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "login-form-selectors",
      details: `customer=${!!customerSel}, user=${!!userSel}, pass=${!!passSel}, submit=${!!submitSel}`,
    });
  }

  // 4) Form doldur + submit (credentials ASLA log'lanmaz)
  await page.fill(customerSel, creds.customerCode);
  await page.fill(userSel, creds.userCode);
  await page.fill(passSel, creds.password);
  await page.click(submitSel);

  // 5) Redirect bekle
  await page
    .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.NAVIGATION_MS })
    .catch(() => null);
  await page.waitForTimeout(1500);

  // 6) Success doğrula
  const currentUrl = page.url();
  const urlOk = LOGIN_SUCCESS_MARKERS.URL_PATTERNS.some((p) =>
    currentUrl.includes(p),
  );
  const markerSel = await tryFindSelector(page, LOGIN_SUCCESS_MARKERS.DOM_SELECTORS);

  if (!urlOk && !markerSel) {
    await saveDebugScreenshot(page, ctx.debugDir, "yedekler-login-fail");
    throw new ScrapeError({
      mode: "login-failed",
      step: "verify",
      details: `URL=${currentUrl}; URL match=${urlOk}; marker=${markerSel ?? "none"}`,
    });
  }

  vlog(ctx, `Login başarılı: ${currentUrl}`);
}

async function navigateToOrdersPage(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  for (const candidate of ORDER_HISTORY_PATHS) {
    const url = `${SITE_BASE_URL}${candidate}`;
    try {
      const resp = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.NAVIGATION_MS,
      });
      if (resp && resp.status() < 400) {
        vlog(ctx, `Orders page açıldı: ${candidate}`);
        return;
      }
    } catch (e) {
      vlog(ctx, `Orders candidate ${candidate} fail: ${(e as Error).message}`);
    }
  }
  throw new ScrapeError({ mode: "network", step: "navigate-orders" });
}

async function listOrders(
  ctx: ScrapeContext,
  limit?: number,
): Promise<RawOrderSummary[]> {
  await navigateToOrdersPage(ctx);
  const { page } = ctx;
  await page.waitForTimeout(800);

  // Tabloyu bul
  const table = page.locator(ORDER_LIST_SELECTORS.TABLE).first();
  if ((await table.count()) === 0) {
    await saveDebugScreenshot(page, ctx.debugDir, "yedekler-orders-no-table");
    throw new ScrapeError({ mode: "unexpected-dom", step: "orders-table" });
  }

  const rows = await table.locator(ORDER_LIST_SELECTORS.ROW).all();
  vlog(ctx, `${rows.length} sipariş satırı bulundu`);

  if (rows.length === 0) {
    throw new ScrapeError({ mode: "empty-history", step: "no-rows" });
  }

  const results: RawOrderSummary[] = [];
  const max = limit && limit > 0 ? Math.min(limit, rows.length) : rows.length;

  for (let i = 0; i < max; i++) {
    try {
      const row = rows[i];
      if (!row) continue;

      // Siparislerim.asp sütun sırası: Sipariş Kodu | Tutar | Tarih | Kanal | Durum | Detaylar

      // Sipariş kodu (1. sütun, text-only)
      const orderNo = (
        (await row.locator(ORDER_LIST_SELECTORS.ORDER_NO_CELL).textContent()) ?? ""
      ).trim();

      if (!orderNo) {
        ctx.pushError(
          "parse-order-row",
          "unexpected-dom",
          `Satır ${i + 1}: orderNo boş`,
        );
        continue;
      }

      // Tutar (2. sütun): "3.752,58 TL"
      const amountText = (
        (await row.locator(ORDER_LIST_SELECTORS.TOTAL_AMOUNT_CELL).textContent()) ??
        ""
      ).trim();
      const totalAmount = parseTrPrice(amountText) ?? 0;

      // Tarih (3. sütun): "19.06.2026"
      const dateText = (
        (await row.locator(ORDER_LIST_SELECTORS.ORDERED_AT_CELL).textContent()) ?? ""
      ).trim();
      const orderedAt = parseTrDateShort(dateText);
      if (!orderedAt) {
        ctx.pushError(
          "parse-order-row",
          "unexpected-dom",
          `Satır ${i + 1}: tarih parse edilemedi (raw="${dateText}")`,
        );
        continue;
      }

      // Durum (5. sütun): "Tamamlandı" / "Bekleyen" / "İptal"
      const statusText = (
        (await row.locator(ORDER_LIST_SELECTORS.STATUS_LABEL).textContent()) ?? ""
      ).trim();

      // Detail URL (6. sütun): "Görüntüle" buton-link
      const detailEl = row.locator(ORDER_LIST_SELECTORS.DETAIL_LINK).first();
      const detailHref = (await detailEl.getAttribute("href")) ?? "";
      const detailUrl = detailHref.startsWith("http")
        ? detailHref
        : `${SITE_BASE_URL}/${detailHref.replace(/^\//, "")}`;

      results.push({
        orderNo,
        status: statusText || "Bilinmiyor",
        orderedAt,
        totalAmount,
        detailUrl,
      });
    } catch (err) {
      ctx.pushError(
        "parse-order-row",
        "unexpected-dom",
        `Satır ${i + 1}: ${(err as Error).message}`,
      );
    }
  }

  vlog(ctx, `${results.length} sipariş başarıyla parse edildi`);
  return results;
}

// "100 MT" / "5 KG" / "12 AD" → 100 / 5 / 12 (sayı kısmı parse).
function parseQuantity(raw: string): number {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^([\d.,]+)/);
  if (!m) return 0;
  return parseTrPrice(m[1]) ?? 0;
}

async function getOrderDetail(
  ctx: ScrapeContext,
  order: RawOrderSummary,
): Promise<RawOrderDetail> {
  const { page } = ctx;
  vlog(ctx, `Sipariş detayı: ${order.orderNo}`);

  if (!order.detailUrl) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "order-detail-no-url",
      details: `Sipariş ${order.orderNo} için detailUrl boş`,
    });
  }

  await page
    .goto(order.detailUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.NAVIGATION_MS,
    })
    .catch(() => null);
  await page.waitForTimeout(800);

  const tbody = page.locator(ORDER_DETAIL_SELECTORS.ITEM_TBODY).first();
  if ((await tbody.count()) === 0) {
    await saveDebugScreenshot(page, ctx.debugDir, `yedekler-detail-${order.orderNo}-no-tbody`);
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "order-detail-tbody",
      details: `Sipariş ${order.orderNo}: SepeteEklenenUrunler tbody bulunamadı`,
    });
  }

  const rows = await tbody.locator("tr").all();
  vlog(ctx, `  ${rows.length} ürün satırı bulundu`);

  const items: RawOrderDetail["items"] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      if (!row) continue;

      const productCode = (
        (await row.locator(ORDER_DETAIL_SELECTORS.PRODUCT_CODE_CELL).textContent()) ?? ""
      ).trim();
      const productName = (
        (await row.locator(ORDER_DETAIL_SELECTORS.PRODUCT_NAME_CELL).textContent()) ?? ""
      ).trim();
      const qtyText = (
        (await row.locator(ORDER_DETAIL_SELECTORS.QUANTITY_CELL).textContent()) ?? ""
      ).trim();
      const netTotalText = (
        (await row.locator(ORDER_DETAIL_SELECTORS.NET_TOTAL_CELL).textContent()) ?? ""
      ).trim();

      const quantity = parseQuantity(qtyText);
      const netTotal = parseTrPrice(netTotalText) ?? 0;

      if (!productCode || quantity <= 0) {
        ctx.pushError(
          "parse-order-item",
          "unexpected-dom",
          `${order.orderNo} satır ${i + 1}: kod="${productCode}" qty=${quantity}`,
        );
        continue;
      }

      // İskontolu Tutar = KDV hariç net toplam (Yedekler convention).
      // Birim takip değişkeni = netTotal / quantity.
      const unitPriceAtOrder = Number((netTotal / quantity).toFixed(2));

      items.push({
        productCode,
        productName,
        quantity,
        unitPriceAtOrder,
        catalogUrl: null,
        barcode: null,
      });
    } catch (err) {
      ctx.pushError(
        "parse-order-item",
        "unexpected-dom",
        `${order.orderNo} satır ${i + 1}: ${(err as Error).message}`,
      );
    }
  }

  return { summary: order, items };
}

async function getProductPrice(
  _ctx: ScrapeContext,
  _productCode: string,
): Promise<number | null> {
  // Catalog scrape kullanılır; bu method tek-fiyat sorgusu için minimum davranış.
  return null;
}

async function scrapeCatalog(
  ctx: ScrapeContext,
  targets: CatalogScrapeTarget[],
): Promise<CatalogScrapeResult[]> {
  const { page } = ctx;
  vlog(ctx, `Catalog scrape — ${targets.length} target, paginated full-scan`);

  // 2026-06-20: Search-based strateji (?F=Ara&FAdi=<kod>) Yedekler ASP'sinde
  // tüm sorgular için 500 verdi. Paginated full-scan'e pivot edildi: ~104 sayfa
  // sırayla taranır, her sayfadaki ürünler target Set'iyle match edilir.
  // Match olan ürün için snapshot oluşturulur; tüm target'ler bulunduğunda
  // erken çıkış (early exit).
  // URL: /FiyatListesi.asp default ile dener, fallback /Urunler.asp.
  //   (/Urunler.asp scrape akışında 500 dönüyor; FiyatListesi.asp aynı içeriği veriyor.)

  const targetSet = new Set(targets.map((t) => t.productCode.trim()));
  const foundCodes = new Set<string>();
  const resultMap = new Map<string, CatalogScrapeResult>();

  let pageIndex = 1;
  let consecutiveEmpty = 0;

  while (pageIndex <= CATALOG_MAX_PAGES && foundCodes.size < targetSet.size) {
    // URL fallback listesi: Yedekler ASP'de /Urunler.asp scrape akışında HTTP 500
    // dönüyor (sebep belirsiz), /FiyatListesi.asp aynı içeriği veriyor. Listede
    // ilki tercih edilir, fail durumunda sonraki denenir.
    const urls =
      pageIndex === 1
        ? CATALOG_FIRST_PAGE_PATHS.map((p) => SITE_BASE_URL + p)
        : CATALOG_PAGE_URL_TEMPLATES.map(
            (t) => SITE_BASE_URL + t.replace("{page}", String(pageIndex)),
          );

    let pageLoaded = false;
    for (const url of urls) {
      try {
        const resp = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUTS.NAVIGATION_MS,
        });
        if (resp && resp.status() < 400) {
          pageLoaded = true;
          break;
        }
      } catch {
        // sonraki URL'e geç
      }
    }

    if (!pageLoaded) {
      vlog(ctx, `Sayfa ${pageIndex}: tüm URL'ler fail — tarama durduruldu`);
      break;
    }

    // Lazy img loading için biraz bekle — Yedekler catalog'da img.lazy class'lı
    // resimler JS ile başlatılıyor; src attribute domcontentloaded'tan sonra
    // doluyor. 1000ms civarı yeterli, 5200 ürün × 1sn = 87dk dolar — pratik
    // sınır.
    await page.waitForTimeout(800);

    const rows = await page.locator(CATALOG_SELECTORS.ROW).all();
    if (rows.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        vlog(ctx, `Sayfa ${pageIndex}: ${consecutiveEmpty} ardışık boş sayfa, tarama bitti`);
        break;
      }
      pageIndex++;
      continue;
    }
    consecutiveEmpty = 0;

    let matchedThisPage = 0;
    for (const row of rows) {
      try {
        const rowId = ((await row.getAttribute("id")) ?? "").trim();
        if (!rowId || !targetSet.has(rowId) || foundCodes.has(rowId)) continue;
        foundCodes.add(rowId);
        matchedThisPage++;

        const productName = (
          (await row.locator(CATALOG_SELECTORS.PRODUCT_NAME_CELL).textContent()) ?? ""
        ).trim();

        const vatText = (
          (await row.locator(CATALOG_SELECTORS.VAT_CELL).textContent()) ?? ""
        ).trim();
        const vatMatch = vatText.match(/(\d+(?:[.,]\d+)?)/);
        const vatRate = vatMatch
          ? Number(vatMatch[1]?.replace(",", ".")) / 100
          : DEFAULT_VAT_RATE;

        const listText = (
          (await row.locator(CATALOG_SELECTORS.LIST_PRICE_CELL).textContent()) ?? ""
        ).trim();
        const listPriceWithVat = parseTrPrice(listText);
        if (listPriceWithVat === null) {
          resultMap.set(rowId, {
            ok: false,
            productCode: rowId,
            mode: "catalog-parse-failed",
            message: `Liste fiyatı parse edilemedi: "${listText}"`,
          });
          continue;
        }
        const unitPriceExclVat = Number(
          (listPriceWithVat / (1 + vatRate)).toFixed(2),
        );

        let imageUrl: string | null = null;
        try {
          const img = row.locator(CATALOG_SELECTORS.IMAGE).first();
          // Lazy load fallback: src boşsa data-src ve data-original'a bak.
          const candidates = await Promise.all([
            img.getAttribute("src").catch(() => null),
            img.getAttribute("data-src").catch(() => null),
            img.getAttribute("data-original").catch(() => null),
          ]);
          const imgSrc = candidates.find(
            (v) => v && /\/Uploads\/urunler\//.test(v),
          );
          if (imgSrc) {
            imageUrl = imgSrc.startsWith("http")
              ? imgSrc
              : `https://${imgSrc.replace(/^\/+/, "")}`;
          }
        } catch {
          // görsel yoksa null
        }

        resultMap.set(rowId, {
          ok: true,
          productCode: rowId,
          catalogUrl: page.url(),
          productName,
          listPrice: listPriceWithVat,
          discountText: null,
          unitPriceExclVat,
          vatRate,
          unitPriceWithVat: listPriceWithVat,
          imageUrl,
        });
      } catch (err) {
        // Tek ürün parse hatası — sayfaya devam
        ctx.pushError(
          "catalog-row-parse",
          "unexpected-dom",
          `Sayfa ${pageIndex}: ${(err as Error).message}`,
        );
      }
    }

    vlog(
      ctx,
      `Sayfa ${pageIndex}/${CATALOG_MAX_PAGES}: ${rows.length} ürün, ${matchedThisPage} eşleşme (${foundCodes.size}/${targetSet.size})`,
    );
    pageIndex++;
  }

  // Bulunamayan target'lar için product-not-found ekle
  for (const target of targets) {
    const code = target.productCode.trim();
    if (!resultMap.has(code)) {
      resultMap.set(code, {
        ok: false,
        productCode: code,
        mode: "product-not-found",
        message: `Catalog'da bulunamadı (${pageIndex - 1} sayfa tarandı)`,
      });
    }
  }

  vlog(
    ctx,
    `Catalog scrape bitti: ${foundCodes.size}/${targetSet.size} bulundu, ${pageIndex - 1} sayfa tarandı`,
  );

  return Array.from(resultMap.values());
}

export const yedeklerAdapter: Adapter = {
  slug: "yedekler",
  displayName: "Yedekler İnşaat",
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,
  scrapeCatalog,
};
