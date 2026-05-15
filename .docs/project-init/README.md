# project-init/

Proje başlangıcında referans olarak kullanılacak dokümanlar buraya konulur.
Agent'lar her oturum başında bu klasörü kontrol eder, varsa içeriği okur.

## Tipik dosyalar

- `brief.md` — Proje özeti, hedef kullanıcı, başarı kriterleri, kapsam dışı şeyler
- `inspiration.md` — Referans ürünler, beğenilen örnekler, anti-pattern'lar
- `notes.md` — El ile alınmış notlar, dağınık fikirler
- `requirements.md` — Müşteri/paydaş talepleri (varsa)
- `mockups/` — Erken aşama tasarım dosyaları, screenshot'lar

## Kurallar

- Bu klasördeki dosyalar **salt okunur referans**. Agent'lar değiştirmez.
- Resmi karar buraya yazılmaz — kararlar `../CONSTITUTION.md`'ye gider.
- Klasör boşsa agent atlayıp devam eder, hata vermez.
