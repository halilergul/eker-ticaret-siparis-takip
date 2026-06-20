/**
 * Levent Şimşek DOM keşif aracı — Feature 011 (pagination).
 *   npm run diag:leventsimsek -- --phase orders-pagination [--headed]
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
} from "@/lib/scraper/adapters/leventsimsek.constants";

type Phase = "login" | "orders-pagination" | "all";

const DIAG_ROOT = path.resolve(process.cwd(), "tmp/leventsimsek-diag");

function parseArgs() {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf("--phase");
  const phase = (phaseIdx >= 0 ? args[phaseIdx + 1] : "orders-pagination") as Phase;
  return { phase, headed: args.includes("--headed") };
}

async function dumpPage(page: Page, dir: string, label: string) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${label}.html`), await page.content(), "utf-8");
  await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: true });
  console.log(`  📄 ${dir}/${label}.html`);
}

async function tryFindSelector(page: Page, selectors: readonly string[]) {
  for (const sel of selectors) {
    try { if ((await page.locator(sel).first().count()) > 0) return sel; } catch {/* noop */}
  }
  return null;
}

async function login(page: Page): Promise<boolean> {
  console.log("\n=== login ===");
  const phaseDir = path.join(DIAG_ROOT, "login");

  let loginUrl: string | null = null;
  for (const p of LOGIN_PATHS) {
    const url = SITE_BASE_URL + p;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (resp && resp.status() < 400) { loginUrl = url; console.log(`  ↪ ${url}`); break; }
    } catch (e) { console.log(`  ✗ ${url} → ${(e as Error).message.slice(0, 80)}`); }
  }
  if (!loginUrl) { console.error("  ❌ Login URL bulunamadı"); return false; }
  await dumpPage(page, phaseDir, "01-login");

  const userSel = await tryFindSelector(page, (LOGIN_SELECTORS as any).USERNAME_INPUTS ?? []);
  const passSel = await tryFindSelector(page, LOGIN_SELECTORS.PASSWORD_INPUTS);
  const submitSel = await tryFindSelector(page, LOGIN_SELECTORS.SUBMIT_BUTTONS);
  console.log(`  username=${userSel} password=${passSel} submit=${submitSel}`);
  if (!userSel || !passSel || !submitSel) return false;

  const creds = loadCredentials("leventsimsek");
  await page.fill(userSel, creds.username);
  await page.fill(passSel, creds.password);
  await page.click(submitSel);
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(2500);
  await dumpPage(page, phaseDir, "02-after-submit");
  const url = page.url();
  const stillOnLogin = LOGIN_PATHS.some((p) => url.includes(p));
  console.log(`  Post-submit URL: ${url}  stillOnLogin=${stillOnLogin}`);
  return !stillOnLogin;
}

async function phaseOrdersPagination(page: Page) {
  console.log("\n=== orders-pagination ===");
  const phaseDir = path.join(DIAG_ROOT, "orders-pagination");

  let ordersUrl: string | null = null;
  for (const p of ORDER_HISTORY_PATHS) {
    const url = SITE_BASE_URL + p;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (resp && resp.status() < 400) {
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const rowSel = await tryFindSelector(page, ORDER_LIST_SELECTORS.ROW_CONTAINERS ?? ["table tbody tr"]);
        console.log(`  ${url}: row=${rowSel ?? "❌"}`);
        if (rowSel) { ordersUrl = url; break; }
      }
    } catch (e) { console.log(`  ✗ ${url} → ${(e as Error).message.slice(0, 80)}`); }
  }
  if (!ordersUrl) {
    console.error("  ❌ Orders URL bulunamadı — current=" + page.url());
    await dumpPage(page, phaseDir, "no-orders");
    return;
  }

  await page.goto(ordersUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await dumpPage(page, phaseDir, "page-1");

  const rows1 = await page.locator("table tbody tr").count();
  console.log(`  Sayfa 1: ${rows1} satır`);

  const sample = async () =>
    await page.locator("table tbody tr").evaluateAll((rows) =>
      rows.slice(0, 3).map((tr) => {
        const cells = (tr as HTMLTableRowElement).querySelectorAll("td");
        return Array.from(cells).slice(0, 3).map((c) => (c.textContent ?? "").trim()).join(" | ");
      }),
    );
  const page1Sample = await sample();
  console.log(`  Sayfa 1 örnek:`); for (const s of page1Sample) console.log(`    ${s}`);

  const candidates = [
    "ul.pagination", "nav.pagination", "div.pagination",
    "a[href*='page=']", "a[href*='sayfa=']", "a[href*='Page=']",
    "a:has-text('Sonraki')", "a:has-text('»')",
    "button:has-text('Sonraki')", ".page-link", "[class*='paginat' i]",
  ];
  console.log("\n  Pagination DOM:");
  for (const sel of candidates) {
    try {
      const c = await page.locator(sel).count();
      if (c > 0) {
        const first = page.locator(sel).first();
        const href = await first.getAttribute("href").catch(() => null);
        const text = (await first.textContent().catch(() => null))?.trim()?.slice(0, 40);
        console.log(`    ✓ "${sel}" → ${c}  href="${href ?? ""}" text="${text ?? ""}"`);
      }
    } catch {/* noop */}
  }

  const allHrefs = await page.locator("a").evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "").filter((h) => /sayfa|page/i.test(h)),
  );
  console.log(`\n  href'inde 'sayfa/page' geçen ${allHrefs.length} link (ilk 10):`);
  for (const h of allHrefs.slice(0, 10)) console.log(`    ${h}`);

  for (const q of ["?page=2", "?sayfa=2"]) {
    console.log(`\n  → ${q}`);
    try {
      const resp = await page.goto(ordersUrl + q, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      console.log(`  Status: ${resp?.status()}  final: ${page.url()}`);
      const s2 = await sample();
      console.log(`  Örnek:`); for (const x of s2) console.log(`    ${x}`);
      const same = JSON.stringify(page1Sample) === JSON.stringify(s2);
      console.log(`  Sayfa 1 ile aynı mı: ${same ? "❌ aynı (cache)" : "✅ farklı"}`);
      await dumpPage(page, phaseDir, `page-2-${q.replace(/[?=]/g, "")}`);
    } catch (e) { console.log(`  hata: ${(e as Error).message.slice(0, 80)}`); }
  }
}

async function main() {
  const { phase, headed } = parseArgs();
  console.log(`🚀 Levent Şimşek diag — phase: ${phase}`);
  await fs.mkdir(DIAG_ROOT, { recursive: true });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const ok = await login(page);
    if (!ok) { console.error("  ❌ Login başarısız"); return; }
    if (phase === "orders-pagination" || phase === "all") await phaseOrdersPagination(page);
    console.log("\n✅ Done.");
  } catch (e) { console.error(`\n❌ ${(e as Error).message}`); process.exitCode = 1; }
  finally { await browser?.close(); }
}

main();
