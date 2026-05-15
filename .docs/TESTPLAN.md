# Test Planı

## Test seviyeleri

### Unit testler
- Her business logic fonksiyonu/method'u test edilmeli
- Component testleri (kritik UI davranışı için)
- Minimum coverage: kullanıcı tercihi (öneri: %60-70)

### Integration testler
- API endpoint'leri end-to-end test edilmeli
- Veritabanı işlemleri test container veya in-memory DB ile

### E2E testler (opsiyonel)
- Kritik user flow'lar (login, ödeme, ana feature)
- Playwright/Cypress

## Kabul kriterleri
Bir feature tamamlanmış sayılmak için:
- [ ] Spec gereksinimleri karşılandı
- [ ] Unit testler yazıldı ve geçiyor (kritik path için)
- [ ] Manuel happy path test edildi
- [ ] (Production-bound ise) review-agent + qa-engineer onayı

## Test senaryoları

_Spec tamamlandıkça buraya eklenir._

### Şablon
```
#### TC-NNN — Senaryo adı
- **İlgili spec:** specs/NNN-feature/spec.md
- **Ön koşul:** ...
- **Adımlar:** 
  1. ...
  2. ...
- **Beklenen sonuç:** ...
- **Durum:** Yazılmadı / Geçti / Başarısız
```
