# Research: 008 İkizler + Levent Şimşek tedarikçileri

**Date**: 2026-05-17 | **Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Spec'te [NEEDS CLARIFICATION] yok; bu döküman teknik karar gerekçelerini, alternatifleri ve referans bağlamı kaydeder.

---

## R-001 — Per-supplier constants nasıl organize edilir?

**Decision**: Her adapter ile yan yana `lib/scraper/adapters/<slug>.constants.ts` dosyası.

**Rationale**:
- Mevcut `scripts/scrape/constants.ts` enderyapi-spesifik (`SITE_BASE_URL = "https://b2b.enderyapi.com.tr"` sabit). 3 site için aynı sabit isimleri çakışıyor — namespace gerekir.
- Adapter ile yan yana dosya: keşif sırasında git diff tek klasörde, kod review kolay, adapter dosyası bağımsızlığını korur (Constitution adapter-mimari kararı).
- Mevcut `scripts/scrape/constants.ts` dokunulmaz — `LOGIN_SELECTORS`, `DETECTION_PATTERNS`, `ERROR_MESSAGES` gibi **enderyapi-spesifik OR ortak** alanlar var. Sonraki refactor'de bölünebilir (gelecek scope).

**Alternatives considered**:
- *Tek dosya, namespace prefix*: `ENDERYAPI_SITE_BASE_URL`, `IKIZLER_SITE_BASE_URL`... — okunabilirlik düşük, dosya 500+ satır olur.
- *Adapter içinde inline*: enderyapi adapter zaten 30K karakter → daha da şişer; tekrar kullanılan selector havuzları gizli kalır.

---

## R-002 — İkizler (ASP.NET MVC) DOM keşif stratejisi

**Decision**: İteratif keşif: önce `--headed` Playwright + tam sayfa screenshot dump, sonra DOM parse + CSS class/id tespit, son aşamada selector array'i.

**Rationale**:
- Site URL `bayi.ikizlerhirdavat.com/Home/Giris` → MVC pattern (`/Controller/Action`).
- ASP.NET MVC tipik form: `name="UserName"`, `name="Password"`, `__RequestVerificationToken` hidden input. CSRF token form içinde geliyor — Playwright `page.fill` + `page.click` ile native browser flow takip eder; manuel CSRF işleme gerekmez.
- 006 deneyimi: text-tabanlı arama (`button:has-text("Giriş")`) Unicode/non-breaking space yüzünden bozulabilir. **CSS class/id-tabanlı arama tercih edilir**. Memory: `project-eker-bayipro-catalog-dom`.
- Sipariş listesi muhtemelen `<table>` (MVC default scaffold), detay sayfası `?id=N` query string olabilir — keşif sırasında doğrulanır.

**Alternatives considered**:
- *Reverse-engineer XHR endpoint*: AJAX response varsa direkt JSON çekilebilir; ama site MVC default render olabilir (server-side HTML). Önce HTML scrape denenir, başarısız olursa XHR araştırılır.
- *Genel selector pool*: enderyapi'deki gibi 6–8 selector aday'ı sırayla denemek. Bu pattern'i uygula çünkü site DOM'u henüz görülmedi.

**Discovery checklist** → `contracts/ikizler-discovery.md`.

---

## R-003 — Levent Şimşek (PHP/index.php) DOM keşif stratejisi

**Decision**: Aynı iteratif stratejiyle, ama PHP pattern beklentileriyle.

**Rationale**:
- URL `liste.leventsimsekarmatur.com/index.php` → klasik PHP, muhtemelen tek dosya router; tüm sayfalar `?action=`/`?page=` query string.
- PHP'de form `<form method="POST" action="index.php?action=login">` patterni yaygın. CSRF token PHP session cookie ile yönetiliyor olabilir (form içinde hidden input olabilir veya olmayabilir).
- Site domain "liste" prefix — büyük olasılıkla **sipariş listesi homepage** veya kolay erişimde. Daha az tıklama beklenir.

**Alternatives considered**:
- *Aynı kod tabanı kullan*: Levent Şimşek de bayipro veya başka bir B2B platform kullanıyor olabilir → enderyapi adapter'ı kopyala-yapıştır. **Önce keşif**, platformu tespit ettikten sonra refactor düşünülür.

**Discovery checklist** → `contracts/leventsimsek-discovery.md`.

---

## R-004 — Credentials env var naming

**Decision**: `IKIZLER_USERNAME`, `IKIZLER_PASSWORD`, `LEVENTSIMSEK_USERNAME`, `LEVENTSIMSEK_PASSWORD`.

**Rationale**:
- Mevcut `scripts/scrape/credentials.ts::loadCredentials(slug)` zaten slug-driven: `slug.toUpperCase().replace(/-/g, "_") + "_USERNAME"`. Yeni kod değişikliği gerekmez.
- Slug'lar `ikizler` ve `leventsimsek` (snake_case değil, kebab-case değil — düz lowercase). Uppercase formatları otomatik üretilir.

**Alternatives considered**:
- *`LEVENT_SIMSEK_*`*: Çoğul kelime ayırıcı altçizgi. Slug `levent-simsek` veya `levent_simsek` olsaydı çalışırdı; ama spec slug olarak `leventsimsek` belirlendi → daha az ayraç, env adı kısa.

---

## R-005 — Workflow_dispatch supplier input genişletme

**Decision**: `.github/workflows/scrape.yml` `supplier choice options` listesi `[enderyapi, ikizler, leventsimsek]` olur.

**Rationale**:
- Server Action (`app/actions/trigger-scrape.ts`) `workflow_dispatch` API'sini çağırırken `inputs.supplier = slug` gönderir. GitHub Actions choice input listesi dışı bir değer kabul etmiyor; **listeye eklenmedikçe yeni tedarikçi tetiklenemez**.
- Bu küçük değişiklik FR-008 ve FR-009'un compile-time tarafını çözer.

**Alternatives considered**:
- *`type: string` yap*: choice yerine free-form string. UI tarafı slug doğrudan gönderir → daha esnek. Ama GitHub Actions UI dropdown'u faydasını kaybeder ve typo riski oluşur. **Choice kalır.**

---

## R-006 — Adapter interface'inde `getProductPrice` metodu için strateji

**Decision**: Yeni adapter'lar `getProductPrice` metodu için `return null;` döndürür (placeholder).

**Rationale**:
- `lib/scraper/types.ts` adapter interface'inde `getProductPrice(ctx, productCode): Promise<number | null>` **zorunlu**.
- Ancak orchestrator (`scripts/scrape/all.ts`) bu metodu **çağırmıyor** — sadece `scrapeCatalog` optional metodunu kullanıyor. Legacy metod, gelecekte kaldırılabilir.
- Catalog scrape 009'a ertelendi → catalog metodu da bu feature'da yok → `getProductPrice` çağrılmıyor → `return null` güvenli.

**Alternatives considered**:
- *`throw new Error("not-implemented")`*: Eğer ileride çağrılırsa açık hata. Ama optional pattern (interface'ten kaldır) daha temiz — refactor scope dışı, şimdilik `null`.
- *Interface'i değiştir, opsiyonel yap*: enderyapi adapter'ı da etkiler → mevcut testlerle ilgili regresyon riski. **Bu feature'da scope dışı.**

---

## R-007 — HTTP (İkizler) plaintext riski için ek mitigation

**Decision**: Ek mitigation yok. Kullanıcı kabul etti (spec FR-012).

**Rationale**:
- İkizler site `http://bayi.ikizlerhirdavat.com` — HTTPS sertifikası yok.
- Playwright HTTP isteklerini default kabul eder; ek ayar gerekmez.
- Risk dökümante edildi: Constitution mimari kararlar tablosunda 2026-05-17 satırı eklenecek.

**Alternatives considered**:
- *Proxy üzerinden TLS termination*: Cloudflare Workers gibi araçlar. Free tier kapsamı dışına çıkar, kullanıcı talep etmedi.

---

## R-008 — 2FA / captcha tespiti

**Decision**: Mevcut `scripts/scrape/detection.ts` modülünü her iki adapter da login sonrası çağırır.

**Rationale**:
- `detection.ts` adapter-agnostic; `detectCaptcha(page)` ve `detect2FA(page)` yardımcı fonksiyonları DOM/URL/iframe pattern'lerini tarar.
- Kullanıcı doğruladı: iki site de düz user/şifre — 2FA/captcha **yok**. Yine de defensive call yapılır: beklenmedik captcha gelirse `ScrapeError({ mode: "captcha" })` veya `"2fa-required"` fail olur, sessizce ilerlemez.

**Alternatives considered**:
- *Atla*: Kullanıcı yok dedi → check yapma. Çok agresif; ileride site güvenlik ekleyebilir → fail-fast yerine sessiz silent break.

---

## R-009 — `lib/queries/orders.ts::listSuppliers()` ve `lib/queries/scrape-schedule.ts::listAllSchedules()` davranış doğrulaması

**Decision**: Kod değişikliği gerekmez. Mevcut sorgular DB'den tüm tedarikçileri JOIN ile çekiyor.

**Rationale**:
- `listSuppliers()` `.from("suppliers").select("id, slug, name").order("name")` — yeni satır eklenirse otomatik döner.
- `listAllSchedules()` `scrape_schedule` tablosu için aynı şekilde DB-driven.
- Settings sayfası (`app/(app)/dashboard/settings/page.tsx`) Server Component → her sayfa yüklemesinde yeni veriyi çeker → seed migration uygulandığı anda UI hazır.

**Validation**: Quickstart adım 5'te seed migration sonrası `/dashboard/settings` açıldığında 3 kart görünmeli (Enderyapi + İkizler + Levent Şimşek).

---

## Referans bağlam

- **Constitution**: `.docs/CONSTITUTION.md` — adapter mimarisi (2026-05-15), GH Secrets disiplini (2026-05-17, G15), per-supplier scrape_schedule (2026-05-17, G16).
- **006 deneyimi**: Enderyapı catalog scrape — text-tabanlı arama Unicode apostrof yüzünden kırıldı; CSS class çözüm. Memory: `project-eker-bayipro-catalog-dom`.
- **007 deneyimi**: Workflow_dispatch + GitHub Secrets göçü tamamlandı; aynı altyapı yeni tedarikçiler için **sıfır kod değişikliği** (sadece secret + workflow choice list).
- **Mevcut adapter referansı**: `lib/scraper/adapters/enderyapi.ts` (786 satır, login + listOrders + getOrderDetail + scrapeCatalog).
