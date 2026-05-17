# Quickstart — Manuel Test Akışı (007)

**Feature**: 007-scrape-automation
**Audience**: Halil (developer/admin) — feature deployment + acceptance test

Bu doküman feature'ın **manuel olarak** uçtan uca nasıl test edileceğini açıklar. Otomatik test V1'de yok.

## Önkoşullar

1. ✓ Repo `master` branch'inde 007 implementation merge edilmiş ve **Vercel'e deploy** olmuş
2. ✓ DB migration'ları (scrape_schedule + scrape_runs.trigger_type) uygulanmış
3. ✓ **GitHub Repo Secrets** ayarlı (aşağıdaki Setup Step 1'de)
4. ✓ **Vercel env vars** ayarlı (Setup Step 2'de)
5. ✓ `.github/workflows/scrape.yml` repo'da var

---

## Setup Step 1 — GitHub Repo Secrets

GitHub repo > Settings > Secrets and variables > Actions > New repository secret:

| Secret name | Değer |
|-------------|-------|
| `SUPABASE_URL` | Supabase project URL (NEXT_PUBLIC_SUPABASE_URL ile aynı) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard > Settings > API > service_role key |
| `ENDERYAPI_USERNAME` | B2B kullanıcı adı |
| `ENDERYAPI_PASSWORD` | B2B şifre |

CLI alternatifi:
```bash
gh secret set SUPABASE_URL --body "$NEXT_PUBLIC_SUPABASE_URL"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
gh secret set ENDERYAPI_USERNAME --body "$ENDERYAPI_USERNAME"
gh secret set ENDERYAPI_PASSWORD --body "$ENDERYAPI_PASSWORD"
```

## Setup Step 2 — Vercel Env Vars

Vercel dashboard > Project > Settings > Environment Variables:

| Variable | Environment | Değer |
|----------|-------------|-------|
| `GITHUB_PAT` | Production, Preview | Fine-grained PAT (scope: `Actions: Read and write`, sadece `eker-ticaret-siparis-takip` repo) |
| `GITHUB_OWNER` | Production, Preview | `halilergul` |
| `GITHUB_REPO` | Production, Preview | `eker-ticaret-siparis-takip` |

PAT nasıl oluşturulur:
1. GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token
2. Repository access: **Only select repositories** > `eker-ticaret-siparis-takip`
3. Repository permissions: **Actions: Read and write**
4. Expiration: 90 gün (önerilir, rotasyon planı için)

## Setup Step 3 — Vercel redeploy

Env değişiklikleri sonrası **redeploy** zorunlu (env vars build-time/edge cache).

---

## Test 1 — Settings sayfasına erişim (FR-001, FR-018)

1. https://eker-ticaret.vercel.app/login — login (mevcut auth flow)
2. Top-bar menüsünde **Ayarlar** linkine tıkla → `/dashboard/settings` açılır
3. **Beklenen**: Sayfa açılır, "Enderyapı" başlıklı 1 kart görünür. Toggle, hour dropdown, "Şimdi tetikle" butonu, "Son koşumlar" listesi görünür (liste boş veya 006'dan kalma satırlar olabilir).
4. Logout → `/dashboard/settings` aç → `/login`'e yönlendirilir. ✓

---

## Test 2 — Manuel tetikleme (US1, FR-005, FR-009, FR-010)

1. Settings sayfasında **"Şimdi tetikle"** butonuna tıkla
2. **Beklenen (5 sn içinde)**: Toast/inline mesaj: "Tetiklendi — sonuç birkaç dakika içinde görünür". Buton disabled (`Devam ediyor`).
3. Son koşumlar listesinin üstünde yeni satır: status `running`, tip `manual`.
4. GitHub > Actions sekmesi → **Scrape** workflow → yeni run görünür ("triggered by workflow_dispatch", "trigger_type: manual" inputs).
5. Workflow tamamlanır (~2 dk). Settings sayfasını **yenile** → koşum satırı `success`/`partial` durumuna geçer; summary "X sipariş, Y snapshot, Z hata" gösterir.
6. **Doğrulama**: `/dashboard/orders` → yeni siparişler (varsa) listede; `/dashboard/price-changes` → yeni snapshot'lardan oluşan değişim varsa görünür.

---

## Test 3 — Çift tıklama / concurrency (FR-011)

1. "Şimdi tetikle"ye bas → workflow başlar
2. 10 sn içinde **tekrar** "Şimdi tetikle"ye bas
3. **Beklenen**: İkinci tıklama "Önceki tetikleme henüz tamamlanmadı. Birkaç dakika bekleyin." hata mesajı döner. GitHub Actions'da **ikinci** workflow run **görünmez**.
4. ✓ FR-011 karşılanır

---

## Test 4 — Saat ayarı + Kaydet (US2, FR-002, FR-004, FR-008)

1. Settings sayfasında **Otomatik scrape** toggle'ı kapalıyken aç
2. **Günlük saat** dropdown'ından `09` (UTC) seç → açıklama yanında "09:00 UTC = 12:00 İstanbul" gösterilir
3. **Kaydet** butonuna tıkla
4. **Beklenen**: Mesaj: "Ayar kaydedildi. Sonraki otomatik scrape: <yarın 09:00 UTC tr-TR formatlı>". Form yeniden çizilir (yeni values).
5. DB doğrulama: `SELECT enabled, daily_hour_utc, updated_at FROM scrape_schedule;` → `true, 9, <current_time>`

---

## Test 5 — Otomatik tetikleme (US2)

> **Not**: Bu test gerçek bir günlük scrape çalışmasını gözlemek için 1 gün beklemeyi gerektirir. Hızlı test için aşağıdaki "simülasyon"u kullan.

### Gerçek gözlemleme

1. Test 4'ten sonra saati **şu anki UTC saat + 1** olarak ayarla, kaydet
2. Bir sonraki saat dilimi başında (örn. 14:00 UTC ise 14:00-14:59 arası) → GH Actions'da otomatik **Scrape** run görünür (`schedule` triggered)
3. `scrape_runs` tablosunda yeni satır `trigger_type='auto'`, `status='success'`

### Hızlı simülasyon (cron beklemeden)

1. GH Actions > Scrape workflow > **Run workflow** (manuel dispatch)
2. inputs: supplier=enderyapi, trigger_type=manual
3. Çıktıyı izle → success/partial/failed
4. `scrape_runs` tablosunda satır ekleneceği için bir kez de **dispatched-via-API** simülasyonu Setting sayfasındaki butondan yapıldı (Test 2).

---

## Test 6 — Toggle kapatma (FR-007)

1. Test 4-5'ten sonra **Otomatik scrape** toggle'ını kapat, kaydet
2. "Sonraki otomatik scrape: kapalı" mesajı
3. DB: `scrape_schedule.enabled = false`
4. Sonraki gün aynı saatte → GH Actions cron tetiklenir ama **check-schedule step**'i `enabled = false` görüp exit 78 → scrape başlamaz
5. `scrape_runs` tablosunda yeni satır **oluşmaz**

---

## Test 7 — Geçmiş kayıt detayı (US3, FR-013, FR-014)

1. Settings sayfasında **Son koşumlar** bölümü en yeni 10 koşumu listeler (yeni → eski)
2. Bir `partial` veya `failed` koşum satırına tıkla → genişler ve hata özeti gösterir (örn. "1 hata: order-process [scrape-page-load]: timeout 12345/...")
3. **Beklenen**: hata mesajında **kullanıcı adı, şifre, token** **YOK**

---

## Test 8 — Credential leak taraması (FR-015, FR-016, FR-017, SC-006)

1. Repo'da:
   ```bash
   git grep -i "enderyapi" -- ':!*.md' ':!specs/*'
   git grep -E "(SUPABASE_SERVICE_ROLE|ENDERYAPI_(USERNAME|PASSWORD))=" -- ':!*.md' ':!specs/*'
   ```
2. **Beklenen**: Hiçbir gerçek değer dönmemeli — sadece variable adı referansları (process.env.X).
3. Opsiyonel: `gitleaks detect --source . --no-banner` → 0 finding

---

## Çıkış kriterleri (Definition of Done)

- [ ] Test 1-8 tamamı yeşil
- [ ] DB'de `scrape_schedule` 1 satır + RLS aktif
- [ ] DB'de `scrape_runs.trigger_type` kolonu mevcut
- [ ] GH Actions Secrets seti dolu (4 secret)
- [ ] Vercel env vars seti dolu (3 var)
- [ ] `.env.local`'den B2B credentials silinmiş (sadece dev için yedek `.env.local.example`'da kalır, gerçek değerler kaldırılmış)
- [ ] CONSTITUTION.md > Mimari kararlar tablosuna 2026-05-17 girişi eklenmiş
- [ ] CONSTITUTION.md > "Açık sorular" bölümünde G15 ile ilgili madde işaretlenmiş ("[x] B2B credentials → GitHub Secrets göçü 007'de tamamlandı")

---

## Rollback (gerekirse)

1. GH Repo Settings > Actions > **Disable Actions** (cron'u durdurur)
2. DB: `DROP TABLE public.scrape_schedule;` + `ALTER TABLE public.scrape_runs DROP COLUMN trigger_type;`
3. Vercel: GITHUB_PAT etc. env vars sil
4. UI: `/dashboard/settings` route 404 olur (page.tsx silinerek), top-bar link kaldırılır

Maliyet riski yok — DB satır küçük (1 satır), env vars cleanup'la temiz state'e döner.
