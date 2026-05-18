/**
 * Levent Şimşek Armatür (https://liste.leventsimsekarmatur.com) — adapter constants.
 *
 * Platform tahmini: PHP (URL pattern: /index.php + query string).
 * Login giriş noktası kullanıcı tarafından doğrulandı: /index.php.
 *
 * Selector adayları **best-guess** ile başlatıldı; iteratif keşif sırasında
 * --headed mode + scrape-debug/*.png ile refine edilir.
 *
 * Discovery checklist: specs/008-multi-supplier-orders/contracts/leventsimsek-discovery.md
 *
 * Armatür ürün adları çift tırnak, kesme işareti, slash içerebilir
 * (örn. 1/2" Bakır Dirsek) — Postgres text columns güvenli; CSS class-tabanlı
 * selector zorunlu (text-tabanlı parse risk noktası).
 */

export const SITE_BASE_URL = "https://liste.leventsimsekarmatur.com";

// Login giriş noktası — site keşfi sırasında doğrulandı.
// URL pattern: /?p/<action> (PHP query string router).
// Form fields desktop + mobile dropdown'da gizli (visible=false); DOM'da mevcut.
export const LOGIN_PATHS = [
  "/?p/loginvendor",
  "/?p=loginvendor",
  "/?p/login",
] as const;

// Sipariş geçmişi sayfası — kullanıcı keşfi (2026-05-17): gerçek URL
// /?p=showorder&mode=normal (eşit işareti ile, slash değil).
// mode=normal muhtemelen "normal sipariş" filtresi (vs. iptal vs. taslak).
export const ORDER_HISTORY_PATHS = [
  "/?p=showorder&mode=normal",
  "/?p=showorder",
  "/?p/showorder",
] as const;

// Login form selector adayları — scout-leventsimsek.ts ile doğrulandı.
export const LOGIN_SELECTORS = {
  USERNAME_INPUTS: [
    'input[name="cusername"]', // ← scout ile doğrulandı
    'input[name="username"]',
    'input[name="user"]',
    'input[name="email"]',
    'input[name="kullanici"]',
    'input[type="email"]',
    'input[id*="user" i]',
    'input[id*="email" i]',
    'input[placeholder*="mail" i]',
  ],
  PASSWORD_INPUTS: [
    'input[name="cpassword"]', // ← scout ile doğrulandı
    'input[name="password"]',
    'input[name="sifre"]',
    'input[name="pass"]',
    'input[type="password"]',
    'input[id*="password" i]',
    'input[id*="sifre" i]',
  ],
  SUBMIT_BUTTONS: [
    'input[type="submit"][name="login"]', // ← scout ile doğrulandı
    'input[type="submit"].submit',
    'input[type="submit"]',
    'button[type="submit"]',
    'button[name="login"]',
    'button[class*="login" i]',
    'button[class*="giris" i]',
    'form button',
  ],
} as const;

// Sipariş listesi selector adayları (PHP scaffold genelde table).
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

export const TIMEOUTS = {
  LOGIN_MS: 15_000,
  NAVIGATION_MS: 20_000,
  GLOBAL_MS: 60_000,
} as const;

// -----------------------------------------------------------------------------
// 009 — Catalog scrape (zamlanan ürünler genişlemesi)
// -----------------------------------------------------------------------------
//
// Keşif (2026-05-18, T020-T022):
//   - Search endpoint (GET): /index.php?p=search&search=<code>
//     Hidden input `p=search` form'da zorunlu; aksi halde anasayfaya redirect.
//   - Search input adı: `search` (form GET, action=/index.php)
//   - Detail URL pattern: /<slug>-_<numericID>.html
//     Örn: /selen-kapakli-tuvalet-kagitligi-_15393.html
//     ID-based; kod → ID deterministik üretilemez → search zorunlu.
//   - Search "S001" gibi muhasebe kodlarıyla çalışıyor ama **substring match**
//     (S001 araması S001, S0010 vs döndürür) → 4+ sonuç gelirse doğru olanı
//     filtrelemek gerekir (muhasebe kodu exact match).
//   - 2 kod sistemi: Muhasebe Kodu (DB'de `code`, kısa, ör. S001) +
//     Barkod (uzun numerik, ör. 212102590). DB sadece muhasebe kodunu biliyor.
//
// Detail page fiyat yapısı:
//   <div class="dFyt">
//     <span class="listtext">Nakit Fiyatı:</span>
//     <span class="divsinglepriceUPSNAKIT"><span id="pric">14.933,38</span> ₺</span>
//   </div>
//   ... (Liste Fiyatı, Tek Çekim, Kredi Kartı Taksitli, Vadeli)
//
// Canonical takip değişkeni:
//   Nakit Fiyatı (KDV hariç bayi alma fiyatı; not: "* KDV HARİÇ FİYATLARDIR")
//   → unitPriceExclVat = Nakit Fiyatı
//   → vatRate = 0.20 (default; KDV hariç notu açık)
//   → unitPriceWithVat = Nakit × 1.20
//   → listPrice = Liste Fiyatı (referans)

export const CATALOG_SEARCH_URL_TEMPLATE = `${SITE_BASE_URL}/index.php?p=search&search=`;

// Detail page üzerindeki fiyat satırları — class-based, multi-language safe
export const CATALOG_PRICE_SELECTORS = {
  ROW: ".dFyt",
  LABEL: ".listtext",
  // Nakit Fiyatı için spesifik class (en güvenilir):
  NAKIT_VALUE_CONTAINER: ".divsinglepriceUPSNAKIT",
  // Liste Fiyatı için id pattern: divdiscount2price<ID> — dynamic ID, regex/contains
  LIST_VALUE_CONTAINER: '[id^="divdiscount2price"]',
  // Value span (her container içinde): #pric
  VALUE_SPAN: "#pric",
} as const;

// Search result page — ürün card linkleri
export const CATALOG_SEARCH_RESULT_SELECTORS = [
  'a[href*="_"][href*=".html"]',
] as const;

// Default KDV oranı — site "KDV HARİÇ FİYATLARDIR" notuyla net biçimde belirtiyor.
export const DEFAULT_VAT_RATE = 0.2;
