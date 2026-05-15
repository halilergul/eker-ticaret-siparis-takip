# Geliştirme Kılavuzu

Bu doküman yeni bir projede Claude Code ve spec-kit ile nasıl çalışılacağını adım adım açıklar.

---

## Projeyi açmak

```bash
code "$HOME/Projects/{proje-adi}"
```

Claude Code'u başlat. İlk mesaj:

```
CLAUDE.md dosyasını oku ve projeyi tanı.
.docs/project-init/ klasöründe dosya varsa onları da oku.
Projeyi özetle ve geliştirmeye hazır olduğunu söyle.
```

---

## Spec-kit kurulumu (zorunlu)

`new-project.sh` proje klasörünü oluşturduktan sonra spec-kit'i **proje klasöründe manuel olarak** çalıştırman gerekir:

> Bu yapılmazsa `/speckit-specify`, `/speckit-plan` gibi hiçbir komut çalışmaz.

```bash
cd "$HOME/Projects/{proje-adi}"
uvx --from git+https://github.com/github/spec-kit.git specify init --here --integration claude --force
```

`uvx` için `uv` gerekir: `brew install uv`

---

## Adım 1 — Constitution oluştur

`/speckit-constitution`

Constitution projenin teknik anayasasıdır. Bir kez yazılır, geliştirme boyunca agent'ların baz aldığı referans noktasıdır.

### Constitution için gerekli bilgiler

**Proje kimliği**
- Projenin adı, kısa açıklama
- Hedef kullanıcı — kim kullanacak?
- Başarı kriteri — neyi yaparsa "iyi" oldu sayılır?

**Teknik kararlar** (profil overlay'i bunları önerir, gerekirse override et)
- Frontend stack ve versiyon
- Backend stack ve mimarı
- Veritabanı (Postgres, SQLite, MongoDB vb.)
- Deployment hedefi (Vercel, Render, self-hosted vb.)
- Kimlik doğrulama yaklaşımı

**Kapsam ve kısıtlar**
- Hangi feature'lar v1'de var, hangileri yok?
- Anti-goal'ler — "bunu yapmayalım" listesi
- Entegrasyon gereksinimi var mı?

### Prompt örnekleri

**project-init/ klasöründe brief.md varsa:**
```
/speckit-constitution

.docs/project-init/brief.md dosyasını okuyarak constitution'ı oluştur.

Profil overlay'inden gelen teknik kararları baz al, gerekirse
benimle teyit et.
```

**Bilgileri prompt ile veriyorsan:**
```
/speckit-constitution

Aşağıdaki bilgilere göre constitution oluştur:

Proje: Kişisel bilgi yönetim sistemi
Hedef kullanıcı: ben (kendi notlarım, görevlerim)
Stack: Next.js 14 (App Router) + Supabase + Tailwind
Deployment: Vercel
Auth: Supabase Auth (magic link)

Kapsam (v1):
- Not alma, etiketleme, arama
- Markdown desteği

Anti-goal'ler:
- Multi-user paylaşım YOK (sadece kendim)
- Mobile native YOK (sadece responsive web)
```

---

## Adım 2 — (Opsiyonel) Toplantı/not işleme

Toplantı veya kendi notlarından `MEETING-NNN.md` üret.

```
.docs/meetings/raw/ klasöründeki transkripti işle.
meeting-agent olarak MEETING-001.md oluştur.
Kararları ve açık soruları CONSTITUTION.md'ye ekle.
```

Veya doğrudan prompt ile:
```
Aşağıdaki notlardan MEETING-001.md oluştur ve CONSTITUTION.md'yi güncelle.

[notlar]
```

---

## Adım 3 — Spec yaz

```
/speckit-specify

CONSTITUTION.md'yi oku ve [feature adı] modülünün spec'ini yaz.
Kullanıcı hikayeleri ve fonksiyonel gereksinimler dahil olsun.
Kapsam dışı maddeler de açıkça belirtilsin.
```

---

## Adım 4 — (Opsiyonel) Boşlukları kapat

```
/speckit-clarify

spec.md'deki belirsiz ve eksik noktaları tespit et,
clarifications.md oluştur.
```

---

## Adım 5 — Teknik plan

```
/speckit-plan

spec.md'ye göre teknik planı oluştur.
Stack: (constitution'dan oku)
```

---

## Adım 6 — (Opsiyonel) Tutarlılık kontrolü

```
/speckit-analyze

spec.md, plan.md ve CONSTITUTION.md'yi karşılaştır.
Uyumsuzlukları raporla.
```

---

## Adım 7 — Task listesi

```
/speckit-tasks

plan.md'den task listesi oluştur.
Paralel yürütülebilecek task'ları [P] ile işaretle.
```

---

## Adım 8 — Geliştirme

```
/speckit-implement

tasks.md'deki task'ları sırayla çalıştır.
İlgili agent'ları kullan.
```

---

## Adım 9 — (Opsiyonel) Review ve QA

Bu adımlar **opsiyoneldir**. Production'a çıkacak feature için çalıştır:

```
review-agent olarak [feature adı] implementasyonunu incele.
Constitution uyumu, security ve code quality kontrolü yap.
```

```
qa-engineer olarak [feature adı] üzerinde QA yap.
Fonksiyonellik, edge case'ler, i18n ve regresyon kontrolü yap.
```

---

## Günlük çalışma ritmi

**Sabah başlarken:**
```
CLAUDE.md'yi oku, son spec ve tasks.md'ye bak.
Bugün nerede kaldık özetle, devam etmemiz gereken task nedir?
```

**Yeni feature başlarken:**
```
/speckit-specify → (opsiyonel: clarify, analyze) → plan → tasks
  → ui-ux-karar (Figma yoksa) → implement → ui-ux-kontrol
  → (opsiyonel: review, qa)
```

---

## UI/UX ile çalışmak

ui-ux-agent iki modda çalışır: **Figma var** veya **Figma yok**.

### Figma var

**Kurulum:**
1. `.mcp.json` dosyasındaki Figma API key'i değiştir
2. CONSTITUTION.md'ye Figma URL'sini ekle

**Spec yazarken:**
```
/speckit-specify

Figma tasarımındaki [ekran adı] ekranını incele:
https://www.figma.com/design/XXXX/proje?node-id=123-456

Bu ekranı baz alarak spec yaz.
```

**Implementasyon sonrası uyum kontrolü:**
```
spec → frontend-agent (implement) → ui-ux-agent (Figma karşılaştır)
     → frontend-agent (düzelt) → ui-ux-agent (tekrar)
     → maks. 3 iterasyon
```

### Figma yok

ui-ux-agent implementation öncesi tasarım kararları verir:

```
ui-ux-agent olarak [feature adı] modülünün tasarım kararlarını ver.

.specify/specs/NNN-[feature]/spec.md ve CONSTITUTION.md'yi oku.

.docs/UIUX-NNN.md olarak şunları kaydet:
- Renk sistemi (primary, semantic, neutral)
- Tipografi (font, boyutlar, ağırlıklar)
- Spacing sistemi
- Component kararları (button, form, card, modal)
- Etkileşim pattern'ları
```

frontend-agent bu dokümanı Figma yerine kullanır.

---

## Mevcut projede değişiklik yapmak

### Karar ağacı

```
Değişiklik nedir?
    |
    ├── Mevcut feature'da küçük düzeltme
    |       → CHANGES.md + direkt implement
    |
    ├── Mevcut spec'te revizyon
    |       → spec.md güncelle + etkilenen task'ları implement
    |
    └── Yeni feature veya mimari değişiklik
            → tam akış (specify → plan → tasks → implement)
```

### Senaryo A — Küçük değişiklik

```
CHANGES.md'ye şu change request'i ekle:

CR-001 — [Kısa başlık]
Talep: [Açıklama]
Etkilenen: [Dosya/modül]

Sonra bu değişikliği implement et.
Mevcut çalışan kodu bozma, sadece belirtilen alanları değiştir.
```

### Senaryo B — Mevcut spec'te revizyon

```
.specify/specs/NNN-feature/spec.md dosyasını oku.

Şu değişikliği istiyorum:
[açıklama]

Spec'i bu değişikliğe göre güncelle, etkilenen tasks'ı belirle,
sadece değişen task'ları implement et.
```

### Senaryo C — Yeni feature

```
/speckit-specify

Mevcut kodu okuyarak entegrasyon noktalarını belirle.
Yeni gereksinim: [açıklama]

Spec yaz.
```

Sonra normal akış.

---

## Mevcut projeye şablonu uygulamak

Mevcut bir projeye bu şablonu uygulamak için:

1. `new-project.sh` yerine elle ekle: `.docs/`, `.claude/`, `.specify/` klasörlerini şablondan kopyala
2. CONSTITUTION.md'yi mevcut koddan türet:
   ```
   solution-architect olarak src/ altındaki tüm kodu tara.
   Mevcut mimari kararları çıkararak .docs/CONSTITUTION.md'yi doldur.
   ```
3. Klasör yollarını güncelle (agent erişim haritası kodla uyumlu olsun)
4. Mevcut feature'lar için retroaktif spec **opsiyoneldir**.
