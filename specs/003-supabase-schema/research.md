# Phase 0 — Schema Tasarım Kararları

**Feature**: 003-supabase-schema | **Tarih**: 2026-05-16

Bu doküman, plan'daki teknik tercihleri ve schema tasarım kararlarını gerekçeleriyle birlikte kaydeder. Her karar `Decision / Rationale / Alternatives considered` formatında.

---

## R-001 — UUID PK vs bigserial PK

**Decision**: Tüm tablolarda `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.

**Rationale**:
- Scraper offline'da ID üretebilir (UUID v4 client-side de oluşturulabilir).
- Multi-supplier scenarios'ta auto-increment çakışması yok.
- Supabase ekosistemiyle uyumlu (auth.users PK de UUID).
- Insert performans farkı (saniyede milyon olmadıkça) bu projenin ölçeği için ihmal edilebilir.

**Alternatives considered**:
- `bigserial`: Daha kompakt, insert hızı biraz daha iyi, JOIN tarafı küçük avantaj. Reddedildi: scraper'da deterministik upsert için yan tarafta natural unique key (`(supplier_id, order_no)`) zaten var; PK ID'sini sadece FK için kullanıyoruz. UUID consistency için tercih edildi.
- `int` + `identity`: aynı sebepler.

---

## R-002 — Single user RLS: per-row ownership FK var mı?

**Decision**: `user_id`/`owner_id` FK YOK. RLS politikası basit: `auth.uid() IS NOT NULL` (yani "authenticated görür/yazar").

**Rationale**:
- Constitution: "Tek kullanıcı projesi". Per-row ownership eklemek kodu karmaşıklaştırır + her insert'e bir FK daha eklemeyi zorunlu kılar (scraper ekstra adım).
- Multi-user'a geçilirse migration ile `owner_id uuid REFERENCES auth.users(id)` eklenir ve RLS politikası güncellenir. Bu feature MVP scope dışı.

**Alternatives considered**:
- `owner_id uuid REFERENCES auth.users(id)` + `auth.uid() = owner_id` policy. Reddedildi: spec.md FR-010 ve Assumptions açıkça tek kullanıcı diyor; YAGNI.

---

## R-003 — Order ↔ Product ilişkisi: FK mı, yumuşak mı (kod ile)?

**Decision**: `order_items.product_code` (text) + `order_items.product_name` (text snapshot); doğrudan `products(id)` FK YOK.

**Rationale**:
- PoC bulgusu (dev-gotchas): sipariş listesi tarama ile katalog ziyareti farklı zamanlarda olur. Scraper bir siparişi gördüğünde ürün daha katalogda gözlemlenmemiş olabilir.
- Strong FK `products(id)` zorunlu olsa, scraper sipariş satırlarını yazmadan önce products satırlarını upsert etmek zorunda kalır; sıralama kuralı katlanır.
- Yumuşak bağlantı (kod ile) view/join sorgularını biraz uzatır ama esneklik kazandırır. Join: `JOIN products ON products.supplier_id = ... AND products.code = order_items.product_code`.
- `product_name` snapshot olarak saklanır — sipariş anındaki ad korunur. `products.name` zamanla güncellense bile geçmiş kayıt değişmez.

**Alternatives considered**:
- Hard FK + ürünü önce upsert etme: kod akışı zorlaştırır, scraper hataya açık.
- Hibrit (nullable FK + denormalize kod): iki source of truth — tehlikeli. Reddedildi.

---

## R-004 — Para sayı tipi: numeric vs decimal vs money

**Decision**: `numeric(14,2)` her para alanı için.

**Rationale**:
- TRY için 12 tam haneli (10^12 = 1 trilyon ₺) + 2 ondalık fazlasıyla yeterli.
- `numeric` arbitrary precision, yuvarlama hatası yok (TR fiyatları virgülden sonra 2 hane).
- `money` tipi Postgres'te locale'e bağlı parse, depolama optimal değil; reddedildi.
- `float`/`double`: yuvarlama hatası ile fiyat farkı yanlış hesaplar; reddedildi.

**Alternatives considered**:
- `numeric` (precision/scale belirtmeden): kullanılabilir ama her satır biraz daha fazla yer kaplar.
- TL bazında integer cinsinden (kuruş): yaygın e-ticaret pattern'i. Reddedildi: sayısal okuma daha az okunabilir, advisor karmaşık (ondalık 100'e böl).

---

## R-005 — Currency kolon: enum mı text mi?

**Decision**: `currency text NOT NULL DEFAULT 'TRY'` + `CHECK (currency IN ('TRY'))`. CHECK constraint multi-currency support gelene kadar TRY'yi enforce eder.

**Rationale**:
- Şu an TRY tek; ama kolon var (multi-currency 005+ scope hazır).
- Postgres enum DDL maliyetli (yeni değer eklemek için `ALTER TYPE`); text + CHECK daha esnek.
- CHECK constraint yeni currency eklerken sadece `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (currency IN ('TRY','EUR'))` ile değişir.

**Alternatives considered**:
- `currency CHAR(3)`: ISO 4217 ile tam uyum ama text kadar esnek değil. Reddedildi (kazanç marjinal).
- Currency tablosu (`currencies` ref) + FK: overengineering tek-currency için. Reddedildi.

---

## R-006 — Idempotent insert: hangi unique constraint?

**Decision**:
- `suppliers (slug)` UNIQUE
- `supplier_orders (supplier_id, order_no)` UNIQUE
- `order_items (order_id, product_code)` UNIQUE — aynı siparişte aynı ürün kodu iki kez olmaz (PoC'da gözlenen patternda her satır farklı kod)
- `products (supplier_id, code)` UNIQUE
- `price_snapshots`: unique YOK; tarihçe her snapshot ayrı satır

**Rationale**:
- Scraper `INSERT ... ON CONFLICT ON CONSTRAINT <name> DO UPDATE` veya `DO NOTHING` ile idempotent yazar.
- `order_items (order_id, product_code)`: spec edge case — eğer aynı siparişte aynı kod iki kez gelirse (örn. iki farklı paket boyutu), bu mevcut tasarımı kıracak. PoC verisinde gözlenmedi; gerekirse `+ unit_price_at_order` ile composite unique'e genişletilir. Şimdilik basit tutulur.
- `price_snapshots` üzerinde unique YOK çünkü her gözlem zamanı farklıdır (`captured_at`); fonksiyon (`record_price_observation`) tekrarı önler.

**Alternatives considered**:
- `order_items` üzerinde unique YOK: her insert yeni satır. Reddedildi — scraper aynı siparişi tekrar okuduğunda satırları çoğaltır, idempotency bozulur.

---

## R-007 — Fiyat değişim takibi: trigger mı RPC mı?

**Decision**: PL/pgSQL fonksiyonu `record_price_observation(p_product_id uuid, p_unit_price numeric, p_captured_at timestamptz default now())` — RPC olarak çağırılır (Supabase `client.rpc()`).

**Rationale**:
- Scraper tek atomic çağrı ile (a) ürün son fiyatını okur, (b) farklıysa snapshot yazar, (c) `products.current_unit_price` ve `last_seen_at` günceller. Race condition yok (transaction içi).
- Trigger alternatifi: `BEFORE INSERT ON price_snapshots` trigger ile `products`'ı güncelleyebiliriz. Ama scraper'ın iş akışı "fiyat değişmedi → snapshot yazma" — trigger bunu daha karmaşık yapar.
- RPC client tarafından Supabase JS SDK ile `supabase.rpc('record_price_observation', { ... })` çağrılır; type generation otomatik döner.

**Alternatives considered**:
- Application-side mantık (TS kodunda): "önce SELECT, sonra INSERT". Reddedildi — race condition + ekstra round-trip.
- Trigger: zorla `INSERT` denenir, trigger duplicate'i engeller. Reddedildi — INSERT/SAVE'in başarısız olduğu durumda dönüş değeri yanıltıcı, hata yönetimi zor.

---

## R-008 — `updated_at` otomasyonu

**Decision**: Tek `set_updated_at()` PL/pgSQL trigger fonksiyonu + 5 tablonun her birine `BEFORE UPDATE` trigger.

**Rationale**:
- `moddatetime` extension Supabase'de mevcut ama her tabloya manual `CREATE TRIGGER ... EXECUTE FUNCTION moddatetime(updated_at)` çağrısı gerekir, kazançlı değil.
- Tek fonksiyon, 5 trigger en az kod tekrarı.

**Alternatives considered**:
- `moddatetime` extension kullan. Eşdeğer; sadece tercih meselesi. Kabul edildi ama custom fonksiyon daha kontrol verir (örn. `updated_at = greatest(NEW.updated_at, now())` gibi extension yapmaz).
- Application-side `updated_at`: scraper unutursa kolon güncellenmez. Reddedildi.

---

## R-009 — Soft delete?

**Decision**: Soft delete YOK. Idempotent upsert + immutable price history + zaman damgaları yeterli.

**Rationale**:
- Scraper veri silmez; sadece insert/update yapar.
- "Sipariş artık tedarikçi sitesinde görünmüyor" durumu önemli değil (geçmiş veri zaten kayıtlı; sipariş silindiyse sebebi bizden bağımsız).
- `deleted_at` kolonu eklemek + her query'de filter etmek karmaşıklık artırır; kazanç yok.

**Alternatives considered**:
- `deleted_at timestamptz NULL`: standart pattern. Reddedildi — gerek yok.

---

## R-010 — Migration uygulama: MCP vs Supabase CLI

**Decision**: MCP `apply_migration` (remote) + repo'da `supabase/migrations/*.sql` dosyaları (sürüm kontrolü).

**Rationale**:
- Constitution Stack: Supabase CLI önerilir ama yerel CLI kurulu değil; MCP üzerinden çalışıyoruz.
- Migration dosyaları repo'da olmalı — başka bir geliştirici (veya CI) ortamda sıfırdan kuracaksa hangi dosyaların hangi sırada uygulandığını bilmeli.
- 002'de bu kısmen kaçırılmıştı (G14 sapması); 003'te düzeltiliyor.

**Alternatives considered**:
- Sadece MCP, dosya yok: Reddedildi (G14 ihlali, drift riski yüksek).
- Local Supabase CLI kur + push: Tercih edilen yol ileride; şu an minimum dirençli yol MCP + manuel dosya çıktısı.

**Süreç**:
1. SQL içeriğini hazırla.
2. `mcp__supabase__apply_migration({ name: "20260516_01_core_tables", query: "..." })`.
3. Aynı SQL'i `supabase/migrations/20260516<HHMMSS>_01_core_tables.sql` olarak yaz.
4. Bir sonraki migration için artan timestamp kullan.

---

## R-011 — TypeScript type generation

**Decision**: MCP `generate_typescript_types` çıktısını `lib/supabase/database.types.ts` olarak yaz. Mevcut `lib/supabase/{client,server}.ts` `createClient<Database>(...)` generic'ini ekleyerek typed olur.

**Rationale**:
- Frontend kodunda `supabase.from('suppliers').select('*')` autocomplete + type checking.
- `Database` tipi tek dosyada toplanır, schema değişikliğinde regen edilir.
- Mevcut `client.ts`/`server.ts` non-generic — bu feature'da minimal değişiklik (sadece generic ekleme).

**Alternatives considered**:
- Type'ları manuel yazmak: schema ile drift riski. Reddedildi.
- pgTAP test ile manuel tipi doğrulamak: overengineering. Reddedildi.

---

## R-012 — Constraint ihlallerinde hata davranışı

**Decision**: Postgres natural hatası (`23505 unique_violation`, `23514 check_violation` vb.) Supabase JS SDK üzerinden client'a aktarılır; scraper bunu yakalayıp ScrapeError formatına çevirir (004 feature scope).

**Rationale**:
- DB tarafında ekstra mesaj çevirisi yapmak gereksiz.
- Sözel error mesajları (TR) UI tarafında lookup table ile üretilir; DB sadece kanıt sunar.

**Alternatives considered**:
- TR error mesajları DB'de (`RAISE EXCEPTION 'Sipariş zaten kayıtlı'`): zorla TR'ye bağlar, multi-lang esnekliği kaybeder. Reddedildi.

---

## R-013 — RPC fonksiyon güvenliği (SECURITY DEFINER mi INVOKER mi?)

**Decision**: `record_price_observation` fonksiyonu `SECURITY INVOKER` (default).

**Rationale**:
- Scraper `service_role` ile çağırır → RLS bypass otomatik.
- Frontend (UI) bu fonksiyonu çağırmayacak; sadece scraper.
- `SECURITY DEFINER` gereksiz risk: RLS'i bypass eder, izin sızıntısı potansiyeli.

**Alternatives considered**:
- `SECURITY DEFINER` + `SET search_path = public, pg_temp` (güvenli pattern): N/A — RLS zaten service_role ile çözülüyor.

---

## R-014 — Index stratejisi

**Decision**: Yalnızca foreign key + sık sorgulanan kolonlara index.

**Index listesi**:
- `supplier_orders.supplier_id` (FK)
- `supplier_orders.ordered_at DESC` (en yeni sipariş öne)
- `order_items.order_id` (FK)
- `order_items.product_code` (ürün → sipariş satırı look-up)
- `products.supplier_id` (FK)
- `price_snapshots.product_id` (FK)
- `price_snapshots(product_id, captured_at DESC)` composite — ürünün son fiyat geçmişi

**Rationale**:
- PK'lar zaten unique index sağlar.
- Free tier'da disk düşük; gereksiz index = boşa alan.
- "Ürünün son 30 günlük fiyatı" sorgusu composite index ile O(log n).

**Alternatives considered**:
- Her FK'ye otomatik index (Postgres FK'ye otomatik index oluşturmaz): yapıldı.
- Trigram (`pg_trgm`) index `products.name`'e: ileride arama özelliği gelirse eklenir. Şu an yok.

---

## R-015 — `auth.uid() IS NOT NULL` mı `auth.role() = 'authenticated'` mı?

**Decision**: `auth.uid() IS NOT NULL`.

**Rationale**:
- Daha açık niyet: "kullanıcı oturum açmış mı?"
- `auth.role()` Supabase JWT'sine bağlı; `auth.uid()` daha temel API.
- İki yaklaşımın işlevsel farkı yok (ikisi de service_role'ü bypass eder).

**Alternatives considered**:
- Açık `auth.role() = 'authenticated'`: aynı sonuç, isim farkı.

---

## Sonuç: Tüm "NEEDS CLARIFICATION" çözüldü

Spec'te `[NEEDS CLARIFICATION]` yoktu; bu doküman teknik tasarım kararlarını kayıt altına alır. Phase 1'e (data-model.md, contracts/, quickstart.md) hazır.
