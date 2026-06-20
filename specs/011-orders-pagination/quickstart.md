# Quickstart — Feature 011

**Feature**: Bayi Panel Sipariş Pagination
**Date**: 2026-06-20

Bu doküman 011'in lokal ve production smoke akışını adım adım anlatır. 010'daki quickstart pattern'ini takip eder.

---

## Önkoşullar

- `.env.local` dosyasında 4 tedarikçinin tüm credential'ları mevcut (önceki feature'lardan kalanlar)
- Supabase MCP / `npm` çalışıyor
- Node 22+, Playwright Chromium kurulu (`npx playwright install --with-deps chromium`)

---

## Phase A: DOM Keşfi (her adapter için bir kez)

### A1. Diag script çalıştır

Yedekler için zaten var; diğerleri için yeni script yazılacak (`scripts/scrape-tools/<slug>-diag.ts`).

```bash
# Mevcut
npm run diag:yedekler -- --phase pagination

# Yeni (Phase 4 sonrası)
npm run diag:enderyapi -- --phase pagination
npm run diag:ikizler -- --phase pagination
npm run diag:leventsimsek -- --phase pagination
```

Her diag çalıştırması `tmp/<slug>-diag/pagination/` altına şunları kaydeder:
- `orders-page-1.html` (1. sayfa tam DOM)
- `orders-page-1.png` (screenshot)
- `orders-page-2.html` (varsa 2. sayfa)
- `orders-page-2.png`
- `pagination-controls.html` (pagination DOM'unu izole eden alt-DOM)

### A2. Pagination pattern'ini tespit et

Manuel olarak her tedarikçi için HTML dump'ı incele:

1. "Sonraki sayfa" buton/link var mı? Selector ne?
2. Sayfa numara butonu var mı? "1 2 3 ... N" formatı?
3. URL değişiyor mu? Pattern ne? `?sayfa=N`, `?page=N`, postback?
4. Toplam sipariş sayısı ne? (panel kullanıcıya bunu söylüyor mu?)
5. Default sayfa boyutu? Değiştirilebilir mi?

Bulguları `specs/011-orders-pagination/research.md`'deki R-002…R-005'e yaz.

### A3. Constants güncelle

Her `lib/scraper/adapters/<slug>.constants.ts` dosyasına:

```typescript
export const PAGINATION_SELECTORS = {
  STRATEGY: "url" | "button" | "page-numbers" | "none",
  NEXT_BUTTON: "...",       // strategy=button için
  PAGE_LINK: "a[href*='sayfa=']", // strategy=page-numbers için
  // ... (strateji-spesifik alanlar)
} as const;

export const PAGINATION_URL_TEMPLATE = "/orders.asp?sayfa={page}"; // strategy=url için
export const PAGINATION_MAX_PAGES = 50; // safety
```

---

## Phase B: Adapter Pagination Implementation

### B1. Adapter loop ekle

Her `lib/scraper/adapters/<slug>.ts` içindeki `listOrders` fonksiyonunu R-006 pseudocode'una göre güncelle.

### B2. ScrapeContext güncelle

`lib/scraper/types.ts`:

```typescript
type ScrapeContext = {
  // ... mevcut
  pagesVisited?: number;
};
```

### B3. Summary writer güncelle

`scripts/scrape/orders.ts` (varsa) ve `scripts/scrape/all.ts`:

```typescript
const orders = await adapter.listOrders(ctx);
if (ctx.pagesVisited !== undefined) {
  summary.pages_visited = ctx.pagesVisited;
}
```

---

## Phase C: Lokal Smoke

### C1. Her tedarikçi için ilk koşum

```bash
npm run scrape:orders -- --supplier yedekler --verbose
npm run scrape:orders -- --supplier ikizler --verbose
npm run scrape:orders -- --supplier leventsimsek --verbose
npm run scrape:orders -- --supplier enderyapi --verbose
```

**Beklenen**:
- Her koşumda `Pagination: N sayfa, M sipariş` log'u
- `[orders] DONE: X eklendi / Y atlandı / Z hata` — X > 0 (ilk pagination'lı koşum)
- 8dk içinde tamamlanır

### C2. DB doğrulama

```sql
SELECT s.slug, COUNT(o.id) AS db_count
FROM suppliers s
LEFT JOIN supplier_orders o ON o.supplier_id = s.id
WHERE s.slug IN ('enderyapi', 'ikizler', 'leventsimsek', 'yedekler')
GROUP BY s.slug
ORDER BY s.slug;
```

DB sayısı her tedarikçi için **artmış** olmalı (DOM keşfine göre tahmini değerler):
- enderyapi: 62 → ? (panel'de ne kadar varsa)
- ikizler: 24 → ?
- leventsimsek: 11 → ? (muhtemelen aynı, single page)
- yedekler: 50 → ? (kesin artar)

Operatör (Halil) bayi panelinde toplam sayıyı kontrol edip DB ile karşılaştırır → SC-001 başarı kriteri.

### C3. İdempotency testi

Aynı komutu hemen tekrar çalıştır:

```bash
npm run scrape:orders -- --supplier yedekler --verbose
```

**Beklenen**:
- `[orders] DONE: 0 eklendi / N atlandı / 0 hata`
- DB sayısı değişmez

### C4. Limit testi

```bash
npm run scrape:orders -- --supplier yedekler --limit 5 --verbose
```

**Beklenen**:
- 5 sipariş işlendi (5'i de DB'de yoksa eklenir; varsa skip)
- `pages_visited = 1` (5'i ilk sayfada çıkar)

---

## Phase D: Production Smoke

### D1. Branch + commit + push

```bash
git checkout 011-orders-pagination
git add lib/scraper/ scripts/scrape-tools/ specs/011-orders-pagination/
git commit -m "feat(scrape): listOrders pagination — 4 tedarikçi"
git push -u origin 011-orders-pagination
```

### D2. Manuel workflow_dispatch

```bash
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=yedekler -f trigger_type=manual
```

İlk smoke'u Yedekler ile yap (en yüksek beklenti). Sonra:

```bash
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=enderyapi -f trigger_type=manual
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=ikizler -f trigger_type=manual
gh workflow run scrape.yml --ref 011-orders-pagination -f supplier=leventsimsek -f trigger_type=manual
```

### D3. Doğrulama

`gh run watch <run-id>` ile her birinin success bittiğini kontrol et. Sonra DB sorgusu:

```sql
SELECT r.id, s.slug, r.trigger_type, r.status,
       r.summary->>'orders_inserted' AS inserted,
       r.summary->>'orders_skipped' AS skipped,
       r.summary->>'pages_visited' AS pages
FROM scrape_runs r
JOIN suppliers s ON s.id = r.supplier_id
WHERE r.started_at > NOW() - INTERVAL '1 hour'
ORDER BY r.started_at DESC;
```

`pages_visited` her tedarikçi için 1'den büyük olmalı (Levent hariç olabilir).

---

## Phase E: PR + Merge

### E1. PR aç

```bash
gh pr create --base master --head 011-orders-pagination \
  --title "feat(011): bayi panel sipariş pagination (4 tedarikçi)" \
  --body "..."
```

### E2. Smoke sonuçlarını PR body'ye yaz

- DB sayı değişimleri (her tedarikçi öncesi/sonrası)
- pages_visited per supplier
- İdempotency teyit
- Lokal süre / runner süre

### E3. Merge

```bash
gh pr merge <pr-num> --squash --delete-branch
```

Vercel auto-deploy yok (sadece scrape kod, frontend etkilenmez).

---

## Phase F: Polish

### F1. CLAUDE.md güncelle

`010-yedekler-supplier` altına `011-orders-pagination` ekle.

### F2. Constitution decision log

`.docs/CONSTITUTION.md` "Mimari kararlar" tablosuna 011 satırı eklenir:

```
| 2026-06-?? | 011: listOrders adapter pagination — her adapter inline loop | DRY refactor şu an yapay olur (4 panel DOM'u farklı); rule-of-three'ye kadar adapter-içi tutulur. |
```

---

## Sorun Giderme

### Diag script HTML dump boş

- Login başarısız oldu — `.env.local`'da credentials kontrol et
- Bayi panel session expired — yeniden çalıştır

### Adapter loop sonsuz dönüyor

- `MAX_PAGES = 50` safety guard tetiklendi mi? log'u oku
- `seenOrderNos` Set düzgün çalışıyor mu? (her `orderNo` set'e ekleniyor mu)

### Production smoke `partial` status

- Timeout aşıldı; cron `timeout-minutes` 15→20 yap
- Pagination sayfa sayısı tahmini aşıyor → tedarikçi başına `MAX_PAGES` özelleştir

### İkinci koşum `orders_inserted > 0`

- Idempotency kırıldı — orderNo unique constraint çalışıyor mu? DB'de duplicate ara
- `orderNo` parse hatası farklı tarihlerde farklı format dönüyor mu? log'u oku
