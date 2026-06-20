export const SITE_BASE_URL = "https://b2b.enderyapi.com.tr";

// Login sayfası: site keşfi yapılmamış, yaygın aday'lar sırayla denenir.
export const LOGIN_PATHS = ["/login", "/uye-girisi", "/giris", "/account/login"] as const;

// Sipariş geçmişi sayfası: aynı stratejiyle yaygın aday'lar.
export const ORDER_HISTORY_PATHS = [
  "/account/orders",
  "/siparislerim",
  "/hesabim/siparislerim",
  "/orders",
] as const;

// Login form selector adayları — role-based önce, fallback CSS.
// İlk eşleşen kullanılır. PoC çalışırken `--verbose` ile hangisinin
// eşleştiği log'a yansır; sonraki feature'larda sabitleyebiliriz.
export const LOGIN_SELECTORS = {
  USERNAME_INPUTS: [
    'input[name="email"]',
    'input[name="username"]',
    'input[name="kullaniciAdi"]',
    'input[name="user"]',
    'input[type="email"]',
    'input[id*="email" i]',
    'input[id*="user" i]',
  ],
  PASSWORD_INPUTS: [
    'input[name="password"]',
    'input[name="sifre"]',
    'input[type="password"]',
    'input[id*="password" i]',
    'input[id*="sifre" i]',
  ],
  SUBMIT_BUTTONS: [
    // Klasik form submit
    'button[type="submit"]',
    'input[type="submit"]',
    // Text-tabanlı (TR + EN)
    'button:has-text("Giriş Yap")',
    'button:has-text("Giriş yap")',
    'button:has-text("Giriş")',
    'button:has-text("GİRİŞ")',
    'button:has-text("Login")',
    'a:has-text("Giriş Yap")',
    'input[value*="Giriş" i]',
    'input[value*="Login" i]',
    // Class / ID pattern
    'button[class*="login" i]',
    'button[class*="submit" i]',
    'button[id*="login" i]',
    'button[id*="submit" i]',
    // Form içindeki herhangi bir buton (son çare)
    'form button',
    'form input[type="button"]',
  ],
} as const;

// Sipariş listesi selector adayları
export const ORDER_LIST_SELECTORS = {
  ROW_CONTAINERS: [
    'table tbody tr',
    '[class*="order-item" i]',
    '[class*="siparis" i]',
    '[data-testid*="order"]',
    'article[class*="order" i]',
  ],
} as const;

// Sipariş listesi pagination (Enderyapı b2b) — 011 diag keşif (2026-06-20):
//   /siparislerim sayfası SPA, default 20 satır.
//   "Sonraki" button JS-driven ama URL'i ?page=N'e çeviriyor.
//   ?page=N direkt navigate çalışıyor (Status 200, farklı satırlar).
// Strategy: URL-based pagination, page size = 20.
export const ORDER_LIST_PAGE_URL_TEMPLATE = "/siparislerim?page={page}";
export const ORDER_LIST_MAX_PAGES = 50; // safety upper bound

// Ürün detay sayfası fiyat selector adayları
export const PRODUCT_DETAIL_SELECTORS = {
  PRICE_ELEMENTS: [
    '[class*="price" i]',
    '[class*="fiyat" i]',
    '[data-price]',
    'span:has-text("₺")',
    'div:has-text("₺")',
  ],
} as const;

// Bot / CAPTCHA / 2FA tespit pattern'ları
export const DETECTION_PATTERNS = {
  CAPTCHA_URL_KEYWORDS: [
    "cdn-cgi/challenge",
    "captcha",
    "challenge",
    "verify",
    "bot",
    "cf_chl",
  ],
  CAPTCHA_BODY_KEYWORDS: [
    "tarayıcınız kontrol ediliyor",
    "checking your browser",
    "i'm not a robot",
    "robot değilim",
    "complete the security check",
    "güvenlik kontrolü",
  ],
  CAPTCHA_IFRAME_SRC_PATTERNS: [
    "recaptcha",
    "hcaptcha",
    "challenges.cloudflare.com",
    "captcha-delivery",
  ],
  // Sadece spesifik 2FA pattern'lara izin ver — tek kelime "kod" / "doğrulama"
  // yaygın UI text'lerinde geçer (örn. "Ürün kodu", "Sipariş kodu") false positive
  // doğurur. Tam ifade veya context'li match şart.
  TFA_INPUT_NAMES: ["otp", "tfa_code", "twofactor", "2fa", "auth_code"],
  TFA_BODY_PHRASES: [
    "iki faktörlü kimlik doğrulama",
    "iki faktörlü doğrulama",
    "two-factor authentication",
    "doğrulama kodunu girin",
    "doğrulama kodunu giriniz",
    "verification code",
    "enter your verification code",
    "sms doğrulama kodu",
    "sms ile gönderilen kod",
    "authenticator uygulaması",
    "authenticator app",
    "google authenticator",
    "tek kullanımlık şifre",
    "one-time password",
    "telefonunuza gönderilen kod",
  ],
} as const;

// Türkçe hata mesajları (kullanıcıya gösterilir)
export const ERROR_MESSAGES = {
  MISSING_CREDS:
    "ENDERYAPI_USERNAME ve/veya ENDERYAPI_PASSWORD .env.local'da tanımlı değil",
  LOGIN_FAILED: "Login başarısız: geçersiz kullanıcı adı veya şifre",
  CAPTCHA_GENERIC: "CAPTCHA / bot koruması algılandı",
  TFA_REQUIRED: "2FA gerekli — PoC kapsam dışı",
  NETWORK: "Ağ hatası: siteye ulaşılamadı",
  UNEXPECTED_DOM: "Sayfa yapısı değişmiş",
  TIMEOUT: "İşlem zaman aşımı (60sn)",
  EMPTY_HISTORY: "Sipariş geçmişi boş — parse edilecek satır yok",
  COOKIE_BANNER_BLOCK: "Beklenmedik popup: cookie/KVKK onayı geçilemedi",
  UNKNOWN: "Beklenmedik hata",
} as const;

// Timeout'lar (ms)
export const TIMEOUTS = {
  LOGIN_MS: 15_000,
  NAVIGATION_MS: 20_000,
  GLOBAL_MS: 60_000,
} as const;

// Screenshot için
export const SCREENSHOT_DIR = "scrape-debug";

// Currency code (tek currency desteği)
export const DEFAULT_CURRENCY = "TRY" as const;
