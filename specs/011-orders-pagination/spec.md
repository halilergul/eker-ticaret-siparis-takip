# Feature Specification: Bayi Panel Sipariş Pagination (4 Tedarikçi)

**Feature Branch**: `011-orders-pagination`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "4 tedarikçi listOrders'ında pagination eksikliği — tüm sipariş geçmişini çekmek için her adapter'da sayfa gezme döngüsü."

---

## Problem & Motivation

Bayi panellerinden çekilen sipariş geçmişi **eksik**. 4 tedarikçinin tamamında `listOrders`, sipariş listesi sayfasındaki ilk tabloyu (default sayfa boyutu, genellikle 25-50 satır) parse edip dönüyor; sonraki sayfaları ziyaret etmiyor.

**Sinyaller**:

- Yedekler İnşaat DB'de tam **50** sipariş — yuvarlak sayı, sayfa boyutu sınırı kuvvetli kanıt
- Diğer tedarikçilerde (Enderyapı 62, İkizler 24, Levent Şimşek 11) yuvarlak değil ama panel'de pagination olup olmadığı doğrulanmadı
- Operatör (Halil) dashboard'da gördüğü sipariş sayısının panel'deki gerçek sayıya eşit olup olmadığını manuel kontrol edemiyor

**Sonuç**: Operatör eksik veriye bakıyor; eksik siparişlerin ürün kalemleri `products` tablosuna girmediği için catalog scrape ve fiyat değişiklik takibi de eksik kalıyor.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Tam sipariş geçmişi (Priority: P1)

**Persona**: Operatör (Halil) — `/dashboard`'da Eker Ticaret'in 4 tedarikçideki tüm B2B siparişlerini görmek istiyor.

**Senaryo**: Operatör settings'ten 4 tedarikçiyi manuel tetikler veya saatlik cron çalışır. Sistem her tedarikçinin bayi panelindeki **tüm** sipariş geçmişini (sayfa 1, 2, … N) gezer, yeni siparişleri DB'ye ekler. Dashboard'da operatör artık tedarikçi başına panel toplamına eşit sayıda sipariş görür.

**Why this priority**: Bu feature'ın temel amacı. Eksik veri = eksik karar; bu giderilmeden operatörün fiyat değişikliği panelinden gelen sinyaller de yarım kalır.

**Independent Test**: Tek bir tedarikçide manuel scrape çalıştır → DB'deki sipariş sayısı bayi panelindeki toplam sayıya eşit (operatör doğrular).

**Acceptance Scenarios**:

1. **Given** Yedekler DB'de 50 sipariş varken, **When** scrape tetiklenir ve panel'de 87 sipariş varsa, **Then** scrape tamamlandığında DB'de 87 sipariş olur, summary `orders_inserted=37, orders_skipped=50` raporlar.
2. **Given** Enderyapı DB'de 62 sipariş varken, **When** scrape tetiklenir ve panel'de 62 sipariş varsa (pagination yok / ek sayfa boş), **Then** DB değişmez, summary `orders_skipped=62, orders_inserted=0`.
3. **Given** 4 tedarikçi de manuel tetiklendiğinde, **When** scrape tamamlanır, **Then** her tedarikçinin scrape_runs satırı `status=success` veya `partial` (kısmi başarı, ör. bazı sipariş detayları okunamadıysa); `failed` olmaz.

---

### User Story 2 — İdempotency korunur (Priority: P1)

**Persona**: Operatör + cron sistemi — saatlik cron'un her koşumda yeni satır yığması istenmiyor.

**Senaryo**: Pagination ile tüm sayfalar gezildikten sonra ikinci ve sonraki koşumlarda mevcut tablo birebir DB ile aynıyse hiçbir yeni satır eklenmez, hiçbir order_items / price_snapshot kaydı duplicate'lenmez.

**Why this priority**: 010'da kurulan idempotency garantisi (orderNo unique, snapshot dedup) korunmalı. Pagination eklemek bunu bozarsa cron her saat 4 tedarikçi başına yüzlerce duplicate yazar.

**Independent Test**: scrape çalışır, sonra bekleme yok arka arkaya tekrar çalışır. İkinci koşum summary: `orders_inserted=0, items_inserted=0, snapshots_added=0` (snapshots aynı gün fiyat değişmediği için).

**Acceptance Scenarios**:

1. **Given** Yedekler ilk koşum 87 sipariş ekledi, **When** scrape hemen tekrar tetiklenir, **Then** ikinci koşum `orders_inserted=0, orders_skipped=87`.
2. **Given** İlk koşum sırasında yeni 1 sipariş eklendiyse (panel'de 88 oldu), **When** scrape tekrar tetiklenir, **Then** sadece o 1 sipariş `orders_inserted=1`, kalan 87 `orders_skipped`.

---

### User Story 3 — Üretim cron timeout'u aşmaz (Priority: P2)

**Persona**: GH Actions runner — manuel ve cron tetiklemelerin 8 dakikalık scrape timeout'unu aşmaması gerekir (mevcut `TIMEOUT_OVERRIDE_MS=480000`).

**Senaryo**: İlk koşum tüm geçmişi geziyor; en ağır tedarikçide bile (sayfa sayısı × ortalama detay scrape süresi) toplam <8 dk. Sonraki koşumlar zaten erken durur (boş sayfa / hasNext yok).

**Why this priority**: P2 çünkü gevşeme noktası: gerekirse cron timeout 15dk runner sınırına kadar artırılır. Ama default 8dk içinde kalmak operasyon konforu için tercih edilir.

**Independent Test**: Her tedarikçide ilk koşum süresi ≤ 8 dakika.

**Acceptance Scenarios**:

1. **Given** Bir tedarikçi ilk koşumda N sayfa gezmesi gerekiyor, **When** scrape süresi 8 dakikayı aşıyor, **Then** scrape graceful durur, summary'de "ulaşılan son sayfa" bilgisi olur, scrape_runs `status=partial` ile biter (timeout-driven kısmi başarı), sonraki koşum kaldığı yerden devam edebilir.

---

### Edge Cases

- **Pagination DOM'u panellerde farklı**: Her tedarikçide pagination "Sonraki sayfa" linki / sayfa numara butonu / `?sayfa=N` URL parametresi farklı olabilir → adapter başına ayrı keşif + selector tanımı.
- **Sayfa 1'de tüm veriler**: Pagination eksik tedarikçi (örn. Enderyapı muhtemelen pagination'sız) için loop ilk iterasyondan sonra `hasNext=false` görür ve doğal durur — hata değil normal akış.
- **Boş sayfa**: `?sayfa=999` gibi out-of-range URL boş tablo döner — loop bu sinyalle durur.
- **Aynı sayfa tekrar**: Pagination buton yanlış davranır ve aynı sayfa iki kez gösterilirse → orderNo unique constraint duplicate atar, log'lanır, sonraki sayfaya devam (veya stop-on-repeat heuristics).
- **Site session timeout sırasında**: Pagination ortasında session düşerse → re-login + son başarılı sayfadan devam mı, yoksa baştan mı? V1: baştan tekrar dene, başarısız olursa `partial`.
- **Login sayfasına redirect**: Sayfa N'de login redirect tespit edilirse → yeniden login + son sayfadan devam.
- **Cron birden fazla başlatma**: scrape.yml'da `concurrency.group` zaten `scrape-<supplier>` ile kilitli, paralel koşum problemi yok.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem her tedarikçinin bayi panelindeki **tüm** sipariş kayıtlarını tek scrape koşumunda DB'ye yazmalı (pagination ile sayfa 1, 2, ... N).
- **FR-002**: İkinci ve sonraki scrape koşumları DB'de zaten kayıtlı siparişleri tekrar yazmamalı (mevcut orderNo unique idempotency korunur).
- **FR-003**: Her adapter pagination kontrolünü kendi panel'inin DOM'una uygun şekilde uygular (next-page link, sayfa numara butonu, veya `?sayfa=N` URL parametresi).
- **FR-004**: Adapter "son sayfaya ulaşıldı" sinyalini şu yollardan en az biriyle tespit etmeli: (a) "Sonraki" linki disabled/yok, (b) yeni sayfa boş tablo döner, (c) yeni sayfa önceki sayfa ile aynı satırları döner.
- **FR-005**: `--limit N` flag'i test ve manuel kontrol için pagination'a saygı göstermeli — N siparişe ulaşılınca scrape durur (mevcut davranış korunur).
- **FR-006**: Adapter scrape süresi production cron timeout'unu (8 dk) aşmamalı; aşıyorsa scrape graceful stop edip `status=partial` olarak bitmeli.
- **FR-007**: Scrape summary `orders_total`, `orders_inserted`, `orders_skipped`, `pages_visited` alanlarını içermeli (`pages_visited` yeni eklenir).
- **FR-008**: Catalog scrape, order_items detay parse'i, dashboard UI değişmez — sadece `listOrders` davranışı genişler.

### Key Entities

- **scrape_runs.summary**: Mevcut JSONB sütununa `pages_visited: number` alanı eklenir (opsiyonel — backward-compatible). Sıfırdan büyükse pagination'ın çalıştığını gösterir.
- **supplier_orders**, **order_items**: Şema değişmez. Mevcut idempotency garantileri yeterli.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 4 tedarikçinin her birinde DB sipariş sayısı, operatörün bayi panelinde gördüğü "toplam sipariş" sayısına ±0 hata payı ile eşit (manuel doğrulama).
- **SC-002**: İlk koşum sonrası art arda yapılan ikinci koşumda 4 tedarikçi için toplam `orders_inserted=0, items_inserted=0` (idempotency).
- **SC-003**: 4 tedarikçinin her birinde ilk pagination'lı koşum süresi ≤ 8 dk (production timeout dahilinde); ikinci koşum ≤ 4 dk (sadece detay görüntülemediği için erken biter).
- **SC-004**: Dashboard, settings, zamlanan-urunler sayfaları görsel olarak değişmez; mevcut özellikler regresyona uğramaz.
- **SC-005**: scrape_runs son 7 günde `status=failed` oranı %0 (geçici hatalar `partial` kabul edilir, ama tam başarısızlık beklenmez).

---

## Assumptions

- 4 bayi panelin tümünde **tüm sipariş geçmişi** erişilebilir (operatör müşteri olarak kendi geçmişini görme yetkisine sahip — B2B paneller bunu sağlar).
- Toplam sipariş sayısı 4 tedarikçide makul (max yüzlerce); binlere ulaşmaz. Aksi durum spec ettirmeyi gerektirir (sayfa başına filtre, tarih aralığı).
- Her bayi panel'de pagination DOM'u veya URL pattern'i tespit edilebilir — DOM tamamen JS-driven olup state'siz devam etmek imkansızsa o panel için ayrı strateji (örn. infinite scroll) gerekir.
- Mevcut `getOrderDetail` her sipariş için tek tek çağrı yapar; pagination yeni sayfalardan gelen siparişlerin her birine ayrıca detay çağrısı atılır (zaman maliyeti N × ~3sn).
- Tüm 4 tedarikçinin scrape süresi 8dk içinde kalır. Aşılırsa cron `timeout-minutes: 15` → 20'ye artırılır (anti-goal değil — pratik gerekçeyle).
- Bayi panellerinden çekilen siparişlerin "Beklemede" / "İptal" gibi statüleri zaten 010'da işlendi; pagination bu durumu değiştirmez.

---

## Out of Scope (Anti-Goals)

- ❌ Yeni dashboard sayfası — 010'da eklenen pagination kullanılır (artan sipariş sayısı otomatik 20/sayfa görünür).
- ❌ Tarih filtreli sipariş çekimi (örn. "son 6 ay") — tümü taranır, idempotency duplicate'leri engeller.
- ❌ Yeni cron schedule veya frekans — mevcut "her saat başı" korunur.
- ❌ Catalog scrape, order_items detayı, products tablosu kuralları — değişmez.
- ❌ Sipariş detayı sayfasındaki DOM iyileştirmeleri (mevcut hatalar 011 kapsamında değil).
- ❌ Yeni admin tooling, raporlama, alerting — yalnızca scrape davranışı.
