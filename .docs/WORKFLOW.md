# Çalışma Akışı

Bu projede **dengeli mod** uygulanır: spec yazılır ama review/qa opsiyoneldir.

## İki akış var

### Hızlı akış (küçük değişiklik, prototip, deneme)
```
/speckit-specify → /speckit-implement
```
Spec kısa kalır, doğrudan kodlamaya geçilir. review/qa atlanır.

### Tam akış (kritik feature, production-bound)
```
toplantı/not → MEETING-NNN.md
  → /speckit-specify → /speckit-clarify → /speckit-plan
  → /speckit-analyze → /speckit-tasks
  → ui-ux-agent (Figma yoksa, UIUX-NNN.md üret)
  → /speckit-implement
  → ui-ux-agent (Figma uyum, maks. 3 iter)
  → review-agent (manuel tetikle)
  → qa-engineer (manuel tetikle)
  → merge
```

---

## Adım Adım

### Adım 1 — (Opsiyonel) Toplantı notları
- Transkript veya not `.docs/meetings/raw/`'a konur
- meeting-agent → `MEETING-NNN.md` üretir
- CONSTITUTION.md'deki "Açık sorular" güncellenir

### Adım 2 — Spec yazımı
- `/speckit-specify` → `spec.md` taslağı oluşturulur
- `/speckit-clarify` (opsiyonel) → boşluklar tespit edilir
- Eksik bilgiler için kullanıcıya sorulur

### Adım 3 — Teknik planlama
- `/speckit-plan` → `plan.md` oluşturulur
- `/speckit-analyze` (opsiyonel) → spec ↔ plan tutarlılık kontrolü

### Adım 4 — Task üretimi
- `/speckit-tasks` → `tasks.md` oluşturulur

### Adım 5 — UI/UX hazırlık
**Figma varsa:** Bu adım atlanır.
**Figma yoksa:**
- ui-ux-agent spec ve constitution'ı okuyup `.docs/UIUX-NNN.md` üretir
- Renk, tipografi, spacing, component pattern'larını belirler
- frontend-agent bu dokümanı Figma yerine kullanır

### Adım 6 — Geliştirme
- `/speckit-implement` → ilgili agent'lar çalışır
- frontend-agent Figma'yı veya UIUX-NNN.md'yi referans alır
- Backend tasks → backend-agent (web profilinde)
- Mobile tasks → mobile-agent (mobile profilinde)

### Adım 6a — UI/UX uyum kontrolü
- Frontend implementasyonu tamamlandığında ui-ux-agent çalıştırılır
- Sapmalar raporlanır → frontend-agent düzeltir → tekrar kontrol
- **Maks. 3 iterasyon:** çözülmeyenler manuel incelenir

### Adım 7 — (Opsiyonel) Code review
- Kullanıcı "review et" dediğinde review-agent çalışır
- Constitution uyumu, code quality, security kontrolü
- Kritik feature için bu adımı atlama

### Adım 8 — (Opsiyonel) Kalite kontrolü
- Kullanıcı "qa yap" dediğinde qa-engineer çalışır
- Functional, edge case, i18n, regresyon kontrolü
- QA onayı sonrası feature tamamlanmış sayılır

---

## Change request akışı
1. Yeni talep gelir
2. CHANGES.md'ye yaz (tarih, talep, etki)
3. Küçük ise → hızlı akış
4. Büyük ise → spec sürecine başla

## Sprint/iterasyon ritmi
- Süresi serbest (haftalık, 2 haftalık, sürekli)
- İterasyon sonu: CHANGES.md güncelle, gotcha'ları dev-gotchas.md'ye yaz
