# Phase 0 — Scraper Architecture Decisions

**Feature**: 004-enderyapi-scraper-prod | **Tarih**: 2026-05-16

15 teknik karar `Decision / Rationale / Alternatives` formatında.

---

## R-001 — Adapter interface şekli

**Decision**: TypeScript interface, 4 async metot + 1 metadata field.

```ts
export interface Adapter {
  readonly slug: string;          // "enderyapi"
  readonly displayName: string;   // "Enderyapi B2B"
  login(ctx: ScrapeContext): Promise<void>;
  listOrders(ctx: ScrapeContext): Promise<RawOrderSummary[]>;
  getOrderDetail(ctx: ScrapeContext, orderNo: string): Promise<RawOrderDetail>;
  getProductPrice(ctx: ScrapeContext, productCode: string): Promise<number | null>;
}
```

`ScrapeContext` Playwright `Page` + verbose flag + supplier_id'yi taşır.

**Rationale**:
- 4 metot, akışın doğal adımlarına 1-1 eşleşir; tüm B2B siteler aynı pattern (login → list → detail → catalog).
- Adapter DB'yi bilmez; veri çıkarır, orchestrator yazar (separation of concerns).
- `getProductPrice` NULL döner = parse edilemedi (FR-006 + R-007).

**Alternatives considered**:
- **Tek monolit `scrape()`**: adapter her şeyi yapar, orchestrator sadece çağırır. Reddedildi — adapter test/mock edilemez; DB yazma logic'i her adapter'da tekrarlanır.
- **More granular** (login, navigateToOrders, parseOrderRow, vb. 10+ metot): adapter implementer yorgun; YAGNI.

---

## R-002 — DB writer yeri

**Decision**: `lib/scraper/supabase-writer.ts` — tek modül, service_role client'ı barındırır, idempotent yazma fonksiyonları sunar.

```ts
writeOrderHeader(supplierId, order): Promise<{ orderId, inserted }>
writeOrderItems(orderId, items): Promise<{ inserted: number }>
recordPriceObservation(supplierId, code, name, price): Promise<void>
```

**Rationale**:
- Adapter'lar saf veri çıkarır; bu modül "ne yapılacak" değil "nasıl yazılacak" sorununu çözer.
- `service_role` client tek yerde initialize edilir; secret yönetimi merkezi.
- Idempotency (`ON CONFLICT DO NOTHING`) burada saklanır; adapter implementer'lar bilmez.

**Alternatives considered**:
- **Adapter içinde DB call**: tight coupling, secret leak riski (adapter modülleri ayrı runtime'larda çalışırsa).

---

## R-003 — `scrape_runs` tablo şekli

**Decision**: 7 kolon + JSONB summary:

| Kolon | Tip | Not |
|-------|-----|-----|
| `id` | uuid PK | gen_random_uuid() |
| `supplier_id` | uuid FK | suppliers(id) |
| `started_at` | timestamptz NOT NULL | now() default |
| `finished_at` | timestamptz | NULL = running |
| `status` | text NOT NULL | CHECK IN ('running','success','partial','failed','aborted') |
| `summary` | jsonb NOT NULL | DEFAULT '{}' |
| `error_message` | text | NULL = no error |

**Rationale**:
- `status` text + CHECK, enum değil (genişletmek ALTER TYPE yerine ALTER CONSTRAINT).
- `summary` JSONB esnek — orders_inserted, items_inserted, products_observed, snapshots_added, errors[] gibi alanlar UI değiştikçe genişler.
- Soft delete YOK (audit history); satırlar append-only.
- Composite index `(supplier_id, started_at DESC)` "son N koşum supplier başına".

**Alternatives considered**:
- **Normalize edilmiş hata tablosu** (`scrape_run_errors` ayrı): overengineering; hata listesi `summary.errors[]` içinde JSON dizisi yeterli.

---

## R-004 — Status state machine

**Decision**:

```text
running (initial)
  ├─→ success    (zero errors)
  ├─→ partial    (some errors, key data written)
  ├─→ failed     (login/init phase fail; no data written)
  └─→ aborted    (timeout veya SIGINT)
```

`status='running'` finished_at NULL; diğerleri finished_at set.

**Rationale**:
- 4 terminal state UI'da "son koşum durumu" göstermek için yeterli.
- `partial` özellikle önemli: bazı siparişler işlendi, bazıları atlandı (FR-009).

**Alternatives considered**:
- **success/fail boolean**: partial kaybolur, kullanıcı yanıltıcı bilgi alır.

---

## R-005 — Error categorization (FailureMode)

**Decision**: PoC'taki `errors.ts` `ScrapeError` extend edilir. Yeni FailureMode değerleri:

| Mode | Step | Resolution |
|------|------|------------|
| `login-failed` | login | Fail (no data write) |
| `2fa-required` | login | Fail |
| `captcha-detected` | login/nav | Fail |
| `missing-credentials` | env-load | Fail (early) |
| `unexpected-dom` | any | Fail or skip |
| `network-error` | any | Skip (continue) |
| `db-write-failed` | post-fetch | Skip + log to summary.errors |
| `supplier-not-found` | bootstrap | Fail (early) |
| `unknown` | any | Fail |

PoC'taki 10 mode korunur + yeni 2 (`db-write-failed`, `supplier-not-found`).

**Rationale**:
- Her mode'a göre "fail vs skip" karar verilir (FR-009).
- DB write fail = tek sipariş hatası; diğerlerini etkilememeli.
- supplier-not-found = bilinmeyen slug; CLI başında valide edilir, asla iş kaybedilmeden çıkılır.

---

## R-006 — Sipariş başına transaction stratejisi

**Decision**: Her sipariş kendi `supabase.from('supplier_orders').upsert()` çağrısında, ardından `from('order_items').upsert([...])` çağrısında ayrı statement. Postgres transaction yok (Supabase JS client default behavior).

**Rationale**:
- Her sipariş bağımsız iş birimi; biri fail olursa diğerleri etkilenmemeli.
- Aynı sipariş için header upsert + items upsert ardarda; idempotent oldukları için yarıda kalsa bile retry güvenli.
- Postgres transaction Supabase JS client'tan tek `rpc()` ile sağlanabilir, ama bu basit feature için overhead.

**Alternatives considered**:
- **Tek PostgreSQL function** (`upsert_order_with_items`): tüm sipariş + items tek transaction, atomic. Daha güvenli ama daha fazla kod. V2'de eklenebilir; V1'de basit Supabase JS upsert kalıyor.

---

## R-007 — Katalog enrichment akışı

**Decision**: Listele-sonra-ziyaret. Akış:

1. Sipariş listesi okunduktan sonra unique product code'lar toplanır (set).
2. Her code için `getProductPrice()` çağrılır (paralel YOK; sıralı + sleep 500ms).
3. `record_price_observation` RPC çağrılır (price NULL ise sadece name/last_seen_at güncellenir).

**Rationale**:
- Paralel ziyaret → tedarikçi rate-limit / IP ban riski. Sıralı + delay = nazik.
- Set-based: aynı kod farklı siparişlerde tekrarlanırsa 1 ziyaret yeterli.

**Alternatives considered**:
- **Sipariş okurken inline ziyaret**: kod tekrarlanırsa boşa ziyaret.
- **Sadece son N gün siparişlerinden kod toplamak**: optimizasyon; V2.

---

## R-008 — CLI argv parsing

**Decision**: Manual argv parse (PoC pattern). Args: `--supplier <slug>`, `--headed`, `--verbose`, `--limit <n>`, `--skip-catalog`, `--help`. Diğer her şey için stderr + exit code 2.

**Rationale**:
- 6 flag; commander.js / yargs gibi dep eklemek YAGNI.
- PoC'da zaten manual parse var, pattern korunur.

---

## R-009 — Adapter registry

**Decision**: Statik object literal.

```ts
// lib/scraper/adapter-registry.ts
import { enderyapiAdapter } from "./adapters/enderyapi";
export const adapters: Record<string, Adapter> = {
  enderyapi: enderyapiAdapter,
};
export function getAdapter(slug: string): Adapter {
  const a = adapters[slug];
  if (!a) throw new ScrapeError({ mode: 'supplier-not-found', step: 'bootstrap' });
  return a;
}
```

**Rationale**:
- 1 adapter şu an; obje literal yeterli.
- Yeni adapter eklemek = adapters object'ine bir satır + import.

**Alternatives considered**:
- **Dinamik filesystem scan**: `glob` ile adapters/*.ts. Reddedildi — tsx çoklu dil import sorun çıkarır; explicit registry daha sağlam.

---

## R-010 — Credential loader (multi-supplier)

**Decision**: `loadCredentials(slug: string): { username, password }`. Convention: env var `<SLUG_UPPER>_USERNAME` ve `<SLUG_UPPER>_PASSWORD`. PoC'taki `ENDERYAPI_USERNAME` zaten bu pattern'a uyar.

**Rationale**:
- `.env.local`'da: `ENDERYAPI_USERNAME=...`, `ACMEB2B_USERNAME=...` gibi.
- Yeni supplier eklemek = 2 env var.

**Alternatives considered**:
- **DB'de credentials saklamak** (encrypted): V2. Vault yok, RLS + encryption_key gerekir.

---

## R-011 — Idempotency: ON CONFLICT pattern

**Decision**: Supabase JS `upsert()` + `onConflict` parametresi (003'teki unique constraint isimleri).

```ts
.from('supplier_orders')
  .upsert(
    { supplier_id, order_no, status, ordered_at, total_amount },
    { onConflict: 'supplier_id, order_no', ignoreDuplicates: true }
  );
```

`ignoreDuplicates: true` = ON CONFLICT DO NOTHING (existing satırı override etmez).

**Rationale**:
- 003 schema'daki unique constraint adları biliniyor; type-safe.
- Status update YOK V1'de (FR — Onaylandı/Onay bekliyor değişimi sonradan UPDATE değil INSERT IGNORE).

**Alternatives considered**:
- **`ignoreDuplicates: false`** (update on conflict): status değişimini yansıtır ama updated_at trigger her çağrıda update eder. V1'de gerek yok.

---

## R-012 — Global timeout

**Decision**: `Promise.race(scraperFn(), timeoutPromise(5 * 60 * 1000))` PoC'taki pattern. Timeout'ta `aborted` status + summary.errors push.

**Rationale**:
- PoC'da çalışıyor; pattern korunur.
- 5 dakika = 20 sipariş + 30 katalog ziyareti için fazlasıyla yeterli.

---

## R-013 — Screenshot debugging

**Decision**: PoC'taki `scrape-debug/<timestamp>/<step>.png` korunur. Her hata noktasında `page.screenshot()`. `--verbose` flag açıkken her başarılı adımda da basılır (debug için).

**Rationale**:
- Selector kırıldığında debug yapmak zor olur ekran görüntüsü olmadan.
- gitignored; secret yok (URL+DOM, kimlik bilgisi formda type=password input → render edilmez).

**Alternatives considered**:
- **HAR recording** (`page.route` ile): daha kapsamlı ama dosya boyutu büyük; screenshot yeterli.

---

## R-014 — Scrape summary JSON şeması

**Decision**:

```ts
type ScrapeSummary = {
  orders_total: number;        // sipariş listesinde görülen
  orders_inserted: number;     // yeni eklenen
  orders_skipped: number;      // ON CONFLICT atlanan
  items_inserted: number;      // yeni satır
  items_skipped: number;
  products_observed: number;   // RPC çağrı sayısı
  snapshots_added: number;     // fiyat değişti
  errors: Array<{ step: string; mode: string; detail: string }>;
};
```

Zod schema da yazılır (`lib/scraper/types.ts`).

**Rationale**:
- UI dashboard (006+) bu alanlara güvenir.
- `errors` dizisi: hata varsa `partial` status; boşsa `success`.

---

## R-015 — Geri uyumluluk: eski `scripts/scrape/enderyapi.ts` ne olur?

**Decision**: Durur, içine deprecation notu eklenir. Yeni `npm run scrape -- --supplier enderyapi` önerilir. 005 feature'da silinir.

**Rationale**:
- Halihazırda çalışan PoC kodu var; aniden silmek kullanıcının lokal workflow'unu kırar.
- Bir süre yan yana çalışmak: yeni orchestrator stabil olduğuna emin olunduğunda eski silinir.

**Alternatives considered**:
- **Hemen silmek**: PoC scenaryo A geçmiş, ama kullanıcı bazen eski'yi çağırabilir.

---

## Sonuç

15 karar consolide edildi. Tüm "NEEDS CLARIFICATION" çözüldü (spec'te zaten yoktu). Phase 1'e hazır.
