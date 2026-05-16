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
      });
    } catch (err) {
      vlog(ctx, `Detail satır ${i + 1} hata: ${String(err).slice(0, 100)}`);
    }
  }

  vlog(ctx, `${items.length} ürün satırı parse edildi (orderNo=${order.orderNo})`);
  return { summary: order, items };
}

async function getProductPrice(
  ctx: ScrapeContext,
  productCode: string,
): Promise<number | null> {
  // US2 — T022 (katalog DOM keşfi) ve T023 (selector + parse) gerektirir.
  // Şimdilik null döndürüyoruz (orchestrator NULL'da snapshot yazmaz).
  vlog(
    ctx,
    `getProductPrice(${productCode}): henüz keşfedilmemiş katalog URL'i, NULL döndürülüyor (T022/T023 scope)`,
  );
  return null;
}

export const enderyapiAdapter: Adapter = {
  slug: "enderyapi",
  displayName: "Enderyapi B2B",
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,
};

// Public export to silence unused warning + allow direct imports if needed
export const _selectorsForReference = PRODUCT_DETAIL_SELECTORS;
