# Eker-Ticaret — Agent Çalışma Kılavuzu

## Proje bilgileri
- **Proje adı:** Eker-Ticaret
- **Oluşturulma tarihi:** 2026-05-15
- **Profil:** web-fullstack

## Bootstrap Modu — Yeni Proje İlk Açılışı

**Aktivasyon koşulu:** CONSTITUTION.md'de aşağıdaki yer tutuculardan en az biri varsa **bootstrap modundasın**:
- `_Bu projenin neyi çözdüğünü tek paragrafta yaz_`
- `_Kim kullanacak?_`
- `[ ] Henüz tanımlanmadı`
- `[ ] Deployment hedefi (Vercel / self-hosted / mobile store)`

İki alt modun var: **Sohbet (default)** ve **Form (talep üzerine)**. Hangisinde olduğunu kullanıcının ilk mesajından anla.

---

### Mod A — Sohbet Modu (DEFAULT)

Aşağıdaki tetikleyicilerden biri varsa bu modu kullan:
- Kullanıcı `Başla`, `başlayalım`, `start`, `merhaba` gibi kısa bir mesaj attı
- Kullanıcı doğrudan projesinden bahsetmeye başladı ("şöyle bir uygulama yapmak istiyorum...")
- Hiçbir özel komut yok, ortam belirsiz

**Akış:**

1. **Konuşmaya davet et (1-2 cümle, kibarca):**
   > "Yeni bir `web-fullstack` projesi başlatıldı. Projenden bana sohbet eder gibi anlat — ne yapmak istiyorsun, hangi sorunu çözüyor, kim kullanacak? Eksik bıraktığın yerleri sonra ben soracağım, acele etme."

2. **Kullanıcı anlatırken DİNLE — soru sorma, kesme.** Uzun bir paragraf gelse de bekle.

3. **Anlatım bittiğinde özet çıkar.** Kullanıcının söylediklerinden CONSTITUTION.md'deki alanlara ne çıkarıldığını kısaca özetle:
   ```
   Anladığım kadarıyla:
   • Amaç: [çıkardığın amaç]
   • Hedef kullanıcı: [çıkardığın]
   • V1'de var: [feature listesi]
   • V1'de yok (anti-goal): [varsa]
   • Deployment: [bahsedildi mi?]
   • Dil: [tahmin]
   ```

4. **CONSTITUTION.md'yi güncelle** (anladığın kısımları). Daha sonra netleşecek olanları `_Açık — netleşecek_` olarak işaretle.

5. **Sadece KRİTİK eksikleri hedefli sor.** Maks. 3-4 takip sorusu, hepsini birden tek mesajda numaralı liste olarak:
   > "Üç şey net olsa Constitution tamam:
   > 1) Deployment nereye olacak? (Vercel / Render / self-hosted / belli değil)
   > 2) Auth gerekli mi? Gerekiyorsa nasıl? (magic link / şifre / sosyal / yok)
   > 3) Uygulama dili? (TR / EN / iki dilli)"

6. **Cevaplar gelince Constitution'ı bitir, sonraki adıma yönlendir:**
   > "Tamam, constitution hazır. İlk feature için `/speckit-specify` ile başlayalım mı? Hangi feature'la?"

**Sohbet modu kuralları:**
- Kullanıcı konuşurken **kesme**, dinle.
- Anlatımdan **çıkarım yap**, varsayım yapma. Belirsiz olanı `_Açık_` işaretle.
- **Anti-goal'leri özellikle yakala** — "mobil yok", "multi-tenant yok" gibi negatif ifadeler kritik.
- Kullanıcı tek-tek soru sormamı isterse Mod B'ye geç.

---

### Mod B — Form Modu (talep üzerine)

Tetikleyici: Kullanıcı `soruları sırayla sor`, `form modu`, `bana tek tek sor`, `wizard gibi yap` derse.

**Akış:** Soruları **TEK TEK** sor, hepsini birden listeleme, her cevaptan sonra sonrakine geç:

- **S1 (Amaç):** "Bu projenin amacı ne? Tek paragrafta — neyi çözüyor, neden var?"
- **S2 (Hedef kullanıcı):** "Kim kullanacak?"
- **S3 (V1 kapsamı):** "İlk sürümde olmasını istediğin 2-5 ana özelliği say."
- **S4 (Anti-goal'ler):** "Bu projede **yapmayacağımız** şeyler var mı?"
- **S5 (Deployment):** "Nereye deploy edeceğiz?"
- **S6 (Dil):** "Uygulama dili? (TR / EN / iki dilli)"

Her cevaptan sonra CONSTITUTION.md'yi güncelle. Bittiğinde stack overlay'ini sor ve `/speckit-specify`'a yönlendir.

---

### Genel Bootstrap Kuralları (her iki mod için)

- **Cevap muğlaksa netleştir.** "Daha somut bir örnek verir misin?" iyi takip.
- **Cevap yoksa veya `geç` denirse,** o alanı `_Açık_` olarak işaretle ve devam et.
- **Kullanıcı `boş ver, ben dolduracağım` derse,** bootstrap'i durdur ve hızlı/tam akışa hazır ol.
- **Stack overlay'i hatırlat** (default'lar yeterliyse hızlıca geç):
  > "Profil seninle `web-fullstack` default'larını getirdi. Stack'te değiştirmek istediğin bir şey var mı? (Tailwind yerine başka, Supabase yerine başka vs.) Yoksa default'larla devam edelim."
- **Bootstrap dışında otomatik soru sorma** — kullanıcı sadece dosya okumamı istemiş olabilir, sohbet başlatmayı bekliyor olabilir.

---

## İlk açılışta oku (öncelik sırası)

### 1. Proje başlangıç dokümanları — `.docs/project-init/`
Bu klasör projeye başlarken eklenen referans dokümanları içerir (varsa).
Her oturum başında bu klasörde dosya varsa önce bunları oku, yoksa atla.

Tipik dosyalar (opsiyonel):
- `brief.md` — proje özeti, hedef kullanıcı, başarı kriterleri
- `inspiration.md` — referans ürünler, beğenilen örnekler
- `notes.md` — el ile alınmış notlar

### 2. Temel dokümanlar
- `.docs/CONSTITUTION.md` — tüm teknik kararlar, her işlemde baz al
- `.docs/AGENTS.md` — hangi agent neye erişebilir
- `.docs/WORKFLOW.md` — çalışma akışı

### 3. Güncel bağlam
- En son `.docs/meetings/MEETING-*.md` (varsa) — mevcut gereksinim durumu
- `.specify/specs/` — aktif feature specler

## Çalışma akışı (dengeli mod)

Bu projede review/qa **opsiyonel** olarak ayarlanmıştır. Hızlı iterasyon için kısa yol, kritik özellikler için tam akış kullanılır.

### Tam akış (kritik feature'lar için)
1. (Opsiyonel) `.docs/meetings/raw/` → meeting-agent → `MEETING-NNN.md`
2. `/speckit-specify` → spec.md taslağı
3. `/speckit-clarify` → clarifications.md
4. `/speckit-plan` → plan.md
5. `/speckit-analyze` → tutarlılık kontrolü
6. `/speckit-tasks` → tasks.md
7. ui-ux-agent (Figma yoksa) → UIUX-NNN.md
8. `/speckit-implement` → uygulama
9. (Opsiyonel) review-agent → code review
10. (Opsiyonel) qa-engineer → kalite kontrol

### Hızlı akış (küçük değişiklik veya prototip)
1. `/speckit-specify` → kısa spec
2. `/speckit-implement` → doğrudan uygulama

review/qa adımları kullanıcı isteğiyle çalışır, otomatik tetiklenmez.

## Stack
Stack detayları `.docs/CONSTITUTION.md` içinde tanımlanmıştır. Her agent kendi alanı için orayı okumalıdır.

## Spec revizyonları
- Bir feature'a ait düzeltme/iyileştirme için yeni spec klasörü açılmaz
- Revizyon ana feature spec klasörü altında `revisions/rev-NNN-kisa-aciklama/` altında olur
- Örnek:
  ```
  .specify/specs/
    user-management/
      spec.md, plan.md, tasks.md, ...
      revisions/
        rev-001-grid-fixes/
          spec.md, plan.md, tasks.md
  ```

## Agent bilgi kaydetme kuralı
- **Local'e yazılacaklar** (`.claude/agent-memory-local/`): Geçici notlar, kişisel tercihler, oturum bağlamı
- **Paylaşılan dosyalara yazılacaklar**: Kalıcı bilgi:
  - Mimari kararlar, convention'lar → `.docs/CONSTITUTION.md`
  - Teknik gotcha'lar → `.docs/dev-gotchas.md`
  - Workflow/süreç kuralları → `.docs/WORKFLOW.md`

**Karar kriteri:** "Bu bilgiyi sonraki oturumda kendin de bilmek ister misin?" Evet → paylaşılan dosya.

## Önemli kurallar
- API key'ler asla kaynak koda girmez — `.env` veya gizli config kullan
- `.docs/project-init/` salt okunur referans — agent değiştiremez
- Constitution'da onaylanmış kararları agent kendi başına değiştirmez

<!-- SPECKIT START -->
**Aktif feature**: `004-enderyapi-scraper-prod`
- Spec: [specs/004-enderyapi-scraper-prod/spec.md](specs/004-enderyapi-scraper-prod/spec.md)
- Plan: [specs/004-enderyapi-scraper-prod/plan.md](specs/004-enderyapi-scraper-prod/plan.md)
- Research: [specs/004-enderyapi-scraper-prod/research.md](specs/004-enderyapi-scraper-prod/research.md)
- Data model: [specs/004-enderyapi-scraper-prod/data-model.md](specs/004-enderyapi-scraper-prod/data-model.md)
- Contracts: [specs/004-enderyapi-scraper-prod/contracts/](specs/004-enderyapi-scraper-prod/contracts/) (adapter-interface, cli-contract, scrape-runs-sql)
- Quickstart (manuel test): [specs/004-enderyapi-scraper-prod/quickstart.md](specs/004-enderyapi-scraper-prod/quickstart.md)

**Önceki feature'lar** (tamamlandı, push edildi):
- `001-auth-dashboard` — [spec](specs/001-auth-dashboard/spec.md)
- `002-enderyapi-scraper-poc` — [spec](specs/002-enderyapi-scraper-poc/spec.md) (PoC Senaryo A)
- `003-supabase-schema` — [spec](specs/003-supabase-schema/spec.md) (5 tablo + RLS + RPC + types)

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan.
<!-- SPECKIT END -->
