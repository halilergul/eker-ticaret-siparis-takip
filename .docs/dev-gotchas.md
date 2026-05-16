# Teknik Gotcha'lar ve Bilinen Sorunlar

## Nasıl kullanılır

Geliştirme sırasında keşfedilen, sonraki oturumda bilmen gereken
teknik tuzaklar, sürprizler ve dikkat edilmesi gereken noktalar buraya kaydedilir.

Agent'lar bu dosyayı şu durumlarda günceller:
- Beklenmedik bir davranış keşfedildiğinde
- Bir hatanın kök nedeni bulunduğunda
- Belirli bir kütüphane veya altyapıyla ilgili kritik bilgi öğrenildiğinde
- "Bunu daha önce bilseydim saatlerimi kurtarırdım" niteliğinde bilgi

## Format

```
### [Kısa başlık]
- **Tarih:** YYYY-MM-DD
- **Konu:** Frontend / Backend / Mobil / Veritabanı / Altyapı / Tooling
- **Detay:** Ne oluyor ve neden oluyor?
- **Çözüm/Önlem:** Nasıl ele alınmalı?
```

---

## Kayıtlar

### `next lint` Next.js 16'da kaldırılıyor
- **Tarih:** 2026-05-16
- **Konu:** Tooling
- **Detay:** `npm run lint` çalıştırıldığında uyarı çıkıyor: `next lint is deprecated and will be removed in Next.js 16`. Şu an için çalışıyor ama ileride `next lint` yerine doğrudan `eslint .` (veya `npx eslint`) çağırmamız gerekecek.
- **Çözüm/Önlem:** Next.js 16 yükseltmesinde migration: `npx @next/codemod@canary next-lint-to-eslint-cli .`. `package.json` script'i `eslint .`'e dönüşür. Şimdilik aciliyeti yok; not olarak tutuluyor.

### Server Action + `useActionState` ile prevState kullanımı
- **Tarih:** 2026-05-16
- **Konu:** Frontend / React 19
- **Detay:** React 19 `useActionState` hook'u Server Action'a `(prevState, formData)` imzasıyla çağrı yapar. Eski stil `(formData)` Server Action ile uyumlu değil. `LoginForm` → `signIn(prevState, formData)` imzasını kullanır; aksi takdirde TypeScript hata vermese de runtime'da `formData` undefined olur.
- **Çözüm/Önlem:** Server Action başında `_prevState: ...State` parametresi tanımla; hook tarafında `useActionState<State, FormData>(action, initialState)` formatını koru.

### Türkçe karakter — UTF-8 her yerde
- **Tarih:** 2026-05-16
- **Konu:** i18n
- **Detay:** Next.js 15 + Tailwind 4 + React 19 stack'inde TR karakterler (`ı, İ, ş, ğ, ç, ö, ü`) hem JSX'te hem HTML meta'da hem form input'unda sorunsuz render oluyor; <html lang="tr"> ve UTF-8 default'u yeterli. Şifrede TR karakter de Supabase Auth tarafından sorun yaşatmıyor (HTTP body UTF-8 default).
- **Çözüm/Önlem:** Özel önlem gerekmiyor; ancak email collation arama yaparken `pg_trgm` yerine `pg_trgm + unaccent` kombinasyonu ileride lazım olabilir (henüz arama yok).
