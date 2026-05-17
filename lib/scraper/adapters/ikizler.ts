/**
 * İkizler Hırdavat B2B adapter — http://bayi.ikizlerhirdavat.com için.
 *
 * Site yapısı (Feature 008 — keşif iteratif yapılır):
 *   - Platform: ASP.NET MVC
 *   - Login: /Home/Giris (kullanıcı doğruladı)
 *   - Protocol: HTTP (HTTPS değil) — credential plaintext riski kabul (FR-012)
 *
 * Selector adayları enderyapı pattern'i ile aynı: tryFindSelector havuzu;
 * eşleşen ilki kullanılır. Site keşfi sırasında --headed + scrape-debug ile
 * refine edilecek. Catalog metodu (scrapeCatalog) bu feature'da yok (009).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { loadCredentials } from "@/scripts/scrape/credentials";
import { detectCaptcha, detect2FA } from "@/scripts/scrape/detection";
import { parseTrPrice } from "@/scripts/scrape/price-parse";

import { ScrapeError } from "../errors";
import type {
  Adapter,
  RawOrderDetail,
  RawOrderItem,
  RawOrderSummary,
  ScrapeContext,
} from "../types";

import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  LOGIN_SELECTORS,
  ORDER_LIST_SELECTORS,
  ORDER_DETAIL_SELECTORS,
  TIMEOUTS,
} from "./ikizler.constants";

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
  if (ctx.verbose) process.stderr.write(`[ikizler] ${msg}\n`);
}

function parseTrDate(text: string): string | null {
  const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo}-${d}T00:00:00Z`;
  }
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`;
  }
  return null;
}

async function login(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  vlog(ctx, "Login sayfasına gidiliyor");

  const creds = loadCredentials("ikizler");

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

  // 3) Form alanlarını bul
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

  // 4) Doldur + submit. ASP.NET MVC __RequestVerificationToken Playwright native
  // form flow ile otomatik gönderilir; manuel CSRF okuma gerekmez.
  await page.fill(usernameSelector, creds.username);
  await page.fill(passwordSelector, creds.password);

  const urlBeforeSubmit = page.url();
  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(passwordSelector, "Enter");
  }

  // 5) Login tamamlanması — URL change bekle
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
    if (ctx.verbose)
      await saveDebugScreenshot(page, ctx.debugDir, "login-success");
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
    step:
      urlAfterSubmit === urlBeforeSubmit ? "no-redirect" : "still-on-login-path",
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
          vlog(
            ctx,
            `Sipariş listesi: ${candidatePath} (selector=${rowSelector})`,
          );
          return;
        }
      }
    } catch (err) {
      vlog(
        ctx,
        `Orders ${candidatePath} başarısız: ${String(err).slice(0, 100)}`,
      );
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

      // detail link
      const linkEl = row.locator("a").first();
      const linkHref = await linkEl.getAttribute("href").catch(() => null);
      const detailUrl = linkHref
        ? linkHref.startsWith("http")
          ? linkHref
          : `${SITE_BASE_URL}${linkHref}`
        : undefined;

      // order_no: alfanumerik veya sayısal — ASP.NET tarafında genelde sayı veya prefix
      let orderNo = "";
      for (const cell of cells) {
        const t = cell.trim();
        if (/^[A-Z]{2,4}[\d-]+/.test(t) || /^\d{4,}$/.test(t)) {
          orderNo = t;
          break;
        }
      }
      if (!orderNo && detailUrl) {
        const idMatch = detailUrl.match(/[?&]id=(\d+)/i);
        if (idMatch) orderNo = `ID-${idMatch[1]}`;
      }
      if (!orderNo) {
        vlog(ctx, `Satır ${i + 1}: order_no bulunamadı, atlanıyor`);
        continue;
      }

      // status: Türkçe sipariş durum kelimeleri (UPPERCASE da yakalanır — case-insensitive)
      let status = "Bilinmiyor";
      for (const cell of cells) {
        const t = cell.trim();
        if (
          /onayland[ıi]|onay bekliyor|bekliyor|iptal|teslim|hazırlan[ıi]yor|tamamland[ıi]/i.test(
            t,
          )
        ) {
          status = t;
          break;
        }
      }

      // ordered_at
      let orderedAt: string | null = null;
      for (const cell of cells) {
        const parsed = parseTrDate(cell.trim());
        if (parsed) {
          orderedAt = parsed;
          break;
        }
      }
      if (!orderedAt) {
        const m = rowText.match(
          /(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/,
        );
        if (m) orderedAt = parseTrDate(m[0]);
      }
      if (!orderedAt) {
        vlog(
          ctx,
          `Satır ${i + 1}: tarih bulunamadı, atlanıyor (orderNo=${orderNo})`,
        );
        continue;
      }

      // total_amount: en son TR fiyat-like değer
      let totalAmount: number | null = null;
      const priceMatches = rowText.match(/[\d.]+,\d{2}\s*(?:₺|TL|TRY)?/g);
      if (priceMatches && priceMatches.length > 0) {
        const last = priceMatches[priceMatches.length - 1];
        if (last) totalAmount = parseTrPrice(last);
      }
      if (totalAmount === null) {
        vlog(
          ctx,
          `Satır ${i + 1}: tutar bulunamadı, 0 ile devam (orderNo=${orderNo})`,
        );
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

  // Ürün satırları
  let itemRowSelector: string | null = null;
  for (const s of ORDER_DETAIL_SELECTORS.ITEM_ROWS) {
    const count = await page.locator(s).count();
    if (count > 0) {
      itemRowSelector = s;
      break;
    }
  }

  if (!itemRowSelector) {
    await saveDebugScreenshot(
      page,
      ctx.debugDir,
      `detail-${order.orderNo}-no-rows`,
    );
    ctx.pushError(
      "order-detail",
      "unexpected-dom",
      `orderNo=${order.orderNo}: ürün satırı bulunamadı`,
    );
    return { summary: order, items: [] };
  }

  const rows = await page.locator(itemRowSelector).all();
  const items: RawOrderItem[] = [];

  // İkizler detay tablosu sabit format (2026-05-17 keşfi):
  // <tr>: [0]=icon (boş), [1]=code, [2]=name, [3]=qty, [4]=unit_price, [5]=total, [6]=action (TekrarAl)
  // Filter ile boş hücreler atılınca 6 cell: code, name, qty, unit_price, total, action
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    try {
      const cells = await row.locator("td").allTextContents();
      const cleanCells = cells.map((c) => c.replace(/\s+/g, " ").trim()).filter((c) => c.length > 0);
      if (cleanCells.length < 4) continue;

      // Pozisyon-bazlı parse (heuristic yerine; "12,00" qty'i fiyat olarak parse ediyordu)
      const productCode = cleanCells[0] ?? "";
      const productName = cleanCells[1] ?? "";
      const quantity = parseTrPrice(cleanCells[2] ?? "");
      const unitPriceAtOrder = parseTrPrice(cleanCells[3] ?? "");

      if (
        !productCode ||
        !productName ||
        quantity === null ||
        quantity <= 0 ||
        unitPriceAtOrder === null ||
        unitPriceAtOrder <= 0
      ) {
        vlog(
          ctx,
          `Detail satır ${i + 1} eksik alan, atlanıyor: code="${productCode}" qty=${quantity} price=${unitPriceAtOrder}`,
        );
        continue;
      }

      items.push({
        productCode,
        productName,
        quantity,
        unitPriceAtOrder,
        catalogUrl: null,
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
  // 008 kapsamında implemente edilmez (catalog 009'a ertelendi).
  vlog(
    ctx,
    `getProductPrice(${productCode}) — 008'de implemente değil (catalog 009)`,
  );
  return null;
}

export const ikizlerAdapter: Adapter = {
  slug: "ikizler",
  displayName: "İkizler Hırdavat",
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,
};
