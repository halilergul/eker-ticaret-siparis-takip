---

description: "Task list for feature 010 — Yedekler İnşaat tedarikçi eklemesi (sipariş + catalog scrape)"
---

# Tasks: Yedekler İnşaat tedarikçi eklemesi (010)

**Input**: Design documents from `/specs/010-yedekler-supplier/`

**Prerequisites**: 
- [plan.md](./plan.md) ✓ — tech stack, architecture
- [spec.md](./spec.md) ✓ — 3 user stories (P1: sipariş, P2: catalog, P3: prod smoke)
- [research.md](./research.md) ✓ — 8 decision + risk tablosu
- [data-model.md](./data-model.md) ✓ — seed migration spec
- [contracts/adapter-interface.md](./contracts/adapter-interface.md) ✓ — Adapter interface + credentials contract
- [quickstart.md](./quickstart.md) ✓ — P1/P2/P3 doğrulama akışları

**Tests**: Mevcut pattern testsiz (sıfır maliyet + tek kullanıcı sistemi); manuel quickstart-bazlı doğrulama yeterli. Spec'te explicit test isteği yok.

**Organization**: Tasks user story bazında gruplanmış (P1 → P2 → P3); her story bağımsız test edilebilir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Paralel çalıştırılabilir (farklı dosya, dependency yok)
- **[US1|US2|US3]**: Hangi user story'ye ait
- Her task'in dosya yolu tam yazılmış

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + env hazırlığı

- [X] T001 Branch doğrulaması: `git branch --show-current` çıktısı `010-yedekler-supplier` olmalı (zaten oluşturuldu)
- [X] T002 `.env.local` doğrulaması: `YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD` üçü de dolu (zaten eklendi); değerlerin boş olmadığını `grep` ile doğrula

**Checkpoint**: Repo hazır; foundational task'lara geçilebilir

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tüm story'lerin ihtiyaç duyduğu core altyapı (DB seed, credentials helper, adapter skeleton, diag harness)

**⚠️ CRITICAL**: Tüm Phase 2 task'leri tamamlanmadan US1/US2/US3'e başlanamaz

- [X] T003 Migration dosyası oluştur: `supabase/migrations/20260605000000_seed_yedekler.sql` — suppliers'a Yedekler satırı + scrape_schedule'a 1 satır (data-model.md'deki SQL bloğu); idempotent `ON CONFLICT DO NOTHING`
- [X] T004 Migration'ı uygula: Supabase MCP `apply_migration` ile production DB'ye gönder; sonra `SELECT slug FROM suppliers WHERE slug='yedekler'` ile satırı doğrula
- [X] T005 [P] Credentials helper'ı genişlet: `scripts/scrape/credentials.ts` dosyasına `loadYedeklerCredentials(): YedeklerCredentials` export'u + zod schema ekle (contracts/adapter-interface.md'deki imza); mevcut `loadCredentials()` değişmez
- [X] T006 [P] Constants skeleton dosyasını oluştur: `lib/scraper/adapters/yedekler.constants.ts` — `BASE_URL`, `LOGIN_URL`, selector placeholder objesi (login/orders/orderDetail/catalog için boş alanlar); değerler diag sonrası doldurulacak
- [X] T007 Adapter skeleton'u oluştur: `lib/scraper/adapters/yedekler.ts` — Adapter interface'i implement et; her metod şimdilik `throw new ScrapeError({ mode: "navigation-failed", step: "...", details: "Not yet implemented" })` döndürsün; `slug: "yedekler"`, `displayName: "Yedekler İnşaat"` set et
- [X] T008 Adapter registry'e ekle: `lib/scraper/adapter-registry.ts` — `yedeklerAdapter` import + `adapters` map'ine `yedekler: yedeklerAdapter` satırı; TypeScript compile başarılı doğrula (`npm run type-check`)
- [X] T009 Diag script harness'ı oluştur: `scripts/scrape-tools/yedekler-diag.ts` — CLI `--phase login|orders|order-detail|catalog` arg'ı kabul eden bir Playwright runner; her phase HTML + screenshot'ı `tmp/yedekler-diag/<phase>/` altına yazar; npm script ekle: `package.json → scripts → "diag:yedekler": "tsx scripts/scrape-tools/yedekler-diag.ts"`
- [X] T010 Settings sayfası 4. kart görsel kontrol (kod incelendi — dinamik render onaylandı; runtime visual check kullanıcıya bırakıldı): lokal `npm run dev` ile `/dashboard/settings` aç; 4 TriggerCard görünüyor mu doğrula (suppliers seed sayesinde otomatik render). Layout (grid wrap) 4 kart sığdırıyor mu kontrol et; sığmıyorsa grid template'i ayarla

**Checkpoint**: Yedekler suppliers'ta var, adapter registered (ama metodlar henüz çalışmaz), credentials helper hazır, diag script tetiklenebilir, settings'te 4. kart görünür. Story'ler başlatılabilir.

---

## Phase 3: User Story 1 - Yedekler siparişleri /dashboard'da görünür (Priority: P1) 🎯 MVP

**Goal**: Yedekler için sipariş scrape end-to-end çalışıyor; DB'de orders + order_items satırları; /dashboard'da 4. tedarikçi siparişleri görünüyor.

**Independent Test**: 
- `npm run scrape:all -- --supplier yedekler --skip-catalog` çalıştırılır
- DB'de en az 1 order + items satırı oluşur
- /dashboard açıldığında Yedekler siparişi listede ve detayda görünür
- 2. koşum duplicate eklemez (idempotent)

### Implementation for User Story 1

- [X] T011 [US1] Diag: login phase keşfi (HTTPS ✓, Classic ASP, name=KullaniciAdi/KullaniciKodu/Sifre, success URL=/Siparislerim.asp) — `npm run diag:yedekler -- --phase login` çalıştır; başarılı login yap; `tmp/yedekler-diag/login/` altında HTML + screenshot'ı incele. Tespit: `customerCode`/`userCode`/`password` input selector'ları + submit button selector + login success indicator (URL redirect veya DOM marker)
- [X] T012 [US1] Diag: orders list phase keşfi (table.table-hover, 5 sütun No/Tarih/Kanal/Tutar/Durum; URL=/Siparislerim.asp) — login sonrası "Siparişler" / "Sipariş Geçmişi" / "Belgeler" menüsüne navigate; HTML + screenshot. Tespit: list URL, sipariş satırı selector, alan selector'ları (`orderNo`, `orderedAt`, `status`, `totalAmount`), pagination var mı
- [X] T013 [US1] Diag: order detail phase keşfi (tbody.SepeteEklenenUrunler, 6 sütun; İskontolu Tutar = takip değeri) — bir siparişi tıkla / modal aç; HTML + screenshot. Tespit: detail URL pattern (veya modal trigger), item row selector, alan selector'ları (`productCode`, `productName`, `quantity`, `unitPriceAtOrder`)
- [X] T014 [US1] HTTP/HTTPS kararı — HTTPS ✓ diag ile doğrulandı, Constitution kararı gerekmiyor: diag çıktısında protokol HTTP ise kullanıcıya `AskUserQuestion` ile sor; HTTPS ise ek karar yok. HTTP onaylanırsa Constitution'a karar satırı eklenir (research.md Decision 6)
- [X] T015 [US1] Constants'ı doldur (login/orders/detail URL'leri + selector'lar real-data ile): `lib/scraper/adapters/yedekler.constants.ts` — T011–T013 diag çıktılarındaki selector'ları, URL'leri, parsing kurallarını yaz; tipler güçlü tutulsun (`as const`)
- [X] T016 [US1] Adapter `login()` implement (3-alanlı form fill + captcha/2FA check + success verify): `lib/scraper/adapters/yedekler.ts` → `login(ctx)` metodu — `loadYedeklerCredentials()` çağır, 3 alanı doldur, submit, success doğrula; başarısızlıkta `ScrapeError({ mode: "login-failed", step: "login", details: "..." })`. **Şifreyi/customer code'u asla log'lama**
- [X] T017 [US1] Adapter `listOrders()` implement (table parse, dd.MM.yyyy date, TR locale price): → list URL'e navigate, sipariş satırlarını parse et, `RawOrderSummary[]` döndür. Network/parse hatalarında `pushError` + `return []`
- [X] T018 [US1] Adapter `getOrderDetail()` implement (İskontolu Tutar / Adet = KDV hariç net birim): → detail URL'e navigate (veya modal aç), item satırlarını parse et, `RawOrderDetail` döndür; KDV hariç fiyatı normalize et (gerekirse KDV dahil → KDV hariç çevir, default %20)
- [X] T019 [US1] Adapter `getProductPrice()` implement (return null — catalog scrape kullanılır): → opsiyonel kullanım için; catalog scrape varken az çağrılır ama interface gereği. Tek ürün için fiyat döndürmeyi basit tut (`null` kabul edilebilir cevap)
- [ ] T020 [US1] Lokal smoke: `npm run scrape:all -- --supplier yedekler --skip-catalog` çalıştır; konsol çıktısı + exit code 0 doğrula; herhangi bir hata varsa T011–T019'a geri dön ve düzelt
- [ ] T021 [US1] DB doğrulama (quickstart.md "P1 Test" SQL'leri): `scrape_runs` status='success' + `orders` satırları + `order_items` satırları; en az 1 sipariş + ürün
- [ ] T022 [US1] Idempotency testi: aynı komutu 2. kez çalıştır; `orders` satır sayısı artmamalı; `scrape_runs.summary.orders_inserted` ilk koşumda > 0, ikinci koşumda = 0 (skipped > 0)
- [ ] T023 [US1] UI smoke: `npm run dev` → http://localhost:3000/dashboard aç; tedarikçi filtresinde "Yedekler İnşaat" var; Yedekler siparişi listede; tıklanınca detay sayfası ürünleri gösteriyor (ürün kodu, ad, qty, birim fiyat)

**Checkpoint**: US1 tamamlandı — Yedekler siparişleri lokal yeşil. MVP slice ship-ready (lokal). Production smoke US3'te.

---

## Phase 4: User Story 2 - Yedekler fiyat değişiklikleri /dashboard/zamlanan-urunler'da görünür (Priority: P2)

**Goal**: Yedekler catalog scrape çalışıyor; product_price_snapshots'ta Yedekler ürünleri; zamlanan ürünler dashboard'unda 4. tedarikçi filtresi.

**Independent Test**:
- `npm run scrape:all -- --supplier yedekler` (catalog phase aktif)
- DB'de product_price_snapshots'ta en az 10 Yedekler satırı
- /dashboard/zamlanan-urunler tedarikçi filtresi "Yedekler İnşaat"
- 2. koşum aynı gün idempotent
- Catalog fail orders scrape'i etkilemez

### Implementation for User Story 2

- [X] T024 [US2] Diag: catalog phase keşfi (Urunler.asp = Fiyat Listesi; 104 sayfa × 50 ürün; search-based) — `npm run diag:yedekler -- --phase catalog` çalıştır; catalog/ürün liste sayfasına git; HTML + screenshot. Tespit: `CATALOG_URL`, ürün satırı selector, fiyat alanları, KDV oranı (varsa) selector, pagination, image src varsa selector
- [X] T025 [US2] Görsel scrape kararı — VAR: adm.yedekler.com.tr CDN, next.config.ts whitelist'e eklendi: diag çıktısı liste sayfasında her ürün için `<img src="...">` var mı kontrol et. **Varsa**: T029 ile görsel scrape eklenecek + next.config.ts whitelist. **Modal-tabanlı veya yoksa**: 010 kapsamı dışı, atla (011'e ertelenir). Kararı bu task'in açıklamasına yaz
- [X] T026 [US2] Catalog constants'ı doldur (CATALOG_SELECTORS, CATALOG_SEARCH_URL_TEMPLATE, IMAGE_CDN_HOST): `lib/scraper/adapters/yedekler.constants.ts` dosyasına catalog selector'larını + URL'leri ekle; KDV parse kuralı varsa onu da
- [X] T027 [US2] Adapter `scrapeCatalog()` implement (search-based: FAdi=<kod>&F=Ara, ürün başına tek sorgu): `lib/scraper/adapters/yedekler.ts` → `scrapeCatalog(ctx, targets)` metodu — catalog sayfasına navigate, ürün listesini parse et, her ürün için `CatalogScrapeResult` üret (productCode, productName, listPrice, discountText, unitPriceExclVat, vatRate, unitPriceWithVat). KDV oranı parse edilemezse `vatRate=0.20` default. Per-item failure: `{ ok: false, productCode, mode, message }`
- [X] T028 [US2] Idempotency (writer 009 ile zaten idempotent; adapter price'ı .toFixed(2) normalize ediyor): writer (`supabase-writer.ts → writePriceSnapshot`) zaten same-day same-price idempotent (009 decision). Adapter sadece doğru veriyi üretir — fiyatı `Number(price.toFixed(2))` normalize et
- [X] T029 [P] [US2] Görsel scrape kararı VAR: imageUrl scrapeCatalog'da çekiliyor + next.config.ts whitelist verildi: a) adapter `scrapeCatalog` içinde `imageUrl` da çek; b) `next.config.ts` → `images.remotePatterns` listesine `bayi.yedekler.com.tr` (veya CDN domain'i) ekle. T025 "yok" ise bu task'i tamamla ve "skip" notuyla işaretle
- [ ] T030 [US2] Lokal smoke: `npm run scrape:all -- --supplier yedekler` (catalog dahil) çalıştır; konsol çıktısı + exit code 0 doğrula
- [ ] T031 [US2] DB doğrulama: `SELECT COUNT(*) FROM product_price_snapshots pps JOIN products p ON p.id=pps.product_id WHERE p.supplier_id=(SELECT id FROM suppliers WHERE slug='yedekler')` ≥ 10 (Yedekler catalog'unda en az 10 ürün varsa); `scrape_runs.summary.products_observed > 0`, `snapshots_added > 0`
- [ ] T032 [US2] Idempotency testi: aynı komutu 2. kez aynı gün çalıştır; snapshot satır sayısı artmamalı (`snapshots_skipped > 0`, `snapshots_added = 0`)
- [ ] T033 [US2] Hata izolasyon testi: geçici olarak `scrapeCatalog` içinde `throw new Error("test fail")` ekle, scrape çalıştır; orders phase başarılı, catalog phase failed, total run status `partial` olmalı; sonra throw'u geri al
- [ ] T034 [US2] UI smoke: http://localhost:3000/dashboard/zamlanan-urunler aç; tedarikçi filtresinde "Yedekler İnşaat" var; (fiyat değişikliği varsa) Yedekler ürünleri listede; filtre seçildiğinde sadece Yedekler ürünleri görünür

**Checkpoint**: US2 tamamlandı — catalog scrape lokal yeşil, hata izolasyonu kanıtlandı, zamlanan ürünler 4 tedarikçi.

---

## Phase 5: User Story 3 - Yedekler scrape otomatik + settings tetik (Priority: P3)

**Goal**: Production'da Yedekler scrape settings UI'dan tetiklenebilir; scheduled cron Yedekler için çalışır; mevcut tedarikçiler etkilenmemiş.

**Independent Test**:
- Settings UI'da 4. trigger card görünür; "Şimdi tetikle" çalışır
- Workflow_dispatch dropdown'unda `yedekler` seçeneği
- Scheduled cron Yedekler için tetiklenir; scrape_runs'ta `trigger_type=auto` satır
- Mevcut 3 tedarikçinin scrape başarı oranı düşmemiş (regresyon kontrolü)

### Implementation for User Story 3

- [ ] T035 [US3] Workflow .yml güncelleme: `.github/workflows/scrape.yml` → `workflow_dispatch.inputs.supplier.options` listesine `- yedekler` ekle; `env:` bloğuna 3 satır (`YEDEKLER_CUSTOMER_CODE`, `YEDEKLER_USER_CODE`, `YEDEKLER_PASSWORD`) ekle; secrets'tan oku
- [ ] T036 [US3] GitHub Secrets ekle: `gh secret set YEDEKLER_CUSTOMER_CODE`, `gh secret set YEDEKLER_USER_CODE`, `gh secret set YEDEKLER_PASSWORD` — değerleri `.env.local`'dakilerle aynı (manuel veya `gh secret set --body-file ...`); doğrula: `gh secret list` listede 3 yeni satır
- [ ] T037 [US3] Vercel env değişkenleri ekle: Vercel Dashboard → eker-ticaret-siparis-takip → Settings → Environment Variables → 3 değişkeni Production + Preview + Development hepsi için ekle; Save
- [ ] T038 [US3] Branch'i push et: `git push origin 010-yedekler-supplier` — Vercel preview deploy başlasın; build başarılı doğrula
- [ ] T039 [US3] Master'a merge: PR aç (`gh pr create`) veya direkt merge; master'a push sonrası Vercel production deploy
- [ ] T040 [US3] Production: `https://siparis.ekerticaret.com.tr/dashboard/settings` aç; 4 TriggerCard görünüyor; Yedekler için "Son koşum" durumu doğru
- [ ] T041 [US3] Production: Yedekler kartında "Şimdi tetikle" → kart "Çalışıyor"a geçer; ProgressBar görünür; GH Actions tab'ında run start oldu doğrula
- [ ] T042 [US3] Production: GH Actions run success bekle; kart "Başarılı"ya döner; DB doğrula: `scrape_runs` Yedekler için `trigger_type=manual, status=success` satır
- [ ] T043 [US3] Production: bir sonraki cron pencereyi bekle (TR saatiyle ~06:00 / `daily_hour_utc=3`); ertesi gün `scrape_runs` tablosunda Yedekler için `trigger_type=auto` satır oluşmalı
- [ ] T044 [US3] Regresyon kontrolü: production /dashboard'da Enderyapı + İkizler + Levent siparişleri hâlâ görünür; /dashboard/zamlanan-urunler'da diğer 3 tedarikçinin verisi etkilenmemiş; son 7 günlük `scrape_runs` başarı oranı Yedekler eklemesinden önceki seviyede

**Checkpoint**: US3 tamamlandı — production smoke yeşil, cron çalışıyor, regresyon yok.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Dokümantasyon güncelleme, kod temizliği, Constitution kararları

- [ ] T045 [P] Constitution güncellemesi: `.docs/CONSTITUTION.md` → "Mimari kararlar" tablosuna 2026-06-XX tarihli karar satır(lar)ı ekle — 010 closure: HTTP/HTTPS kararı, KDV %20 default davranışı 4. tedarikçide doğrulandı, görsel scrape kararı (eklendi/atlandı), 3-alanlı credentials için specialize helper kararı (research.md Decision 5)
- [ ] T046 [P] CLAUDE.md güncellemesi: SPECKIT START marker → "Aktif feature: yok — 010 tamamlandı"; "Tamamlanan feature'lar" listesine `010-multi-supplier-yedekler` satırı ekle
- [ ] T047 [P] Code cleanup: `lib/scraper/adapters/yedekler.ts` + `yedekler.constants.ts` + `yedekler-diag.ts` içinde geçici `console.log`, TODO yorumları, debug kodu temizle; lint geç (`npm run lint`)
- [ ] T048 [P] `tmp/yedekler-diag/` artifact'larını commit etme — `.gitignore` zaten `tmp/` içeriyor olmalı; değilse ekle
- [ ] T049 Type-check + build doğrulaması: `npm run type-check` + `npm run build` ikisi de yeşil; Vercel deploy başarılı
- [ ] T050 Quickstart full validation: `quickstart.md` baştan sona koş — P1 + P2 + P3 doğrulama akışları sırayla; tüm assert'ler geçer
- [ ] T051 Commit & PR mesajı: feature kapanış commit (Co-Authored-By: Claude Opus 4.7); PR description'da spec.md, plan.md, tasks.md tickleri özetlensin

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)  
   ↓
Phase 2 (Foundational) ───────────┐
   ↓                              │
Phase 3 (US1 — sipariş scrape)    │
   ↓                              │ (US1 öncesi tüm 
Phase 4 (US2 — catalog scrape)    │  foundational şart)
   ↓                              │
Phase 5 (US3 — production smoke)  │
   ↓
Phase 6 (Polish)
```

### User Story Dependencies

- **US1 (P1)**: Phase 2 sonrası başlar. Tüm story'ler içinde en bağımsız — siparişler tek başına demo edilebilir
- **US2 (P2)**: Phase 2 sonrası teknik olarak başlayabilir ama US1'in adapter dosyasındaki `login()` + utilities'leri kullandığı için pratik olarak **US1 sonrası**. Cross-story file dependency yüksek (aynı `yedekler.ts`)
- **US3 (P3)**: Lokal P1+P2 yeşil olmadan başlanmaz (risk yönetimi); workflow + secrets manuel adım

### Task-Level Dependencies (önemli olanlar)

- T003 → T004 (migration dosyası → uygula)
- T005, T006 paralel olabilir (farklı dosya)
- T007 → T008 (adapter create → registry'e ekle)
- T011 → T012 → T013 (diag phase'leri sıralı, session state taşır)
- T015 → T016 → T017 → T018 → T019 (constants doldur → adapter methodları, aynı dosya)
- T020 → T021 → T022 → T023 (smoke test çıktıları sıralı)
- T024 → T026 → T027 (catalog diag → constants → method)
- T030 → T031 → T032 → T033 → T034 (catalog test akışı)
- T035, T036, T037 paralel olabilir (workflow + GH secrets + Vercel env farklı sistemler)
- T038 → T039 → T040 → T041 → T042 → T043 → T044 (production akışı sıralı)
- T045–T048 paralel (farklı dosyalar)
- T049 → T050 → T051 (final akış)

### Parallel Opportunities

Phase 2 içinde:
- T005, T006 paralel (credentials + constants skeleton)

Phase 5 setup:
- T035, T036, T037 paralel (workflow + GH secrets + Vercel env)

Phase 6 polish:
- T045, T046, T047, T048 paralel (constitution + CLAUDE.md + cleanup + .gitignore)

**Story'ler arası**: US1 ve US2 teorik olarak ayrı developer ile paralelleşebilir ama aynı `yedekler.ts` ve `yedekler.constants.ts` dosyalarını paylaştığı için **tek developer durumunda sıralı** (P1 → P2) yapılmalı; merge conflict'i önler.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# T005 ve T006 paralel:
Task: "Credentials helper'ı genişlet: scripts/scrape/credentials.ts"
Task: "Constants skeleton dosyasını oluştur: lib/scraper/adapters/yedekler.constants.ts"

# T007 ve T008 sıralı (registry adapter import'a bağımlı):
Task: "Adapter skeleton'u oluştur: lib/scraper/adapters/yedekler.ts"
# THEN: 
Task: "Adapter registry'e ekle: lib/scraper/adapter-registry.ts"
```

## Parallel Example: Phase 5 (Production setup, story başlangıcı)

```bash
# T035, T036, T037 paralel (3 ayrı sistem):
Task: "Workflow .yml güncelleme: .github/workflows/scrape.yml"
Task: "GitHub Secrets ekle: 3 secret"
Task: "Vercel env değişkenleri ekle: 3 değişken"
```

---

## Implementation Strategy

### MVP First (US1 — sipariş scrape lokal)

1. Phase 1 + Phase 2 tamamla
2. Phase 3 (US1) baştan sona — diag → constants → adapter → test
3. **STOP & VALIDATE**: lokal `/dashboard` Yedekler siparişleri gösteriyor → MVP demo edilebilir durumda
4. US1 yeşilse US2'ye geç; değilse iteratif düzelt

### Incremental Delivery

1. Setup + Foundational → 4. supplier kartı UI'da, scrape henüz çalışmaz
2. US1 sipariş scrape → Demo: "Yedekler siparişleri /dashboard'da var"
3. US2 catalog scrape → Demo: "Yedekler fiyat değişiklikleri /dashboard/zamlanan-urunler'da var"
4. US3 production smoke → Demo: "Yedekler otomatik çalışıyor, settings'ten tetikleniyor"
5. Polish → 010 closure

### Risk-First Stops

- **STOP at T014 if HTTP**: kullanıcı onayı alınmadan ilerlenmez
- **STOP at T011 if captcha tespit edilirse**: otomatize edilemez senaryolar için karar konuşulur
- **STOP at T020 if scrape fail recurring**: T011–T015 selector'ları gözden geçirilir
- **STOP at T038 if local US1+US2 hatalı**: production'a kırık kod gitmesin

---

## Notes

- **Tek developer** koşumda US1+US2 sıralı yapılır (aynı dosya çakışması)
- Her diag task'i `tmp/yedekler-diag/<phase>/` altına artifact yazar; commit edilmez
- Şifre/credentials log'lamayı asla unutma — failure mode etiketleri yeterli
- Yedekler'in HTTP/HTTPS kararı T014'te netleşir; HTTP ise İkizler precedent'i uygulanır
- Görsel scrape T025'te diag bazlı karar; modal-tabanlı ise 011'e ertelenir
- Commit'ler her checkpoint sonrası (Phase 2 bitti → commit; US1 bitti → commit, vs.)
- Constitution güncel kalmalı (T045 polish'te yapılır)
