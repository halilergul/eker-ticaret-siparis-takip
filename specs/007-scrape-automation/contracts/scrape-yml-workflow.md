# Contract: GitHub Actions workflow `.github/workflows/scrape.yml`

**File**: `.github/workflows/scrape.yml`
**Triggers**: `schedule` (saatte 1) + `workflow_dispatch` (manuel/UI tetikleme)

## Workflow tanımı (yüksek seviye)

```yaml
name: Scrape

on:
  schedule:
    - cron: '0 * * * *'        # Her saat başı UTC
  workflow_dispatch:
    inputs:
      supplier:
        description: 'Tedarikçi slug (örn: enderyapi)'
        required: true
        type: choice
        options:
          - enderyapi
      trigger_type:
        description: 'Tetikleme tipi'
        required: false
        type: choice
        default: manual
        options:
          - manual

concurrency:
  group: scrape-${{ github.event.inputs.supplier || 'enderyapi' }}
  cancel-in-progress: false

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      SUPPLIER: ${{ github.event.inputs.supplier || 'enderyapi' }}
      TRIGGER_TYPE: ${{ github.event.inputs.trigger_type || (github.event_name == 'schedule' && 'auto' || 'manual') }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      ENDERYAPI_USERNAME: ${{ secrets.ENDERYAPI_USERNAME }}
      ENDERYAPI_PASSWORD: ${{ secrets.ENDERYAPI_PASSWORD }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check schedule (skip if hour mismatch)
        id: check
        if: github.event_name == 'schedule'
        run: npx tsx scripts/scrape/check-schedule.ts --supplier "$SUPPLIER"
        # Exit code 0 → continue; exit code 78 → skip remaining steps

      - name: Install Playwright Chromium
        if: github.event_name == 'workflow_dispatch' || steps.check.outcome == 'success'
        run: npx playwright install --with-deps chromium

      - name: Run order scrape
        if: github.event_name == 'workflow_dispatch' || steps.check.outcome == 'success'
        run: npm run scrape -- --supplier "$SUPPLIER" --trigger-type "$TRIGGER_TYPE"

      - name: Run catalog scrape
        if: github.event_name == 'workflow_dispatch' || steps.check.outcome == 'success'
        run: npm run scrape:catalog -- --supplier "$SUPPLIER"
```

## Detail: `scripts/scrape/check-schedule.ts`

Yeni script. Görevi:
1. CLI: `--supplier <slug>` argümanını al.
2. `SUPABASE_SERVICE_ROLE_KEY` ile Supabase'e bağlan.
3. `scrape_schedule` tablosundan ilgili satırı çek.
4. Karar:
   - `enabled = false` → `exit 78` (skip, no fail)
   - `enabled = true` AND `daily_hour_utc != current_utc_hour` → `exit 78`
   - `enabled = true` AND `daily_hour_utc == current_utc_hour` → `exit 0` (devam et)
5. Hata: `exit 1` (workflow fail eder, scrape çalışmaz).

`exit 78` GitHub Actions'ta "neutral" değil — sadece bu step başarısız olur ama subsequent steps'i `if: steps.check.outcome == 'success'` ile gate'lediğimiz için skip olur. Tüm workflow status `success` kalır (DB'ye gereksiz `failed` koşum yazılmaz).

## Detail: `scripts/scrape/run.ts` — `--trigger-type` flag

Mevcut script'e flag eklenir:
- `--trigger-type <auto|manual>` (opsiyonel, default `unknown`)
- `startRun()` çağrısı `trigger_type` parametresi ile genişletilir.
- `lib/scraper/run-logger.ts.startRun(supplierId, triggerType)` signature güncellenir.

## Secrets gereksinimleri (GitHub Repo Settings → Secrets and variables → Actions)

| Secret | Değer kaynağı |
|--------|---------------|
| `SUPABASE_URL` | Supabase project URL (NEXT_PUBLIC_SUPABASE_URL ile aynı) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ENDERYAPI_USERNAME` | B2B kullanıcı adı |
| `ENDERYAPI_PASSWORD` | B2B şifre |

## Concurrency garantileri

- `concurrency.group: scrape-${supplier}` → aynı tedarikçi için **sırada** maks 1 run pending (cancel-in-progress: false, yeni gelen kuyrukta bekler, üst eski iptal edilmez).
- Aslında `cancel-in-progress: false` + 2 dispatch geldi → GH 2.'yi kuyrukta tutar. V1'de bu yeterli; "Şimdi tetikle" Server Action zaten DB-side reddediyor olacak çoğu çift tıklamayı.

## Maliyet tahmini

- Cron: 24 tetikleme/gün × 30 gün = 720 tetikleme/ay
  - 23'ünde hour-gating ile skip (5 sn / tetik): 23 × 5 sn × 30 = 57.5 dakika/ay (check + checkout + node setup)
  - 1'inde gerçek scrape (180 sn / tetik): 30 × 180 sn / 60 = 90 dakika/ay
- Manuel: ~5 tetik/ay × 180 sn = 15 dakika/ay
- **Toplam ~165 dakika/ay** << 2000 dakika free tier
- ✓ SC-005 (sıfır maliyet) karşılanır

## V1 yaşam döngüsü

Workflow file commit edilir → GH Actions otomatik aktif. Saatte 1 cron etkin olur. UI'dan toggle açılınca o saatte gerçek scrape başlar.
