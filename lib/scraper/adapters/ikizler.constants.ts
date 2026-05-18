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

// -----------------------------------------------------------------------------
// 009 — Catalog scrape (zamlanan ürünler genişlemesi)
// -----------------------------------------------------------------------------
//
// Keşif (2026-05-17, T007-T011): İkizler ürün fiyatı modal-tabanlı.
//   - Tüm ürünler listing: /Home/AramaSonuc?OzelFiltre=TumUrunler&KategoriAgacID=0
//   - Search POST: /Home/AramaSonuc  body: KategoriAgacID=0&SearchText=<code>
//   - Detay sayfası: /Home/UrunDetay?ID=<numeric>  (ID-based, kod→ID deterministik değil)
//   - Detay sayfasında `<a class="fiyatgoster" hoverattr="<ID>" data-bs-target="#productModalId">`
//     butonu var. Tıklanınca JS modal'ı (#productModalId) Liste/İskontolu/Net fiyat satırlarıyla
//     dolduruyor. Veri sayfa scope'unda gömülü (XHR yok).
//
// Modal row yapıları (Bootstrap col-* grid):
//   - "Ürün : <kod> - <ad>"                       (col-6 + col-6)
//   - "İskonto : %X+%Y"                           (col-6 + col-6, sadece iskonto varsa)
//   - "Liste Fiyatı : 95.000 TL"                  (col-6 + col-6)
//   - "İskontolu Fiyat : <fiyat> TL"              (col-6 + col-6, sadece iskonto varsa)
//   - "İskonto Tutarı : <fiyat>"                  (col-6 + col-6, sadece iskonto varsa)
//   - "KDV Tutarı : <fiyat>"                      (col-6 + col-6, sadece KDV > 0)
//   - "Net Fiyatı : <NET> KDV(<oran>) <birim>"    (col-6 + col-2 + col-2 + col-2)
//
// Sayı formatı: JavaScript `.toFixed(decimalCount)` çıktısı — nokta=decimal, thousands sep YOK.
//   "95.000 TL" → 95.0 ; "1234.560 TL" → 1234.56
//
// Canonical fiyat eşlemesi:
//   - unitPriceExclVat = İskontolu Fiyat (varsa) yoksa Liste Fiyatı
//   - vatRate = KDV(N) parantezinden N → N/100
//   - unitPriceWithVat = Net Fiyatı (modal'da hesaplanmış); fallback = exclVat × (1 + vatRate)
//   - listPrice = Liste Fiyatı
//   - discountText = İskonto satırı (varsa)

export const CATALOG_LISTING_URL = `${SITE_BASE_URL}/Home/AramaSonuc?OzelFiltre=TumUrunler&KategoriAgacID=0`;

export const CATALOG_SEARCH_INPUT_SELECTOR = 'input[name="SearchText"]';

// Search result sayfasında ilk ürün detay linki
export const CATALOG_FIRST_RESULT_SELECTORS = [
  'a[href*="/Home/UrunDetay"]',
] as const;

// Detail page price modal trigger + container
export const CATALOG_PRICE_MODAL = {
  TRIGGER: 'a.fiyatgoster, .fiyatgoster',
  CONTAINER: '#productModalId',
  CLOSE: '#productModalId [data-bs-dismiss="modal"]',
} as const;

// Modal içindeki row'ların label text'leri (parse rehberi)
export const CATALOG_MODAL_LABELS = {
  PRODUCT: /^\s*Ürün\s*:/i,
  ISKONTO: /^\s*İskonto\s*:(?!.*Tutar)(?!.*Fiyat)/i, // "İskonto :" — ama "İskonto Tutarı" veya "İskontolu Fiyat" değil
  LIST_PRICE: /^\s*Liste\s*Fiyat[ıi]?\s*:/i,
  ISKONTOLU: /^\s*İskontolu\s*Fiyat\s*:/i,
  NET_PRICE: /^\s*Net\s*Fiyat[ıi]?\s*:/i,
} as const;
