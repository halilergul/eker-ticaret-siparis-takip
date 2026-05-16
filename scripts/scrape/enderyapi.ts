/**
 * @deprecated 004 sonrası: yerine `npm run scrape -- --supplier enderyapi` kullan.
 * Bu CLI 002 PoC'tan kalma standalone okuyucu; DB yazma yok, sadece stdout.
 * 005'te silinecek.
 */

console.warn(
  "[scrape:enderyapi] DEPRECATED — yerine: npm run scrape -- --supplier enderyapi",
);

/**
 * Enderyapi Scraper PoC (legacy)
 *
 * Bu CLI b2b.enderyapi.com.tr sitesine login olur, sipariş geçmişi ilk
 * sayfasındaki satırları parse eder, her ürünün güncel fiyatını detay
 * sayfasından çeker ve stdout'a yazar.
 *
 * Çalıştırma: npm run scrape:enderyapi [-- --json] [--headed] [--verbose]
 *
 * Hata durumlarında scrape-debug/<ts>-<mode>.png screenshot'ı kaydeder.
 *
 * Bu PoC; veri Supabase'e yazılmaz, sadece stdout'a basılır.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { loadCredentials } from "./credentials";
import { ScrapeError, formatError, type FailureMode } from "./errors";
import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  LOGIN_SELECTORS,
  ORDER_LIST_SELECTORS,
  PRODUCT_DETAIL_SELECTORS,
  TIMEOUTS,
  SCREENSHOT_DIR,
  DEFAULT_CURRENCY,
} from "./constants";
import { parseTrPrice } from "./price-parse";
import {
  formatText,
  formatJson,
  isValidOrderLine,
  type OrderLine,
} from "./output";
import { detectCaptcha, detect2FA } from "./detection";

type Flags = {
  json: boolean;
  headed: boolean;
  verbose: boolean;
  help: boolean;
};

const HELP_TEXT = `Enderyapi Scraper PoC — b2b.enderyapi.com.tr sipariş geçmişi okuyucusu

Kullanım: npm run scrape:enderyapi [-- FLAGS]

Flag'ler:
  --json, -j        Çıktıyı JSON dizisi olarak yaz (default: düz metin)
  --headed          Browser penceresini görünür çalıştır (default: headless)
  --verbose, -v     Detaylı log (stderr'e)
  --help, -h        Bu yardımı göster

Env vars (.env.local'da tanımlanır):
  ENDERYAPI_USERNAME    Tedarikçi sitedeki kullanıcı adı/email
  ENDERYAPI_PASSWORD    Tedarikçi sitedeki şifre

Örnek:
  npm run scrape:enderyapi -- --json --verbose

Hata durumunda screenshot: scrape-debug/<timestamp>-<mode>.png
Exit code: 0 başarı, 1 hata, 2 kullanım hatası
`;

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    json: false,
    headed: false,
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--json":
      case "-j":
        flags.json = true;
        break;
      case "--headed":
        flags.headed = true;
        break;
      case "--verbose":
      case "-v":
        flags.verbose = true;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      default:
        process.stderr.write(`Bilinmeyen flag: ${arg}\n`);
        process.exit(2);
    }
  }

  return flags;
}

let lastStep = "init";
let verbose = false;

function vlog(msg: string): void {
  if (verbose) {
    process.stderr.write(`[scrape] ${msg}\n`);
  }
  lastStep = msg;
}

async function saveErrorScreenshot(
  page: Page,
  mode: FailureMode,
): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${ts}-${mode}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: false });
  } catch {
    // Sayfa kapanmış veya başka bir sebepten screenshot alınamadıysa
    // sessiz başarısızlık — error message zaten kullanıcıya gidiyor.
  }
  return filePath;
}

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

async function attemptLogin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  vlog("Login sayfasına gidiliyor");

  let landedOnLogin = false;
  for (const candidatePath of LOGIN_PATHS) {
    const url = `${SITE_BASE_URL}${candidatePath}`;
    try {
      const response = await page.goto(url, {
        timeout: TIMEOUTS.NAVIGATION_MS,
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() < 400) {
        vlog(`Login candidate path başarılı: ${candidatePath}`);
        landedOnLogin = true;
        break;
      }
    } catch (err) {
      vlog(`Login candidate ${candidatePath} başarısız: ${String(err)}`);
    }
  }

  if (!landedOnLogin) {
    throw new ScrapeError({ mode: "network", step: "navigate-login" });
  }

  // CAPTCHA / 2FA login öncesi de görünebilir
  const earlyCaptcha = await detectCaptcha(page);
  if (earlyCaptcha) {
    throw new ScrapeError({
      mode: "captcha",
      step: "pre-login",
      details: `tip: ${earlyCaptcha.kind}`,
    });
  }

  vlog("Login form aranıyor");
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

  // Username ve password kritik; bunlar yoksa form hiç yok demektir.
  // Submit button bulunamazsa Enter tuşu fallback'i denenir.
  if (!usernameSelector || !passwordSelector) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "login-form-find",
      details: `username=${!!usernameSelector}, password=${!!passwordSelector}`,
    });
  }

  vlog(`Form bulundu (u=${usernameSelector}, p=${passwordSelector}, submit=${submitSelector ?? "yok — Enter fallback"})`);
  vlog("Credentials dolduruluyor");
  await page.fill(usernameSelector, username);
  await page.fill(passwordSelector, password);

  vlog("Submit ediliyor");
  const urlBeforeSubmit = page.url();

  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(passwordSelector, "Enter");
  }

  // Site SPA: submit sonrası AJAX login → spinner → JS redirect.
  // domcontentloaded yetersiz; URL değişimini veya networkidle'ı bekle.
  vlog("Login işleminin tamamlanması bekleniyor");
  try {
    await page.waitForURL(
      (url) => {
        const u = String(url).toLowerCase();
        return !LOGIN_PATHS.some((p) => u.includes(p.toLowerCase()));
      },
      { timeout: TIMEOUTS.LOGIN_MS },
    );
    vlog("URL değişti, login başarılı görünüyor");
  } catch {
    vlog("URL değişmedi, networkidle bekleniyor (login başarısız olabilir)");
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => undefined);
  }

  // Submit sonrası: önce CAPTCHA (her zaman kritik), sonra URL değişti mi
  const captchaAfter = await detectCaptcha(page);
  if (captchaAfter) {
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

  // Eğer URL değişti VE login path'inden çıktıysa → login başarılı (2FA detection skip)
  // Bu sayede dashboard'daki "Ürün kodu" gibi metinler false positive 2FA tetiklemez.
  if (!stillOnLoginPath && urlAfterSubmit !== urlBeforeSubmit) {
    vlog(`Login başarılı, URL: ${urlAfterSubmit}`);
    return;
  }

  // URL değişmedi veya hâlâ login path'inde — şimdi 2FA mi yoksa login fail mi?
  const tfa = await detect2FA(page);
  if (tfa) {
    throw new ScrapeError({
      mode: "2fa-required",
      step: "post-login",
      details: `alan: ${tfa.method}`,
    });
  }

  // 2FA değilse login başarısız
  throw new ScrapeError({
    mode: "login-failed",
    step: urlAfterSubmit === urlBeforeSubmit ? "no-redirect" : "still-on-login-path",
  });
}

async function navigateToOrders(page: Page): Promise<void> {
  vlog("Sipariş geçmişi sayfasına gidiliyor");

  for (const candidatePath of ORDER_HISTORY_PATHS) {
    const url = `${SITE_BASE_URL}${candidatePath}`;
    try {
      const response = await page.goto(url, {
        timeout: TIMEOUTS.NAVIGATION_MS,
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() < 400) {
        // Sayfa açıldı; sipariş satırı var mı kontrol et
        const rowSelector = await tryFindSelector(
          page,
          ORDER_LIST_SELECTORS.ROW_CONTAINERS,
        );
        if (rowSelector) {
          vlog(`Sipariş listesi: ${candidatePath} (selector=${rowSelector})`);
          return;
        }
        vlog(`${candidatePath} açıldı ama sipariş satırı bulunamadı, sıradaki adaya`);
      }
    } catch (err) {
      vlog(`Orders candidate ${candidatePath} başarısız: ${String(err)}`);
    }
  }

  // Hiçbir aday URL çalışmadıysa, nav linki ara
  vlog("Aday URL'ler işe yaramadı, nav linki aranıyor");
  const navLink = page
    .locator('a')
    .filter({ hasText: /sipariş|orders|hesabım/i })
    .first();
  const hasNav = await navLink.count();
  if (hasNav > 0) {
    await navLink.click({ timeout: TIMEOUTS.NAVIGATION_MS });
    await page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.NAVIGATION_MS })
      .catch(() => undefined);
    vlog(`Nav linkten geldik, URL: ${page.url()}`);

    const rowSelector = await tryFindSelector(
      page,
      ORDER_LIST_SELECTORS.ROW_CONTAINERS,
    );
    if (rowSelector) return;
  }

  // CAPTCHA login sonrası tetiklenmiş olabilir
  const captcha = await detectCaptcha(page);
  if (captcha) {
    throw new ScrapeError({
      mode: "captcha",
      step: "post-login-orders",
      details: `tip: ${captcha.kind}`,
    });
  }

  throw new ScrapeError({
    mode: "unexpected-dom",
    step: "orders-page-not-found",
  });
}

async function parseOrderRows(page: Page): Promise<Partial<OrderLine>[]> {
  vlog("Sipariş satırları parse ediliyor");

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
  vlog(`${rows.length} satır bulundu`);

  if (rows.length === 0) {
    throw new ScrapeError({ mode: "empty-history", step: "no-rows" });
  }

  const results: Partial<OrderLine>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    try {
      const rowText = (await row.textContent()) ?? "";
      const cellTexts = await row.locator("td, [class*='cell']").allTextContents();

      // Heuristik parse: tüm metin hücrelerini topla, ilk ikisini birleştir
      // ("KOD — Açıklama" formatı). Tek hücre varsa onu kullan.
      let productName = "";
      let orderDate = "";
      let purchasePrice: number | null = null;

      // Numerik, tarih, fiyat olmayan tüm metin hücrelerini topla
      const textCells: string[] = [];
      for (const txt of cellTexts) {
        const trimmed = txt.trim();
        if (trimmed.length < 2) continue;
        // Sadece sayı / fiyat olan hücreleri atla (₺, TL, virgüllü/noktalı sayılar)
        if (/^[\d.,]+\s*(₺|TL|TRY)?$/i.test(trimmed)) continue;
        // Tarih formatlarını atla
        if (/^\d{2,4}[./-]\d{2}[./-]\d{2,4}$/.test(trimmed)) continue;
        textCells.push(trimmed);
      }

      // İlk satır için verbose log (debugging için)
      if (i === 0 && verbose) {
        process.stderr.write(`[scrape]   Satır ${i + 1} text cells: ${JSON.stringify(textCells)}\n`);
      }

      // Birleştir: ilk 2 metin hücresi "KOD — Ad" formatına
      if (textCells.length >= 2) {
        const code = textCells[0] ?? "";
        const name = textCells[1] ?? "";
        // Aynı içeriği iki kez göstermeyelim
        productName = code === name ? code : `${code} — ${name}`;
      } else if (textCells.length === 1) {
        productName = textCells[0] ?? "";
      }

      // Tarih: YYYY-MM-DD veya DD.MM.YYYY veya DD/MM/YYYY pattern
      const dateMatch = rowText.match(
        /(\d{4}-\d{2}-\d{2}|\d{2}[./-]\d{2}[./-]\d{4})/,
      );
      if (dateMatch && dateMatch[0]) {
        orderDate = dateMatch[0];
      }

      // Alış fiyatı: TR fiyat pattern (₺ veya TL ile veya 1.234,56 formatı)
      const priceMatches = rowText.match(
        /[\d.]+,\d{2}\s*(?:₺|TL|TRY)?/g,
      );
      if (priceMatches && priceMatches.length > 0) {
        // İlk fiyat = alış fiyatı varsayımı; eğer adet × birim = toplam gösteriyorsa
        // ilk küçük olan birim olabilir. PoC: ilkini al, kullanıcı feedback'iyle iterate.
        const candidates = priceMatches
          .map((p) => parseTrPrice(p))
          .filter((v): v is number => v !== null);
        if (candidates.length > 0) {
          purchasePrice = candidates[0] ?? null;
        }
      }

      if (!productName || !orderDate || purchasePrice === null) {
        if (verbose) {
          process.stderr.write(
            `[scrape] Satır ${i + 1} parse edilemedi (name=${!!productName} date=${!!orderDate} price=${purchasePrice !== null}), atlanıyor\n`,
          );
        }
        continue;
      }

      // Detay link'i bul — şimdilik href'i sakla, T012'de visit edilecek
      const linkEl = row.locator('a').first();
      const linkHref = await linkEl.getAttribute("href").catch(() => null);

      results.push({
        product_name: productName,
        order_date: orderDate,
        purchase_unit_price: purchasePrice,
        currency: DEFAULT_CURRENCY,
        // current_unit_price T012'de eklenecek
        // detail href burada anonim; gerçekte tip olarak Partial<OrderLine>'a sığmaz
        // o yüzden ayrı bir yapı içinde tutmak gerekir. Pragmatik: notes alanına stash et,
        // sonra read & strip ederiz.
        ...(linkHref ? { notes: `__detail_href:${linkHref}` } : {}),
      });
    } catch (err) {
      vlog(`Satır ${i + 1} hata: ${String(err)}`);
    }
  }

  if (results.length === 0) {
    throw new ScrapeError({
      mode: "unexpected-dom",
      step: "orders-row-parse-all-failed",
      details: `${rows.length} satır, hiçbiri parse edilemedi`,
    });
  }

  return results;
}

async function enrichWithCurrentPrices(
  page: Page,
  partials: Partial<OrderLine>[],
): Promise<OrderLine[]> {
  const orderListUrl = page.url();
  const finalLines: OrderLine[] = [];

  for (let i = 0; i < partials.length; i++) {
    const partial = partials[i];
    if (!partial) continue;
    vlog(`Satır ${i + 1}: güncel fiyat çekiliyor`);

    // notes alanından detail href'i çıkar
    let detailHref: string | null = null;
    let cleanNotes: string | undefined;
    if (partial.notes && partial.notes.startsWith("__detail_href:")) {
      detailHref = partial.notes.slice("__detail_href:".length);
      cleanNotes = undefined;
    } else {
      cleanNotes = partial.notes;
    }

    let currentPrice: number | null = null;

    if (detailHref) {
      try {
        const fullUrl = detailHref.startsWith("http")
          ? detailHref
          : `${SITE_BASE_URL}${detailHref}`;

        vlog(`  Detay URL: ${fullUrl}`);
        await page.goto(fullUrl, {
          timeout: TIMEOUTS.NAVIGATION_MS,
          waitUntil: "domcontentloaded",
        });

        // SPA: JS render bitmesi için ek bekleyiş
        await page
          .waitForLoadState("networkidle", { timeout: 10_000 })
          .catch(() => undefined);

        vlog(`  Sayfa hazır, URL: ${page.url()}, title: ${await page.title()}`);

        // Fiyat element ara — her selector için detaylı log
        for (const selector of PRODUCT_DETAIL_SELECTORS.PRICE_ELEMENTS) {
          try {
            const el = page.locator(selector).first();
            const count = await el.count();
            if (count > 0) {
              const text = await el.textContent().catch(() => null);
              vlog(`  Selector "${selector}" -> ${count} eşleşme, text: "${text?.slice(0, 80) ?? ""}"`);
              const parsed = parseTrPrice(text);
              if (parsed !== null && parsed > 0) {
                currentPrice = parsed;
                vlog(`  ✓ Fiyat parse edildi: ${parsed}`);
                break;
              }
            }
          } catch (err) {
            vlog(`  Selector "${selector}" hata: ${String(err).slice(0, 100)}`);
          }
        }

        if (currentPrice === null) {
          cleanNotes = "güncel fiyat parse edilemedi";
        }
      } catch (err) {
        vlog(`Satır ${i + 1} detay sayfası hatası: ${String(err).slice(0, 200)}`);
        cleanNotes = "ürün artık listede değil";
      }
    } else {
      cleanNotes = "ürün detay linki bulunamadı";
    }

    const line: Partial<OrderLine> = {
      ...partial,
      current_unit_price: currentPrice,
      notes: cleanNotes,
    };

    if (isValidOrderLine(line)) {
      finalLines.push(line);
    } else {
      vlog(`Satır ${i + 1} validation başarısız, atlanıyor`);
    }
  }

  // Sipariş listesine dön (sonraki çalıştırmalar için temiz state)
  await page.goto(orderListUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);

  return finalLines;
}

async function runScrape(flags: Flags, browser: Browser): Promise<OrderLine[]> {
  const context = await browser.newContext({
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  const page = await context.newPage();

  try {
    const creds = loadCredentials();

    lastStep = "login";
    await attemptLogin(page, creds.username, creds.password);

    lastStep = "navigate-orders";
    await navigateToOrders(page);

    lastStep = "parse-rows";
    const partials = await parseOrderRows(page);

    lastStep = "fetch-current-prices";
    const lines = await enrichWithCurrentPrices(page, partials);

    return lines;
  } catch (err) {
    if (err instanceof ScrapeError && err.mode !== "missing-credentials") {
      try {
        err.screenshotPath = await saveErrorScreenshot(page, err.mode);
      } catch {
        // screenshot başarısız oldu, devam
      }
    }
    throw err;
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  verbose = flags.verbose;

  let browser: Browser | null = null;
  try {
    vlog("Browser başlatılıyor");

    // Erken env validation — browser açmadan önce kontrol et
    loadCredentials();

    browser = await chromium.launch({ headless: !flags.headed });

    const scrapeTask = runScrape(flags, browser);

    const timeoutTask = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new ScrapeError({
              mode: "timeout",
              details: `Son aktivite: ${lastStep}`,
            }),
          ),
        TIMEOUTS.GLOBAL_MS,
      ),
    );

    const lines = await Promise.race([scrapeTask, timeoutTask]);

    const output = flags.json ? formatJson(lines) : formatText(lines);
    process.stdout.write(output);
    if (!flags.json) {
      process.stdout.write("\n");
    }
    process.exit(0);
  } catch (err) {
    let scrapeError: ScrapeError;
    if (err instanceof ScrapeError) {
      scrapeError = err;
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isNetworkErr =
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|net::ERR_/i.test(errMsg);

      if (isNetworkErr) {
        scrapeError = new ScrapeError({
          mode: "network",
          details: errMsg,
        });
      } else {
        scrapeError = new ScrapeError({
          mode: "unknown",
          details: errMsg,
        });
      }
    }

    const formatted = formatError(scrapeError, verbose);

    // empty-history success ise stdout'a uygun boş çıktı bas
    if (scrapeError.mode === "empty-history") {
      const output = flags.json ? formatJson([]) : formatText([]);
      process.stdout.write(output);
      if (!flags.json) process.stdout.write("\n");
      process.stderr.write(formatted.stderr);
    } else {
      process.stderr.write(formatted.stderr);
    }

    process.exit(formatted.exitCode);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

void main();
