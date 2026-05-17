# Phase 0 — Research: Otomatik scrape pipeline

**Feature**: 007-scrape-automation
**Date**: 2026-05-17

Bu dokümanda Technical Context'te netleşmesi gereken kararlar tek tek kapatılır. Her başlık altında alternatifler değerlendirilir ve seçim gerekçelendirilir.

---

## R1 — Manuel tetikleme: GitHub `workflow_dispatch` vs `repository_dispatch` vs Supabase Edge Function

**Karar**: **GitHub `workflow_dispatch` REST API** — Server Action içinden fine-grained PAT ile çağrılır.

**Rationale**:
- `workflow_dispatch` belirli workflow file'a doğrudan input verir; UI tarafından "Şimdi Enderyapı'yı tara"yı temiz haritalar (`inputs.supplier = "enderyapi"`).
- `repository_dispatch` event_type'a göre filter yapmak gerekir; workflow file her event_type için ayrı `if` ister — gereksiz karmaşa.
- Supabase Edge Function aracı bir layer ekler; nihayetinde yine GitHub API'ye çağrı yapar; tek kullanıcı için fayda yok, başarısızlık noktası fazla.
- Fine-grained PAT'in scope'u `Actions: Read and write` + tek repo — token sızsa bile blast radius dar.

**Alternatives considered**:
- Vercel Cron + Next.js Route Handler: Vercel Function timeout 10-300 sn (Hobby/Pro). Playwright chromium binary 170 MB+, function image limit 250 MB. Headless Chrome cold start + scrape süresi (90-180 sn) timeout'a yakın → fragile. CONSTITUTION zaten karar verdi: scrape GH Actions'da kalır.
- Supabase pg_cron + edge function: Edge function GitHub'a HTTP atar ama pg_cron'un kendisi Free tier'da kullanılabilir. Aynı GitHub layer'ı katlayıp eski user-end karmaşıklığa dönüyor; faydası yok.

**Implementation notes**:
- `POST /repos/{owner}/{repo}/actions/workflows/scrape.yml/dispatches` body: `{ ref: "master", inputs: { supplier: "enderyapi", trigger_type: "manual" } }`
- Yanıt: `204 No Content` (başarılı) — workflow ID dönmez; tracking için Server Action **önceden** `scrape_runs` satırı INSERT eder (`status: 'queued'`), workflow ID'sini cevap header'ından çekmek mümkün değil → workflow ayrı pre-step'te scrape_runs INSERT yaparak ID üretir → kullanıcının gördüğü "queued" satırı workflow başlayınca "running"e geçer (matched by `started_at` proximity, basit yaklaşım).

---

## R2 — Cron strategy: GH Actions `schedule` saatte 1 + DB hour-gating vs dinamik cron generation

**Karar**: **Saatte 1 çalışan tek cron + workflow ilk step'te DB'den hour eşleşme kontrolü** (CONSTITUTION G16 zaten bu yaklaşımı belirtmiş).

**Rationale**:
- GH Actions cron'u dinamik değil — DB'deki saat değişirse workflow file'ı her seferinde commit etmek gerekir, manuel müdahale ve sürüm kontrolü kirliliği.
- Saatte 1 kontrol, "DB'de hour ve current_hour_utc eşleşiyor mu + enabled true mu?" → eşleşmezse 5 sn içinde çıkar, GitHub Actions dakika sayar (sadece çalışan saniyeleri). Free tier kotası tehlikede değil (~24 × 5 sn / gün = 2 dk/gün = 60 dk/ay aktif boş çalışma).
- Saat 00 dilimi içinde tetikleme yeterli (`SC-002`: ±1 saat granülarite kabul edilmiş).

**Alternatives considered**:
- Birden fazla cron expression (her saat için ayrı) + workflow file'ı UI'dan yeniden yaz: Karmaşık, race condition, deploy gerekir → reddedildi.
- Hour eşleşmesini matrix strategy ile filtreleme: GH Actions matrix saat-bazlı filtreleme yapmaz, gereksiz over-engineering.

**Implementation notes**:
- Workflow ilk job step: `npx tsx scripts/scrape/check-schedule.ts --supplier $SUPPLIER` → exit 0 (devam et) ya da exit 78 (skip, no fail). Workflow `steps.check.outputs.skip == 'false'` ise sonraki step çalışır.
- workflow_dispatch tetikli koşumlarda check skip edilir (input olarak `trigger_type=manual` gelirse veya `github.event_name == 'workflow_dispatch'` ise).

---

## R3 — Concurrency: aynı tedarikçi için aynı anda 2 koşum olmasın

**Karar**: **GitHub Actions `concurrency` group** (cancel-in-progress: false) + **Server Action önce DB'de "running koşum var mı?" kontrolü**.

**Rationale**:
- GH `concurrency.group: scrape-${{ inputs.supplier || 'enderyapi' }}` + `cancel-in-progress: false`: ikinci dispatch otomatik pending kuyruğa düşer veya skip edilir. Free tier'da kuyruk maks 1 derinlik.
- Server Action layer'da ekstra check: kullanıcıya **anında** "Devam ediyor, bekleyin" mesajı dönmek için (GH API kabul eder ama workflow başlayana kadar UI bunu bilmez).

**Alternatives considered**:
- Yalnızca DB-lock: GH Actions yine de paralel başlatabilir (workflow_dispatch yanıt 204 hemen döner). Yetersiz.
- Yalnızca GH concurrency: UI hemen feedback veremez (workflow saniyeler sonra başlar). Yetersiz.

**Implementation notes**:
- Server Action:
  ```
  const recentRunning = await supabase
    .from("scrape_runs")
    .select("id")
    .eq("supplier_id", id)
    .eq("status", "running")
    .gt("started_at", new Date(Date.now() - 10*60_000).toISOString())  // son 10 dk
    .maybeSingle();
  if (recentRunning.data) return { ok: false, error: "ALREADY_RUNNING" };
  ```
- Workflow `concurrency.group: scrape-${{ inputs.supplier }}` + `cancel-in-progress: false`.

---

## R4 — Credentials migration: `.env.local` → GitHub Repo Secrets

**Karar**: **B2B kimlik bilgileri + Supabase service role key GitHub Repo Secrets'a taşınır**; `.env.local` yalnızca **dev** ortamında kullanılmaya devam eder (gitignore'da, commit'lenmez).

**Rationale**:
- Constitution G15 bu göçü zaten plan etmişti; bu feature G15'i kapatır.
- Workflow file şu env'leri Secrets'tan okuyacak: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENDERYAPI_USERNAME`, `ENDERYAPI_PASSWORD`.
- Vercel env: yalnızca `GITHUB_PAT` (server-only) + zaten orada olan `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server runtime ve client paylaşır).
- PAT scope: fine-grained, sadece bu repo, `actions: read and write` izni → ihlal halinde sadece bu repo'nun workflow tetiklemeleri açığa çıkar; commit/push veya issue erişimi yok.

**Implementation notes**:
- Secrets nasıl set edilir: `gh secret set ENDERYAPI_USERNAME -b "value"` (CLI) veya GitHub UI > Settings > Secrets and variables > Actions.
- Vercel `GITHUB_PAT`: `vercel env add GITHUB_PAT production` (CLI) veya Vercel UI > Settings > Environment Variables.
- Quickstart'ta tam set/test sırası dokümante edilir.
- `.env.example` güncellenir: yeni gereksinim — `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO`.

---

## R5 — `scrape_schedule` tablo şeması: bir tedarikçi için 1 satır mı, çok satır mı?

**Karar**: **Bir tedarikçi başına 1 satır** (`UNIQUE (supplier_id)`).

**Rationale**:
- V1'de günde 1 tetikleme — birden fazla saat dilimi gerekirse V2'de çoklu satıra geçilir.
- `INSERT OR UPDATE` (UPSERT) `ON CONFLICT (supplier_id) DO UPDATE` ile tek satırlı pattern temiz.
- Eğer ileride "günde 2 kere: 09:00 + 17:00" gerekirse, ya `daily_hour_utc int[]` kolonu eklenir ya da tablo `(supplier_id, daily_hour_utc)` composite PK'ya migrate edilir. Şimdi YAGNI.

**Alternatives considered**:
- Tedarikçi başına çok satır (`UNIQUE (supplier_id, daily_hour_utc)`): V2 ihtiyacı belirsizken erken karmaşa.

---

## R6 — `scrape_runs.trigger_type` enum vs text + CHECK

**Karar**: **`text NOT NULL DEFAULT 'unknown' CHECK (trigger_type IN ('auto', 'manual', 'unknown'))`** — Postgres enum yerine text + CHECK.

**Rationale**:
- Mevcut migration pattern'ı (`status text CHECK ...`) text + CHECK kullanıyor. Tutarlılık.
- Enum schema migration'ı `ALTER TYPE` gerektirir, text + CHECK basit `ALTER TABLE`.
- 3 değer küçük; performance/storage farkı yok.
- Default `'unknown'` mevcut kayıtlar için güvenli geriye uyum (geçmiş scrape_runs satırları kaybedilmez).

---

## R7 — UI feedback: optimistic update vs auto-poll vs manuel refresh

**Karar**: **Manuel refresh + Server Action revalidatePath** — sayfa otomatik yenilenmez; kullanıcı tetikledikten sonra Server Action `revalidatePath("/dashboard/settings")` çağırır ve hemen "tetiklendi" durumunu görür; sonraki "running → success" geçişi için kullanıcı sayfayı manuel yeniler.

**Rationale**:
- Spec'in Assumptions bölümü zaten manuel refresh kabul etmiş ("Sayfa yenilemesi (auto-refresh) gerekmez").
- Polling/SSE = ekstra Vercel function invocation = sıfır maliyet sınırına yaklaşır.
- Optimistic state karmaşıklık eklemeyi haklı çıkaracak UX gain yok (5 dk içinde sonuçlanır, kullanıcı zaten beklemiyor).

**Alternatives considered**:
- React Query + `refetchInterval: 30s`: UX iyi ama sıfır maliyet kaygısı.
- Supabase Realtime subscription `scrape_runs`: Free tier'da realtime kanal limiti var; tek kullanıcı için over-engineering.

---

## R8 — Saat dilimi gösterimi: UTC mu Europe/Istanbul mu DB'de saklanır?

**Karar**: **DB'de `daily_hour_utc` (0-23 UTC) saklanır**; UI hem UTC saatini hem Türkiye karşılığını gösterir.

**Rationale**:
- GH Actions cron UTC bazlı çalışır — DB değerini UTC tutmak workflow logic'ini basit tutar (`now_utc.hour == row.daily_hour_utc`).
- Türkiye yaz/kış saati uygulamasını **kalıcı olarak** UTC+3'e geçti (2016), DST yok → sabit ofset (`+3 saat`).
- UI Helper: `intl-time-formatter` zaten mevcut; ek `hour_utc + 3` (mod 24) hesapla göster.

**Alternatives considered**:
- Local TZ DB'de: workflow'un local time hesabı gerekir; gereksiz katman.

---

## R9 — Workflow file: monorepo'da tek workflow vs supplier başına ayrı workflow

**Karar**: **Tek `.github/workflows/scrape.yml`** — `inputs.supplier` ile farklı tedarikçileri çalıştırır.

**Rationale**:
- V1 tek tedarikçi; çoklu workflow over-engineering.
- Tek file = tek concurrency.group `scrape-${{ inputs.supplier }}` → tedarikçiler birbirini engellemez ama aynı tedarikçi paralel çalışmaz.
- Workflow_dispatch input parametrik: `supplier: { type: choice, options: [enderyapi] }` (gelecekte tedarikçi eklenir liste büyür).

---

## R10 — Test stratejisi

**Karar**: **Quickstart-driven manuel testler V1 için yeterli**; automated unit/integration testleri V2'ye ertelenir.

**Rationale**:
- Mevcut codebase'de Vitest set-up yok (CONSTITUTION'da önerili ama henüz kurulu değil); kurulum + ilk testler 1-2 günlük ek iş.
- Tetikleme akışı integration test'i GitHub API'yi mock'lamak veya canary repo kullanmak gerekir → kompleks.
- Quickstart adım adım test ediliyor (UI + DB doğrulaması + workflow log'u + scrape_runs kayıt kontrolü) — V1 prototip için yeterli kanıt.

**Alternatives considered**:
- Vitest kurulumu + `app/actions/trigger-scrape.test.ts` (GitHub API mock): Vitest config kuralım + 1 örnek test → çalışan iskele bir sonraki feature'a kazanım. Ancak bu feature'ı kırıyor olabilir (timeline). V2'ye iter.

---

## Resolved

Tüm NEEDS CLARIFICATION yok; spec açıktı, plan teknik kararlarını rationalize etti. Phase 1'e geçilebilir.
