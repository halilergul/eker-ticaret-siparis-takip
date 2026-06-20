# Phase 0 Research: Yedekler İnşaat tedarikçi eklemesi

**Plan**: [plan.md](./plan.md)  
**Spec**: [spec.md](./spec.md)  
**Tarih**: 2026-06-04

## Amaç

Plan'da listelenen 8 bilinmeyeni implementation aşamasından önce karar/karara-zemin haline getirmek. Her karar için "Decision / Rationale / Alternatives considered" formatı.

---

## Decision 1: Site DOM keşfi iteratif `yedekler-diag.ts` script'i ile yapılır

**Decision**: Implementation'a başlamadan önce `scripts/scrape-tools/yedekler-diag.ts` adında tek seferlik bir keşif script'i yazılır. Bu script Playwright ile siteye login olur, login sonrası ana sayfa + sipariş listesi + sipariş detayı + catalog sayfalarına navigate eder, her sayfanın HTML/text dump'ını + screenshot'ını `tmp/yedekler-diag/` klasörüne yazar.

**Rationale**: 
- 008 ve 009'da aynı pattern başarıyla uygulandı (memory: "Bayipro catalog DOM" gibi tespitler bu yolla yapıldı)
- Speküle ederek selector yazmak vs. iteratif debug — ikincisi her zaman daha hızlı (yanlış tahminin maliyeti bir tam scrape koşumu)
- Diag artifact'ları (`tmp/`) commit edilmez; ama keşif esnasında kullanıcıyla paylaşmak için elimizde olur (örn: "şu sayfada şu selector var mı?")

**Alternatives considered**:
- (Reddedildi) Doğrudan adapter yazıp deneme-yanılma: 1-2 saat sürer, her hatalı tahmin tam koşum + login retry maliyeti
- (Reddedildi) Sadece curl + HTML inspect: B2B siteler genelde session-based; tek isteğe tahammül etmiyor, Playwright kaçınılmaz
- (Reddedildi) MITM proxy ile network capture: aşırı, sadece login formu için yeter

---

## Decision 2: Platform tipi keşif sırasında HTML/header'lardan tespit edilir

**Decision**: Diag script ana sayfa HTML response header'larını + URL pattern'larını dump eder. Ana ipuçları:
- `Server`, `X-Powered-By` HTTP header'ları
- Login URL extension (`.aspx`, `.php`, `.do`, "/")
- Markup pattern (asp.net'in tipik `<input type="hidden" id="__VIEWSTATE">`)
- JavaScript framework izleri (`jQuery`, `React` runtime'ı, Vue, vb.)

**Rationale**: Platform tipi bilince DOM gotcha'lar tahmin edilebilir:
- **ASP.NET** → `__VIEWSTATE`, `__EVENTVALIDATION` form alanları, postback model
- **PHP (custom)** → Genelde basit form, query string ile sayfa geçişi
- **PHP (Laravel/Symfony)** → CSRF token form'da gizli alan olarak
- **SaaS B2B** → AJAX-yoğun, JSON response'lar; selektör değil API endpoint'i tercih edilir

**Alternatives considered**:
- (Reddedildi) Platform tahmin etmeden direkt selector yaz: bilinmeyen gotcha'lar maliyetli olur
- (Reddedildi) Builtwith.com gibi 3rd-party servis: nezaketsiz + B2B sitelerde genelde anonim erişilemez

---

## Decision 3: Sipariş listesi/detay/catalog sayfaları için ayrı diag aşamaları

**Decision**: `yedekler-diag.ts` sırayla çalıştırılır:
1. **Login phase**: 3 alanı doldurup submit; başarı doğrulama
2. **Orders list phase**: Sipariş geçmişi menüsünden listeye git; HTML + screenshot
3. **Order detail phase**: İlk siparişe tıkla; detay sayfası HTML + screenshot
4. **Catalog phase**: Ürün katalog/listesi sayfasına git; HTML + screenshot

Her phase ayrı CLI sub-command olabilir (`--phase login|orders|order-detail|catalog`) ki tekrar tekrar tüm akışı koşmaya gerek olmasın.

**Rationale**: Adapter implementation aşamasında her phase için ayrı selector seti gerek. Diag artifact'ları phase-bazlı tutmak debug'ı kolaylaştırır.

**Alternatives considered**:
- (Reddedildi) Tek monolitik script: değişiklik yapınca tüm akışı yeniden koşmak gerek; yavaş
- (Reddedildi) `--all` parametre ile flat akış: phase'leri ayırınca diag artifact dosya organizasyonu daha temiz olur

---

## Decision 4: Görsel scrape (image_url) keşif sonrası karar verilir

**Decision**: Catalog phase diag çıktısında `<img>` tag'leri olup olmadığı kontrol edilir. 
- **Eğer liste sayfasında her ürün için `<img src="..."` varsa** → adapter `scrapeCatalog` içinde imageUrl da çekilir; `next.config.ts` whitelist'ine domain eklenir.
- **Modal-tabanlı (her ürün için modal aç + img al)** → atlanır, 011'e ertelenir (İkizler pattern'i).

**Rationale**: 008/009'da Enderyapı + Levent için liste sayfasındaki img src çekilebildi (Enderyapı: bayipro CDN, Levent: `product_imagesplaceholder`). Eğer Yedekler de benzer ise hızlı kazanım; modal-tabanlı ise scope artar, ROI düşer.

**Alternatives considered**:
- (Reddedildi) Her durumda görseli çek (modal dahil): 111 ürün × 2sn modal açma = 4dk ekstra süre, scope büyür
- (Reddedildi) Görseli hiç çekme: işlevsel açıdan eksiklik yaratmaz ama UX bonus kaçırılır

---

## Decision 5: 3-alanlı credentials için `loadYedeklerCredentials()` ayrı export

**Decision**: `scripts/scrape/credentials.ts` dosyasında mevcut `loadCredentials(slug)` (2-alanlı) korunur. Yedekler için ayrı export:

```typescript
const yedeklerCredentialsSchema = z.object({
  customerCode: z.string().min(1, "customer code boş olamaz"),
  userCode: z.string().min(1, "user code boş olamaz"),
  password: z.string().min(1, "password boş olamaz"),
});

export type YedeklerCredentials = z.infer<typeof yedeklerCredentialsSchema>;

export function loadYedeklerCredentials(): YedeklerCredentials {
  dotenv.config({ path: ".env.local" });
  const result = yedeklerCredentialsSchema.safeParse({
    customerCode: process.env.YEDEKLER_CUSTOMER_CODE,
    userCode: process.env.YEDEKLER_USER_CODE,
    password: process.env.YEDEKLER_PASSWORD,
  });
  if (!result.success) {
    throw new ScrapeError({
      mode: "missing-credentials",
      step: "env-load",
      details: "Eksik env: YEDEKLER_CUSTOMER_CODE, YEDEKLER_USER_CODE, YEDEKLER_PASSWORD",
    });
  }
  return result.data;
}
```

**Rationale**: 
- Generic'leştirme (örn. `loadCredentials<T extends Record<string, string>>(...)`) over-engineering — sadece 1 tedarikçi 3-alanlı
- Adapter dosyası okunaklı kalır
- Geri uyumluluk garantili (mevcut adapter'lar değişmez)

**Alternatives considered**:
- (Reddedildi) Tüm credentials API'sini variadic'leştir: kod tabanında 4 dosya değişimi gerek, 1 dosya değişimine göre fazla
- (Reddedildi) Adapter'ın direkt `process.env`'i okuması: validation ve error messaging kaybedilir
- (Reddedildi) Schema'yı runtime'da seçen tek fonksiyon (`loadCredentials(slug, schema?)`): okunabilirlik düşer

---

## Decision 6: HTTPS vs HTTP — keşif sonrası karar, gerekirse Constitution'a not düşülür

**Decision**: `bayi.yedekler.com.tr` HTTPS/HTTP durumunu diag script ilk login attempt'inde kayda alır.
- **HTTPS ise**: Standart akış, ek karar yok.
- **HTTP ise**: 008'deki İkizler precedent'i uygulanır:
  1. Kullanıcıya `AskUserQuestion` ile durum bildirilir, credentials plaintext gönderim riskini kabul edip etmediği sorulur
  2. Onay verilirse Constitution'a 2026-06-XX tarihli karar satırı eklenir
  3. Adapter dosyasında bir top-level yorum bu risk'i not eder

**Rationale**: 
- B2B siteler genelde HTTPS kullanır (kurumsal müşteri); ama Türkiye'de bazı eski sistemler hâlâ HTTP
- Kullanıcı kararı açık iletişim gerektirir (sessizce kabul edilmez)
- Constitution'da precedent var; akış net

**Alternatives considered**:
- (Reddedildi) HTTP ise feature'ı durdur: kullanıcı tedarikçinin kullanımını taahhüt etti; sistem üzerinden veya manuel — aynı risk
- (Reddedildi) HTTPS proxy üzerinden yönlendir: bu kontrolümüz dışında

---

## Decision 7: Sayfa hacmi (catalog/orders) — varsayım + measurable check

**Decision**: Implementation öncesi varsayım: catalog 50-500 ürün, sipariş listesi son N adet (limit DB query yapılır). İlk koşumda metric loglanır:
- `products_observed` (catalog'da kaç ürün tarandı)
- `orders_total` (sipariş listesinden kaç sipariş)

Eğer **catalog > 500 ürün**: pagination veya batching tasarımı 011'e ertelenir (gerekirse).
Eğer **orders > 200 sipariş listesi sayfasında**: pagination eklenir (008'deki Levent için yapıldığı gibi).

**Rationale**: Premature optimization değil; gerçek hacim ölçülünce karar verilir. Mevcut altyapı (orchestrator 5dk default, workflow 8dk override) 500 ürünü tutar.

**Alternatives considered**:
- (Reddedildi) Şimdiden pagination tasarla: bilmediğimiz bir şeyi tasarlamak gereksiz
- (Reddedildi) Tüm sipariş geçmişini tara: tipik B2B müşterisinin ayda ~10-50 siparişi; aktif siparişler + son 90 gün yeter

---

## Decision 8: KDV oranı default %20, sayfadan parse edebilirse override

**Decision**: 006/009 pattern'ini takip et:
- Adapter `scrapeCatalog` ürün başına KDV oranını parse etmeye çalışır (selector veya regex)
- Parse edilemezse `vatRate: 0.20` default kullanılır
- Log'a "KDV parse edilemedi, %20 varsayıldı" satırı düşülür (debug için, hata değil)

**Rationale**: Türkiye standart KDV %20; Yedekler İnşaat malzemesi nadiren %1/%8 olur; doğru oran kritik değil çünkü `unit_price_at_order` zaten KDV hariç saklanır, KDV sadece toplam hesabında kullanılır (UI tarafında ek bilgi).

**Alternatives considered**:
- (Reddedildi) KDV oranı şart koşma (parse edemezse fail): aşırı katı, useful veriyi kaybeder
- (Reddedildi) Default %18: 2025 sonrası Türkiye KDV %20 (`web search not needed — assumption belge`, memory'de var)

---

## Risk Tablosu

| Risk | İhtimal | Etki | Mitigation |
|---|---|---|---|
| Login formunda captcha | Düşük | Yüksek (otomatize edilemez) | Diag script'te erken tespit; varsa kullanıcı uyarılır, manuel oturum yolu konuşulur |
| Multi-step login wizard | Orta | Orta | Adapter login flow'u step-bazlı yazılır; mevcut pattern destekler |
| AJAX-yoğun catalog (selector yerine network capture gerek) | Düşük | Orta | Playwright zaten JS render'lı sayfaları görüyor; gerekirse `page.waitForResponse()` ile API capture |
| Site session timeout 5dk altında | Düşük | Orta | Catalog phase'i orders'tan sonra; gerekirse 2 ayrı login |
| Yedekler ürün kodu format'ı mevcut tedarikçilerle çakışır | Çok düşük | Yok | Schema zaten supplier_id ile composite unique |
| HTTP plaintext credentials | Bilinmiyor (diag sonrası net) | Düşük-Orta | İkizler precedent; user onayı + Constitution log |
| Görsel CDN cross-origin blocked | Düşük | Düşük | Hot-link test diag'ta yapılır; `next.config.ts` whitelist |
| Yedekler işletme tatil/etkinlik gününde login engellenir | Düşük | Düşük | Failure mode `login-failed`; retry; cron ertelenmez |

---

## Sonraki Adım

`research.md` complete. Phase 1'e geçilir:
- `data-model.md`
- `contracts/adapter-interface.md`
- `quickstart.md`
- `CLAUDE.md` SPECKIT marker güncellemesi
