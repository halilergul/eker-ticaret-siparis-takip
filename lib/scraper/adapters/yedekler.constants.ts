/**
 * Yedekler İnşaat (https://bayi.yedekler.com.tr) — adapter constants.
 *
 * Platform: Classic ASP (Login.asp — diag 2026-06-04 ile doğrulandı).
 * Protocol: HTTPS ✓ (no Constitution concession needed).
 * Login form: 3-alanlı — müşteri kodu + kullanıcı kodu + parola.
 *   Legacy naming uyarısı: name="KullaniciAdi" aslında Müşteri Kodu taşır
 *   (placeholder="Müşteri Kodu"). name="KullaniciKodu" gerçek Kullanıcı Kodu.
 *   3-alanlı login için loadYedeklerCredentials() helper'ı kullanılır.
 *
 * Selector değerleri yedekler-diag.ts çıktısı sonrası refine edildi.
 */

export const SITE_BASE_URL = "https://bayi.yedekler.com.tr";

// Login giriş noktası — site `/` → Login.asp'a redirect ediyor.
export const LOGIN_PATHS = [
  "/Login.asp",
  "/",
] as const;

// Sipariş listesi sayfası — diag 2026-06-04: classic ASP convention (PascalCase + .asp).
export const ORDER_HISTORY_PATHS = [
  "/Siparislerim.asp",
] as const;

// Sipariş detay URL pattern — query string router:
//   Siparislerim.asp?Pages=SiparisListele&ID=<orderId>
// Burada orderId DB autoincrement (örn. 43951); display orderNo ayrı (YB26061900024).
export const ORDER_DETAIL_URL_TEMPLATE = "/Siparislerim.asp?Pages=SiparisListele&ID={id}";

// Catalog/ürün listesi — Yedekler iki ayrı page sunuyor:
//   /Urunler.asp        → ürün katalog (US2 ana hedef)
//   /FiyatListesi.asp   → fiyat listesi (alternatif; opsiyonel)
//   /Kataloglar.asp     → PDF download (US2 dışı)
export const CATALOG_PATHS = [
  "/Urunler.asp",
  "/FiyatListesi.asp",
] as const;

// Login form selector'ları — diag 2026-06-04 ile doğrulandı.
// Legacy naming: name="KullaniciAdi" placeholder="Müşteri Kodu" (Sicil kodu olarak değil semantic mismatch).
export const LOGIN_SELECTORS = {
  CUSTOMER_CODE_INPUTS: [
    'input[name="KullaniciAdi"]', // ← gerçek müşteri kodu alanı (legacy name)
    'input[placeholder*="müşteri" i]',
  ],
  USER_CODE_INPUTS: [
    'input[name="KullaniciKodu"]', // ← gerçek kullanıcı kodu
    'input[placeholder*="kullanıcı" i]',
  ],
  PASSWORD_INPUTS: [
    'input[name="Sifre"]',
    'input[type="password"]',
  ],
  SUBMIT_BUTTONS: [
    'button:has-text("Giriş")',
    'button[type="submit"]',
    'input[type="submit"]',
  ],
} as const;

// Login başarı tespiti — diag 2026-06-04: site `Siparislerim.asp`'a redirect ediyor,
// title "Genel Bakış" (default.asp da olabilir, içerikte aynı dashboard). Çıkış linki
// her zaman görünür → en güvenilir DOM marker'ı.
export const LOGIN_SUCCESS_MARKERS = {
  URL_PATTERNS: ["/Siparislerim.asp", "/default.asp", "/Default.asp"],
  DOM_SELECTORS: [
    'a[href*="Logout.asp" i]',
    'a:has-text("Çıkış")',
  ],
} as const;

// Sipariş listesi DOM selector'ları — Siparislerim.asp tam liste (50 sipariş).
// Tablo:
//   <table class="table table-hover">
//     <thead><tr><th>Sipariş Kodu</th><th>Tutar</th><th>Sip. Tarihi</th>
//                <th>Sip. Kanalı</th><th>Durum</th><th>Detaylar</th></tr></thead>
//     <tbody><tr><td class="center">YB26061900024</td>
//                <td class="center">3.752,58 TL</td>
//                <td class="center">19.06.2026</td>
//                <td class="center">PLASIYER</td>
//                <td class="center"><span class="label label-primary">Tamamlandı</span></td>
//                <td class="text-right"><a href="Siparislerim.asp?Pages=SiparisListele&ID=43951">Görüntüle</a></td>
// NOT: Sipariş kodu 1. sütunda TEXT olarak; detail link 6. sütunda "Görüntüle" buton-link.
//      (Genel Bakış'taki Tutar/Tarih sırası farklı; Siparislerim.asp ayrı sıralama.)
// Tablo class: "table table-striped" + id="sort" (Genel Bakış'taki "table-hover" değil!).
export const ORDER_LIST_SELECTORS = {
  TABLE: "table#sort.table-striped, table.table.table-striped",
  ROW: "tbody tr",
  ORDER_NO_CELL: "td:nth-child(1)",
  TOTAL_AMOUNT_CELL: "td:nth-child(2)",
  ORDERED_AT_CELL: "td:nth-child(3)",
  CHANNEL_CELL: "td:nth-child(4)",
  STATUS_LABEL: "td:nth-child(5) span.label",
  DETAIL_LINK: "td:nth-child(6) a, td.text-right a[href*='SiparisListele']",
} as const;

// Sipariş detayı DOM selector'ları — Siparislerim.asp?Pages=SiparisListele&ID=<id>.
// Tablo: <table class="table table-striped">
//   <tbody class="SepeteEklenenUrunler">
//     <tr id="<URUN_KODU>">
//       <td>FRT 7354000191</td>     <!-- Ürün Kodu -->
//       <td>FIRAT NEW GARDEN HORTUM 3/4</td>  <!-- Ürün Tanımı -->
//       <td>36,79 TL</td>            <!-- Fiyat (liste birim — KDV hariç) -->
//       <td>100 MT</td>              <!-- Adet + birim — "100" + " MT" -->
//       <td>3679 TL</td>             <!-- Tutar = Fiyat × Adet (KDV hariç, indirimsiz) -->
//       <td>3127,15 TL</td>          <!-- İskontolu Tutar = TAKİP DEĞERİ (KDV hariç net) -->
// NOT: Takip değişkeni = İskontolu Tutar / Adet (KDV hariç net birim fiyat).
//      sipariş list page'teki "Tutar" = İskontolu Tutar × 1.20 (KDV dahil müşteri toplamı).
export const ORDER_DETAIL_SELECTORS = {
  ITEM_TBODY: "tbody.SepeteEklenenUrunler",
  ITEM_ROW: "tbody.SepeteEklenenUrunler tr",
  PRODUCT_CODE_CELL: "td:nth-child(1)",
  PRODUCT_NAME_CELL: "td:nth-child(2)",
  UNIT_PRICE_CELL: "td:nth-child(3)",      // liste fiyat — kullanmıyoruz
  QUANTITY_CELL: "td:nth-child(4)",
  GROSS_TOTAL_CELL: "td:nth-child(5)",     // liste × adet — kullanmıyoruz
  NET_TOTAL_CELL: "td:nth-child(6)",       // İskontolu Tutar = TAKİP
} as const;

// Catalog DOM selector'ları — Urunler.asp ("Fiyat Listesi" title).
// Tablo: <table class="table table-hover table-striped" id="sort">
//   <thead><tr><th>Resim</th><th>Ürün Kodu</th><th>Ürün Tanımı</th>
//              <th>KDV</th><th>Birim</th><th>(stok icon)</th><th>Liste Fiyatı</th></tr></thead>
//   <tbody><tr id="<URUN_KODU>">
//              <td><img src="https://adm.yedekler.com.tr/Uploads/urunler/X.jpg"></td>
//              <td>NLB 014 01</td>
//              <td>TAVLI TEL SİYAH</td>
//              <td>%20</td>
//              <td>KG</td>
//              <td>-</td>
//              <td class="text-right"><strong>87,45 TL</strong></td></tr>
// NOT: Yedekler catalog'da TEK fiyat sütunu (Liste Fiyatı) — net özel/iskonto YOK.
//      Login'li bayi paneli olduğumuz için bu fiyat ZATEN bayi-özel KDV DAHIL fiyatı.
//      unitPriceExclVat = listFiyati / (1 + vatRate).
// 5200+ ürün (104 sayfa × 50) → search-based scrape: her sipariş ürün kodu için
//      ?FAdi=<kod>&F=Ara sorgusu, tek satır sonuç.
export const CATALOG_SELECTORS = {
  TABLE: "table#sort.table-hover",
  ROW: "tbody tr[id]",
  PRODUCT_CODE_CELL: "td:nth-child(2)",
  PRODUCT_NAME_CELL: "td:nth-child(3)",
  VAT_CELL: "td:nth-child(4)",
  LIST_PRICE_CELL: "td:nth-child(7)",
  // Resim td'de id="resim" var (duplicate id'ler HTML standart ihlali ama Yedekler
  // ASP böyle yazıyor — Playwright her satırda kendi scope'unda doğru img'i bulur).
  IMAGE: "img.lazy, td#resim img, td:nth-child(1) img",
} as const;

// Catalog sayfa URL — paginated full-scan için.
// 2026-06-20 bulgu: scrape:catalog/scrape:all akışında /Urunler.asp HTTP 500 dönüyor
// (login sonrası state ile uyumsuz), ama /FiyatListesi.asp aynı içeriği 200 ile veriyor.
// Diag tryGoto fallback ile bunu maskeliyordu. Fallback listesi tutuyoruz.
// Sayfa 1: parametresiz; Sayfa 2+: ?sayfa=N. Catalog ana yol failover ile denenir.
export const CATALOG_FIRST_PAGE_PATHS = [
  "/FiyatListesi.asp",
  "/Urunler.asp",
] as const;
export const CATALOG_PAGE_URL_TEMPLATES = [
  "/FiyatListesi.asp?sayfa={page}",
  "/Urunler.asp?sayfa={page}",
] as const;

// Catalog tarama limit — Yedekler dump'ında 104 sayfa görüldü; safety margin ile 110.
export const CATALOG_MAX_PAGES = 110;

// Sipariş listesi pagination — 011 diag keşif (2026-06-20):
//   /Siparislerim.asp?sayfa=N pattern çalışıyor (Status 200).
//   Sayfa 1 (parametresiz): 50 satır default. Sayfa 2: 12 satır → toplam 62 sipariş.
//   Out-of-range (?sayfa=99) boş tablo döner (graceful stop sinyali).
// Strategy: URL-based pagination (research.md R-005, strateji A).
export const ORDER_LIST_PAGE_URL_TEMPLATE = "/Siparislerim.asp?sayfa={page}";
export const ORDER_LIST_MAX_PAGES = 50; // safety upper bound

// Görsel CDN — adm.yedekler.com.tr Uploads klasörü (next.config.ts whitelist'inde).
export const IMAGE_CDN_HOST = "adm.yedekler.com.tr";

// KDV default (parse edilemediği zaman) — 006/009 ile aynı: %20.
export const DEFAULT_VAT_RATE = 0.2;
