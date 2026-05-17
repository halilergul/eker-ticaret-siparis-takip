/**
 * Levent Şimşek Armatür B2B adapter — https://liste.leventsimsekarmatur.com için.
 *
 * Site yapısı (Feature 008 — keşif iteratif yapılır):
 *   - Platform: PHP (index.php + query string router)
 *   - Login: /index.php (kullanıcı doğruladı; başka route da olabilir)
 *   - Protocol: HTTPS ✓
 *   - Ürün kategorisi: armatür — ürün adları çift tırnak/kesme/slash içerebilir
 *
 * Selector adayları enderyapı pattern'i ile aynı: tryFindSelector havuzu.
 * Catalog metodu (scrapeCatalog) bu feature'da yok (009).
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
  TIMEOUTS,
} from "./leventsimsek.constants";

import type { Page } from "playwright";

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
  if (ctx.verbose) process.stderr.write(`[leventsimsek] ${msg}\n`);
}

// "29 Ara 2025 14:49" → "2025-12-29T14:49:00Z" (TR uzun tarih → ISO)
const TR_MONTHS: Record<string, string> = {
  Oca: "01", Şub: "02", Mar: "03", Nis: "04",
  May: "05", Haz: "06", Tem: "07", Ağu: "08",
  Eyl: "09", Eki: "10", Kas: "11", Ara: "12",
};
function parseTrDateLong(text: string): string | null {
  const m = text.match(
    /(\d{1,2})\s+(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (!m) return null;
  const [, dRaw, monStr, year, hRaw, minStr] = m;
  const day = (dRaw ?? "01").padStart(2, "0");
  const month = TR_MONTHS[monStr ?? ""];
  if (!month) return null;
  const hour = (hRaw ?? "00").padStart(2, "0");
  const min = minStr ?? "00";
  return `${year}-${month}-${day}T${hour}:${min}:00Z`;
}

// Module-level cache: listOrders her satır için modal'ı açıp ürünleri parse ettiğinde
// burada saklar; getOrderDetail aynı orderNo için cache'ten okur. Tek scrape:all
// run'ı süresince aktif.
const detailCache = new Map<string, RawOrderItem[]>();

async function closeModalIfOpen(page: Page): Promise<void> {
  // Bootstrap modal: "Kapat" butonu, X butonu, veya ESC
  const close = page
    .locator(
      '.modal.show button:has-text("Kapat"), .modal.in button:has-text("Kapat"), .modal.show .close, .modal.in .close',
    )
    .first();
  const count = await close.count().catch(() => 0);
  if (count > 0) {
    await close.click({ force: true }).catch(() => undefined);
  } else {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  // Modal kapanma animasyonu
  await page.waitForTimeout(300);
}

async function login(ctx: ScrapeContext): Promise<void> {
  const { page } = ctx;
  vlog(ctx, "Login sayfasına gidiliyor");

  const creds = loadCredentials("leventsimsek");

  // 1) Login sayfası açma — login formu navbar dropdown'da DOM'da gizli (visible=false).
  let landedOnLogin = false;
  for (const candidatePath of LOGIN_PATHS) {
    const url = `${SITE_BASE_URL}${candidatePath}`;
    try {
      const response = await page.goto(url, {
        timeout: TIMEOUTS.NAVIGATION_MS,
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() < 400) {
        // password input DOM'da mı? (visible olmayabilir — dropdown'da gizli)
        const hasForm = await page
          .locator('input[type="password"]')
          .count();
        if (hasForm > 0) {
          vlog(ctx, `Login candidate path başarılı: ${candidatePath}`);
          landedOnLogin = true;
          break;
        }
        vlog(ctx, `${candidatePath}: 200 OK ama password input yok`);
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

  // 3) Form alanlarını bul — visibility check'i bypass et (dropdown'da gizli).
  const usernameSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.USERNAME_INPUTS,
    /* requireVisible */ false,
  );
  const passwordSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.PASSWORD_INPUTS,
    false,
  );
  const submitSelector = await tryFindSelector(
    page,
    LOGIN_SELECTORS.SUBMIT_BUTTONS,
    false,
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

  // 4) Doldur + submit. Önce navbar "Giriş Yap" trigger'a tıkla → dropdown
  // formu görünür olsun → sonra normal page.fill + page.click flow'u kullan.
  // Programatik form.submit() çalışmıyor (site site/CSRF doğrulamayı bozuyor olabilir);
  // gerçek browser flow'u en güvenli yaklaşım.
  const urlBeforeSubmit = page.url();

  // Trigger linklerine bak — javascript:; href olanlar dropdown trigger
  vlog(ctx, "Navbar 'Giriş Yap' trigger aranıyor (dropdown açma)");
  const triggers = page.locator(
    'a[href="javascript:;"]:has-text("Giriş"), a[href="javascript:void(0)"]:has-text("Giriş")',
  );
  const triggerCount = await triggers.count();
  if (triggerCount > 0) {
    try {
      await triggers.first().click({ timeout: 3000 });
      await page.waitForTimeout(500);
      vlog(ctx, "Trigger tıklandı, dropdown açıldı (umuluyor)");
    } catch (err) {
      vlog(ctx, `Trigger click başarısız (önemli değil): ${String(err).slice(0, 80)}`);
    }
  } else {
    vlog(ctx, "Trigger bulunamadı — form zaten görünür olabilir");
  }

  // Form alanlarını doldurmayı dene — normal page.fill önce, force fallback ikincil
  try {
    await page.locator(usernameSelector).first().fill(creds.username);
    await page.locator(passwordSelector).first().fill(creds.password);
    vlog(ctx, "Form normal flow ile dolduruldu");
  } catch {
    vlog(ctx, "Normal fill başarısız, DOM evaluate fallback'e geçiliyor");
    await page.evaluate(
      (args: string[]) => {
        const uSel = args[0] as string;
        const pSel = args[1] as string;
        const username = args[2] as string;
        const password = args[3] as string;
        document.querySelectorAll(uSel).forEach((el) => {
          const inp = el as HTMLInputElement;
          inp.value = username;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        });
        document.querySelectorAll(pSel).forEach((el) => {
          const inp = el as HTMLInputElement;
          inp.value = password;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        });
      },
      [usernameSelector, passwordSelector, creds.username, creds.password],
    );
  }

  // Submit butonuna tıkla — normal flow JS handler'ları tetikler
  if (submitSelector) {
    try {
      await page.locator(submitSelector).first().click({ timeout: 5000 });
      vlog(ctx, "Submit butonuna normal click");
    } catch {
      vlog(ctx, "Normal click başarısız, requestSubmit() fallback");
      await page.evaluate((pSel: string) => {
        const pwd = document.querySelector(pSel) as HTMLInputElement | null;
        if (pwd && pwd.form) {
          if (typeof pwd.form.requestSubmit === "function") {
            pwd.form.requestSubmit();
          } else {
            pwd.form.submit();
          }
        }
      }, passwordSelector);
    }
  }

  // 5) Login tamamlanması — navigasyon veya networkidle bekle
  await page
    .waitForLoadState("networkidle", { timeout: TIMEOUTS.LOGIN_MS })
    .catch(() => undefined);

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

  // 7) Login başarı doğrulaması — anasayfaya git, "Giriş Yapınız" link'i hâlâ
  // var mı kontrol et. Authenticated session'da bu link kaybolur, "Çıkış" gelir.
  vlog(ctx, "Login durumu doğrulanıyor (anasayfa kontrolü)");
  await page
    .goto(`${SITE_BASE_URL}/?p/index`, {
      timeout: TIMEOUTS.NAVIGATION_MS,
      waitUntil: "domcontentloaded",
    })
    .catch(() => undefined);
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => undefined);

  const stillHasLoginLink =
    (await page.locator('a[href*="loginvendor"]').count()) > 0;
  const urlAfterSubmit = page.url();

  if (!stillHasLoginLink) {
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
      urlAfterSubmit === urlBeforeSubmit ? "no-navigation" : "still-shows-login-link",
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

  // Levent Şimşek sipariş listesi formatı (2026-05-17 keşfi):
  //   Cell [0]: "Bekleyen sipariş 29 Ara 2025 14:49" (durum + tarih+saat)
  //   Cell [1]: "Tek Çekim ile Ödeme, 425,00 ₺"     (ödeme tipi + tutar)
  //   Cell [2]: "Detaylar İptal"                    (aksiyon butonları)
  //
  // Order kodu listede YOK — sadece "Detaylar" modalı açılınca görünüyor
  // ("Siparis Kodu: LIS29125T2446"). Bu yüzden listOrders her satır için
  // modal'ı açar, gerçek kodu + ürün satırlarını çeker, detailCache'e koyar.
  // getOrderDetail aynı orderNo için cache'ten okur.
  const initialRowCount = await page.locator(rowSelector).count();
  vlog(ctx, `${initialRowCount} satır bulundu`);
  if (initialRowCount === 0) {
    throw new ScrapeError({ mode: "empty-history", step: "no-rows" });
  }

  detailCache.clear();
  const results: RawOrderSummary[] = [];
  const max =
    limit && limit > 0 ? Math.min(limit, initialRowCount) : initialRowCount;

  for (let i = 0; i < max; i++) {
    try {
      // Modal kapama page state'ini bozabilir; her seferinde fresh locator
      const freshRows = await page.locator(rowSelector).all();
      const row = freshRows[i];
      if (!row) {
        vlog(ctx, `Satır ${i + 1} stale, atlanıyor`);
        continue;
      }

      const cells = await row.locator("td").allTextContents();
      const c0 = (cells[0] ?? "").replace(/\s+/g, " ").trim();
      const c1 = (cells[1] ?? "").replace(/\s+/g, " ").trim();

      // Durum + tarih ayır: "Bekleyen sipariş 29 Ara 2025 14:49"
      const statusMatch = c0.match(
        /^(.+?)\s+(\d{1,2}\s+(?:Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\s+\d{4}(?:\s+\d{1,2}:\d{2})?)$/,
      );
      const status = statusMatch ? (statusMatch[1] ?? "").trim() : "Bilinmiyor";
      const dateStr = statusMatch ? (statusMatch[2] ?? "") : c0;
      const orderedAt = parseTrDateLong(dateStr);
      if (!orderedAt) {
        vlog(ctx, `Satır ${i + 1}: tarih parse edilemedi (raw="${c0}"), atlanıyor`);
        continue;
      }

      // Tutar: c1 içindeki son TR fiyat pattern'i
      const priceMatches = c1.match(/[\d.]+,\d{2}/g);
      const lastPrice = priceMatches?.[priceMatches.length - 1] ?? null;
      const totalAmount = lastPrice ? (parseTrPrice(lastPrice) ?? 0) : 0;

      // "Detaylar" butonuna tıkla → modal aç
      const detayBtn = row
        .locator('a:has-text("Detaylar"), button:has-text("Detaylar")')
        .first();
      if ((await detayBtn.count()) === 0) {
        vlog(ctx, `Satır ${i + 1}: Detaylar butonu yok, atlanıyor`);
        continue;
      }
      await detayBtn.click({ force: true });
      // Bootstrap modal açılma: .modal.show veya .modal.in
      const modal = page
        .locator('.modal.show, .modal.in, [role="dialog"]:visible')
        .first();
      await modal.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(400); // animasyon + içerik render

      const modalText = (await modal.textContent().catch(() => "")) ?? "";

      // Order code parse: "Siparis Kodu LIS29125T2446"
      let orderNo = "";
      const codeMatch =
        modalText.match(/Siparis\s*Kodu[\s:]*([A-Z][A-Z0-9]{3,})/i) ??
        modalText.match(/\b(LIS[A-Z0-9]+)\b/);
      if (codeMatch && codeMatch[1]) {
        orderNo = codeMatch[1].trim();
      } else {
        // Fallback: tarih-bazlı sentetik kod (idempotency için stable)
        orderNo = `LSDATE-${orderedAt.slice(0, 16).replace(/[:T-]/g, "")}`;
        vlog(ctx, `Satır ${i + 1}: order code parse edilemedi, sentetik: ${orderNo}`);
      }

      // Modal içindeki ürün tablosu parse
      const items: RawOrderItem[] = [];
      const itemRows = await modal.locator("table tbody tr").all();
      for (const itemRow of itemRows) {
        const itemCells = await itemRow.locator("td").allTextContents();
        const cellsClean = itemCells
          .map((c) => c.replace(/\s+/g, " ").trim())
          .filter((c) => c.length > 0);
        if (cellsClean.length < 3) continue;

        // Modal tablo formatı (2026-05-17 keşfi):
        //   [0] Ürün Adı + "Barkod: X | Muhasebe Kodu: Y" alt satırlar
        //   [1] Ürün Fiyatı: "85,00 ₺"
        //   [2] Adet: "5 Adet"
        //   [3] TOPLAM TUTAR
        //   [4] Ürün Sipariş Durumu
        const c0Full = cellsClean[0] ?? "";
        const c1Price = cellsClean[1] ?? "";
        const c2Qty = cellsClean[2] ?? "";

        const unitPrice = parseTrPrice(c1Price);
        const qtyMatch2 = c2Qty.match(/(\d+(?:[.,]\d+)?)/);
        const quantity = qtyMatch2 && qtyMatch2[1]
          ? parseFloat(qtyMatch2[1].replace(",", "."))
          : 0;

        // Ürün kodu: "Muhasebe Kodu: S001" pattern'inden
        const codeMatch2 = c0Full.match(/Muhasebe\s*Kodu[\s:]+(\S+)/i);
        const productCode = codeMatch2 && codeMatch2[1] ? codeMatch2[1].trim() : "";

        // Ürün adı: "Barkod:" veya "Muhasebe" anahtar kelimelerinden önceki kısım
        let productName = c0Full;
        const splitIdx = c0Full.search(/\s+(?:Barkod|Muhasebe)\s*[:K]/i);
        if (splitIdx > 0) productName = c0Full.slice(0, splitIdx).trim();

        if (
          !productCode ||
          !productName ||
          !unitPrice ||
          unitPrice <= 0 ||
          quantity <= 0
        ) {
          vlog(
            ctx,
            `  ürün satır atlandı: code="${productCode}" name="${productName.slice(0, 30)}" qty=${quantity} price=${unitPrice}`,
          );
          continue;
        }

        items.push({
          productCode,
          productName,
          quantity,
          unitPriceAtOrder: unitPrice,
          catalogUrl: null,
        });
      }

      detailCache.set(orderNo, items);
      vlog(
        ctx,
        `Satır ${i + 1}: ${orderNo} parse edildi (${items.length} ürün, total=${totalAmount})`,
      );

      // Modal kapat
      await closeModalIfOpen(page);

      results.push({
        orderNo,
        status,
        orderedAt,
        totalAmount,
      });
    } catch (err) {
      vlog(ctx, `Satır ${i + 1} hata: ${String(err).slice(0, 150)}`);
      await closeModalIfOpen(page).catch(() => undefined);
    }
  }

  if (results.length === 0) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "orders-parse-all-failed",
      details: `${initialRowCount} satır, hiçbiri parse edilemedi`,
    });
  }

  vlog(ctx, `${results.length} sipariş başlığı parse edildi`);
  return results;
}

async function getOrderDetail(
  ctx: ScrapeContext,
  order: RawOrderSummary,
): Promise<RawOrderDetail> {
  // Levent Şimşek için detay listOrders aşamasında modal'dan parse edilip
  // detailCache'e konuldu — burada cache'ten okunur. (Detail sayfası ayrı bir
  // URL'de değil; modal trigger sayfa state'i değiştiriyor.)
  const items = detailCache.get(order.orderNo) ?? [];
  if (items.length === 0) {
    vlog(
      ctx,
      `getOrderDetail(${order.orderNo}): cache miss veya ürün yok`,
    );
  }
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

export const leventsimsekAdapter: Adapter = {
  slug: "leventsimsek",
  displayName: "Levent Şimşek Armatür",
  login,
  listOrders,
  getOrderDetail,
  getProductPrice,
};
