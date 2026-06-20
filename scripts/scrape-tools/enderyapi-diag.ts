/**
 * Enderyapı DOM keşif aracı — Feature 011 (pagination).
 *
 *   npm run diag:enderyapi -- --phase orders-pagination [--headed]
 *
 * Output: tmp/enderyapi-diag/<phase>/
 * Şifreyi log'lamaz.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

import { loadCredentials } from "@/scripts/scrape/credentials";
import {
  SITE_BASE_URL,
  LOGIN_PATHS,
  ORDER_HISTORY_PATHS,
  LOGIN_SELECTORS,
  ORDER_LIST_SELECTORS,
} from "@/scripts/scrape/constants";

type Phase = "login" | "orders" | "orders-pagination" | "all";

const DIAG_ROOT = path.resolve(process.cwd(), "tmp/enderyapi-diag");

function parseArgs(): { phase: Phase; headed: boolean } {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf("--phase");
  const phase = (phaseIdx >= 0 ? args[phaseIdx + 1] : "login") as Phase;
  const headed = args.includes("--headed");
  if (!["login", "orders", "orders-pagination", "all"].includes(phase)) {
    console.error(`Geçersiz --phase: ${phase}`);
    process.exit(1);
  }
  return { phase, headed };
}

async function dumpPage(page: Page, phaseDir: string, label: string) {
  await fs.mkdir(phaseDir, { recursive: true });
  const htmlPath = path.join(phaseDir, `${label}.html`);
  const pngPath = path.join(phaseDir, `${label}.png`);
  await fs.writeFile(htmlPath, await page.content(), "utf-8");
  await page.screenshot({ path: pngPath, fullPage: true });
  console.log(`  📄 ${htmlPath}`);
  console.log(`  🖼️  ${pngPath}`);
}

async function tryFindSelector(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      if ((await page.locator(sel).first().count()) > 0) return sel;
    } catch {/* noop */}
  }
  return null;
}

async function login(page: Page): Promise<boolean> {
  console.log("\n=== Phase: login ===");
  const phaseDir = path.join(DIAG_ROOT, "login");

  // Try login paths
  let loginUrl: string | null = null;
  for (const p of LOGIN_PATHS) {
    const url = SITE_BASE_URL + p;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (resp && resp.status() < 400) {
        loginUrl = url;
        console.log(`  ↪ Login page: ${url}`);
        break;
      }
    } catch (e) {
      console.log(`  ✗ ${url} → ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (!loginUrl) {
    console.error("  ❌ Login URL bulunamadı");
    await dumpPage(page, phaseDir, "login-not-found");
    return false;
  }

  await dumpPage(page, phaseDir, "01-login-page");

  const userSel = await tryFindSelector(page, LOGIN_SELECTORS.USERNAME_INPUTS);
  const passSel = await tryFindSelector(page, LOGIN_SELECTORS.PASSWORD_INPUTS);
  const submitSel = await tryFindSelector(page, LOGIN_SELECTORS.SUBMIT_BUTTONS);

  console.log("\n🔍 Login selectors:");
  console.log(`  username: ${userSel ?? "❌"}`);
  console.log(`  password: ${passSel ?? "❌"}`);
  console.log(`  submit:   ${submitSel ?? "❌"}`);

  if (!userSel || !passSel || !submitSel) {
    console.error("  ⚠️  Selector eksik");
    return false;
  }

  const creds = loadCredentials("enderyapi");
  console.log("\n🔑 Login deneniyor...");
  await page.fill(userSel, creds.username);
  await page.fill(passSel, creds.password);
  await page.click(submitSel);
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(2500);
  await dumpPage(page, phaseDir, "02-after-submit");

  const url = page.url();
  const stillOnLogin = LOGIN_PATHS.some((p) => url.includes(p));
  console.log(`  Post-submit URL: ${url}`);
  console.log(`  stillOnLoginPath: ${stillOnLogin}`);
  return !stillOnLogin;
}

async function phaseOrdersPagination(page: Page) {
  console.log("\n=== Phase: orders-pagination ===");
  const phaseDir = path.join(DIAG_ROOT, "orders-pagination");

  // Find orders page URL — SPA için networkidle + extra timeout (adapter pattern)
  let ordersUrl: string | null = null;
  for (const p of ORDER_HISTORY_PATHS) {
    const url = SITE_BASE_URL + p;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (resp && resp.status() < 400) {
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const rowSel = await tryFindSelector(page, ORDER_LIST_SELECTORS.ROW_CONTAINERS);
        console.log(`  ${url}: row selector = ${rowSel ?? "❌ yok"}`);
        if (rowSel) {
          ordersUrl = url;
          console.log(`  ↪ Orders: ${url} (row selector: ${rowSel})`);
          break;
        }
      } else {
        console.log(`  ✗ ${url} → status ${resp?.status()}`);
      }
    } catch (e) {
      console.log(`  ✗ ${url} → ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (!ordersUrl) {
    console.error("  ❌ Orders URL bulunamadı — current URL: " + page.url());
    await dumpPage(page, phaseDir, "no-orders-url");
    return;
  }

  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "page-1-default");
  const rows1 = await page.locator("table tbody tr").count();
  console.log(`  Sayfa 1: ${rows1} tablo satırı`);

  // Pagination DOM keşfi
  const paginationCandidates = [
    "ul.pagination",
    "nav.pagination",
    "div.pagination",
    "a[href*='page=']",
    "a[href*='sayfa=']",
    "a[href*='Page=']",
    "a[href*='Sayfa=']",
    "a:has-text('Sonraki')",
    "a:has-text('Next')",
    "a:has-text('»')",
    "button:has-text('Sonraki')",
    "button:has-text('Next')",
    ".page-link",
    "[class*='paginat' i]",
  ];
  console.log("\n  Pagination DOM candidate'ları:");
  for (const sel of paginationCandidates) {
    try {
      const c = await page.locator(sel).count();
      if (c > 0) {
        console.log(`    ✓ "${sel}" → ${c} eşleşme`);
        const first = page.locator(sel).first();
        const href = await first.getAttribute("href").catch(() => null);
        const text = (await first.textContent().catch(() => null))?.trim();
        if (href || text) console.log(`       href="${href ?? ""}" text="${text?.slice(0, 50) ?? ""}"`);
      }
    } catch {/* noop */}
  }

  // Tüm <a href> içinde "page" / "sayfa" geçenler
  const allHrefs = await page.locator("a").evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "").filter((h) => /sayfa|page/i.test(h)),
  );
  console.log(`\n  href'inde 'sayfa' veya 'page' geçen ${allHrefs.length} link (ilk 20):`);
  for (const h of allHrefs.slice(0, 20)) console.log(`    ${h}`);

  // Sayfa içindeki "Toplam ... sipariş" gibi text'ler
  const bodyText = (await page.locator("body").textContent())?.toLowerCase() ?? "";
  const totalsMatches = bodyText.match(/(toplam|total)\s*[:]*\s*\d+[\s\w]*/g);
  console.log(`\n  Sayfa text'inde "toplam ..." izleri:`);
  if (totalsMatches) for (const m of totalsMatches.slice(0, 5)) console.log(`    "${m}"`);
  else console.log(`    (yok)`);

  // İlk 3 orderNo'yu sayfa 1'den karşılaştırma için yakala
  async function firstThreeOrderNos(): Promise<string[]> {
    return await page.locator("table tbody tr").evaluateAll((rows) =>
      rows.slice(0, 3).map((tr) => {
        const cells = (tr as HTMLTableRowElement).querySelectorAll("td");
        // Sipariş kodu yaygın olarak 1. veya 2. sütun; ilk 3 hücreyi birleştir
        return Array.from(cells).slice(0, 3).map((c) => (c.textContent ?? "").trim()).join(" | ");
      }),
    );
  }

  await page.goto(ordersUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const page1Sample = await firstThreeOrderNos();
  console.log(`\n  Sayfa 1 ilk 3 satır örneği:`);
  for (const s of page1Sample) console.log(`    ${s}`);

  // Strategy 1: button "Sonraki" click
  console.log(`\n  → "Sonraki" buton click deneniyor`);
  const nextBtn = page.locator("button:has-text('Sonraki')").first();
  const btnCount = await nextBtn.count();
  if (btnCount > 0) {
    const isEnabled = await nextBtn.isEnabled().catch(() => false);
    console.log(`  Button found, enabled=${isEnabled}`);
    try {
      await nextBtn.click({ timeout: 5_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(2000);
      console.log(`  Post-click URL: ${page.url()}`);
      const page2Sample = await firstThreeOrderNos();
      console.log(`  Sayfa 2 (button click sonrası) ilk 3 satır:`);
      for (const s of page2Sample) console.log(`    ${s}`);
      const sameAsPage1 = JSON.stringify(page1Sample) === JSON.stringify(page2Sample);
      console.log(`  Pagination button çalıştı mı: ${sameAsPage1 ? "❌ aynı satırlar" : "✅ farklı satırlar"}`);
      await dumpPage(page, phaseDir, "page-2-via-button-click");
    } catch (e) {
      console.log(`  button click hatası: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // Strategy 2: ?page=2 URL
  console.log(`\n  → ?page=2 URL deneniyor`);
  try {
    const resp = await page.goto(ordersUrl + "?page=2", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    console.log(`  Status: ${resp?.status()}, final url: ${page.url()}`);
    const page2UrlSample = await firstThreeOrderNos();
    console.log(`  ?page=2 ilk 3 satır:`);
    for (const s of page2UrlSample) console.log(`    ${s}`);
    const sameAsPage1 = JSON.stringify(page1Sample) === JSON.stringify(page2UrlSample);
    console.log(`  ?page=2 URL çalıştı mı: ${sameAsPage1 ? "❌ aynı (sayfa 1 cache)" : "✅ farklı satırlar"}`);
    await dumpPage(page, phaseDir, "page-2-via-page-query");
  } catch (e) {
    console.log(`  hata: ${(e as Error).message.slice(0, 100)}`);
  }
}

async function main() {
  const { phase, headed } = parseArgs();
  console.log(`🚀 Enderyapı diag — phase: ${phase}`);
  await fs.mkdir(DIAG_ROOT, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const ok = await login(page);
    if (!ok) {
      console.error("  ❌ Login başarısız → diğer phase'ler atlanıyor");
      return;
    }

    if (phase === "orders-pagination" || phase === "all") await phaseOrdersPagination(page);

    console.log("\n✅ Diag complete.");
  } catch (e) {
    console.error(`\n❌ Diag error: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
