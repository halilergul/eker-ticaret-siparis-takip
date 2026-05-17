/**
 * İkizler Hırdavat (http://bayi.ikizlerhirdavat.com) — adapter constants.
 *
 * UYARI: Bu site HTTP (HTTPS değil) — credential plaintext riski Eker tarafından
 * kabul edildi (spec FR-012). Ek mitigation yok.
 *
 * Platform tahmini: ASP.NET MVC (URL pattern: /Controller/Action).
 * Login giriş noktası kullanıcı tarafından doğrulandı: /Home/Giris.
 *
 * Selector adayları **best-guess** ile başlatıldı; iteratif keşif sırasında
 * --headed mode + scrape-debug/*.png ile refine edilir (006 deneyimi: CSS
 * class-tabanlı tercih, text-tabanlı son çare).
 *
 * Discovery checklist: specs/008-multi-supplier-orders/contracts/ikizler-discovery.md
 */

export const SITE_BASE_URL = "http://bayi.ikizlerhirdavat.com";

// Login sayfası: kullanıcı /Home/Giris'i doğruladı; diğerleri fallback.
export const LOGIN_PATHS = [
  "/Home/Giris",
  "/Account/Login",
  "/Login",
  "/Giris",
] as const;

// Sipariş geçmişi sayfası — kullanıcı keşfi (2026-05-17): site tüm belgeleri
// (sipariş, fatura, irsaliye) tek "/Home/Belgeler" sayfasında gösteriyor.
// BelgeTipDetayID=134 → "Sipariş" filtresini sabitler. Query string'siz
// versiyon da default olarak sipariş açıyor ama filtreyi sabitlemek daha güvenli.
export const ORDER_HISTORY_PATHS = [
  "/Home/Belgeler?BelgeTipDetayID=134",
  "/Home/Belgeler",
] as const;

// Login form selector adayları — scout-ikizler.ts ile doğrulandı.
// ASP.NET MVC model binding: PascalCase + Türkçe field isimleri.
export const LOGIN_SELECTORS = {
  USERNAME_INPUTS: [
    'input[name="KullaniciAdi"]', // ← scout ile doğrulandı
    'input[name="UserName"]',
    'input[name="Username"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[id*="user" i]',
    'input[id*="email" i]',
    'input[type="email"]',
  ],
  PASSWORD_INPUTS: [
    'input[name="Parola"]', // ← scout ile doğrulandı
    'input[name="Password"]',
    'input[name="password"]',
    'input[name="sifre"]',
    'input[type="password"]',
    'input[id*="password" i]',
    'input[id*="sifre" i]',
  ],
  SUBMIT_BUTTONS: [
    'button.login100-form-btn', // ← scout ile doğrulandı (Colorlib login template)
    'button[type="submit"]',
    'input[type="submit"]',
    'button[id*="login" i]',
    'button[id*="giris" i]',
    'button[class*="login" i]',
    'button[class*="giris" i]',
    'form button',
  ],
} as const;

// Sipariş listesi selector adayları (ASP.NET MVC scaffold genelde table).
export const ORDER_LIST_SELECTORS = {
  ROW_CONTAINERS: [
    'table.orders tbody tr',
    'table.table tbody tr',
    'table tbody tr',
    '[class*="siparis-row" i]',
    '[class*="order-row" i]',
    '[class*="siparis-item" i]',
  ],
} as const;

// Sipariş detay tablosu selector adayları.
export const ORDER_DETAIL_SELECTORS = {
  ITEM_ROWS: [
    'table.items tbody tr',
    'table.order-detail tbody tr',
    'table.table tbody tr',
    'table tbody tr',
    '[class*="urun-row" i]',
    '[class*="product-row" i]',
  ],
} as const;

// Timeout'lar — Enderyapı ile aynı default.
export const TIMEOUTS = {
  LOGIN_MS: 15_000,
  NAVIGATION_MS: 20_000,
  GLOBAL_MS: 60_000,
} as const;
