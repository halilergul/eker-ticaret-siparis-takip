---
description: "Task list for feature 002-enderyapi-scraper-poc"
---

# Tasks: Enderyapi Scraper PoC

**Input**: Design documents from `/specs/002-enderyapi-scraper-poc/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/scrape-cli.md](./contracts/scrape-cli.md), [quickstart.md](./quickstart.md)

**Tests**: Otomatik test **yok**. Doğrulama gerçek site karşısında manuel (quickstart.md QS-01 → QS-11). PoC'un asıl testi canlı site cevabı — mock pratik değil.

**Organization**: Task'lar 2 user story'ye göre gruplandı (US1 happy path, US2 failure detection). US2'nin sağladığı detection helper'ları US1 üzerine eklenir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Farklı dosyalar, paralel çalışabilir
- **[Story]**: US1 (happy path) veya US2 (failure detection)
- File path'leri repo köküne göre verildi

## Path Conventions

Feature kodu `scripts/scrape/` altında self-contained mini-modül (plan.md → Structure Decision). Next.js `app/` tree'sine bağımlılık yok. 004'te `lib/scraper/adapters/`'a refactor edilecek.

---

## Phase 1: Setup

**Purpose**: Playwright + tsx kurulumu, env şablonu, gitignore.

- [X] T001 Install dev dependencies and add npm script. Run `npm install -D playwright@^1.49 tsx@^4 dotenv@^16` from repo root. Then in `package.json` add `"scrape:enderyapi": "tsx scripts/scrape/enderyapi.ts"` to the `scripts` block. Then install Chromium binary: `npx playwright install chromium` (~150 MB, one-time).
- [X] T002 [P] Update `.env.example` — append two placeholder lines: `ENDERYAPI_USERNAME=` and `ENDERYAPI_PASSWORD=` with a brief comment "# Enderyapi B2B (PoC — feature 002)".
- [X] T003 [P] Append `scrape-debug/` to `.gitignore` under a new section "# Scraper debug artifacts (screenshot'lar, gitignored)".

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `scripts/scrape/` altındaki paylaşılan utility modülleri. Bu modüller hem US1 (orchestration) hem US2 (failure detection) tarafından kullanılır. 5 dosya, hepsi bağımsız — paralel yazılabilir.

**⚠️ CRITICAL**: User story'ler bu modüller olmadan başlayamaz.

- [X] T004 [P] Create `scripts/scrape/constants.ts` exporting: `SITE_BASE_URL = "https://b2b.enderyapi.com.tr"`; candidate path arrays `LOGIN_PATHS = ["/login", "/giris", "/uye-girisi"]` and `ORDER_HISTORY_PATHS = ["/account/orders", "/siparislerim", "/orders", "/hesabim/siparislerim"]`; selector pattern arrays for login form (email/username field, password field, submit button) and order list (row, product cell, date cell, price cell); TR error message strings (`ERR_MISSING_CREDS`, `ERR_LOGIN_FAILED`, `ERR_CAPTCHA`, `ERR_2FA`, `ERR_NETWORK`, `ERR_UNEXPECTED_DOM`, `ERR_TIMEOUT`, `ERR_EMPTY_HISTORY`); timeout values (`LOGIN_TIMEOUT_MS = 15000`, `NAVIGATION_TIMEOUT_MS = 20000`, `GLOBAL_TIMEOUT_MS = 60000`). Export everything as `const` with type narrowing where possible.
- [X] T005 [P] Create `scripts/scrape/credentials.ts` exporting `loadCredentials(): { username: string; password: string }`. Implementation: import `dotenv`, call `dotenv.config({ path: ".env.local" })`, define zod schema `z.object({ ENDERYAPI_USERNAME: z.string().min(1), ENDERYAPI_PASSWORD: z.string().min(1) })`, parse `process.env` with `safeParse`, on failure throw a `ScrapeError` (imported from `./errors`) with `mode: "missing-credentials"`. Return `{ username, password }` on success. No logging of values.
- [X] T006 [P] Create `scripts/scrape/price-parse.ts` exporting `parseTrPrice(raw: string | null | undefined): number | null` per research R-011. Strip whitespace, currency symbols (`₺`, `TL`, `TRY`), normalize `.` (thousands) and `,` (decimal): if both present → `replace(/\./g, "").replace(",", ".")`; if only `,` → replace with `.`; if only `.` → treat as decimal (US format fallback). Return `Number(parsed)`; if NaN or empty → return `null`. Include 5-6 unit-test-style assertion examples in JSDoc comment block (`"1.234,56 ₺" → 1234.56`, `"12,50 TL" → 12.50`, etc.).
- [X] T007 [P] Create `scripts/scrape/output.ts` exporting two functions: `formatText(lines: OrderLine[]): string` (per contracts/scrape-cli.md → Default Text format: 4 lines per order + blank separator + summary line `(N sipariş bulundu, ilk sayfa, tek deneme)`) and `formatJson(lines: OrderLine[]): string` (returns `JSON.stringify(lines, null, 2)`, Türkçe karakterler escape edilmez). Handle null `current_unit_price` per contract ("— (ürün artık listede değil)" in text mode, `null` in JSON).
- [X] T008 [P] Create `scripts/scrape/errors.ts` exporting `FailureMode` union type (10 modes per data-model.md), `ScrapeError` type, and `ScrapeError` class (extends `Error`, accepts `{ mode, message?, details?, step? }`). Also export `formatError(err: ScrapeError, verbose: boolean): { stderr: string; exitCode: number }` per the mode→message table in data-model.md. `empty-history` returns `exitCode: 0`; all others return `1`. `missing-credentials` exit code can be different (e.g., still `1`). No screenshot logic here — that's in T009/T013.

---

## Phase 3: User Story 1 — Geliştirici scraping fizibilitesini doğrular (Priority: P1) 🎯 MVP

**Goal**: `npm run scrape:enderyapi` çalıştırıldığında script `.env.local`'dan kimlik bilgilerini okur, Chromium ile siteye login olur, sipariş geçmişine gider, ilk sayfa satırlarını parse eder, her satır için güncel fiyatı detay sayfasından çeker, stdout'a basar ve exit 0 ile çıkar. **Bu story'de yalnızca temel hata yolları** (`missing-credentials`, `network`, generic `unknown`) ele alınır; spesifik failure detection US2'de.

**Independent Test**: `quickstart.md` QS-01 (text output), QS-02 (--json), QS-04 (--headed), QS-10 (< 60sn medyan), QS-11 (şifre sızıntısı yok) — hepsi ✅. QS-05 (eksik env) da bu story'de cover edilir çünkü `missing-credentials` US1'e dahil.

### Implementation for User Story 1

- [X] T009 [US1] Create `scripts/scrape/enderyapi.ts` skeleton (`"use strict";` ya da pure ESM — Node 22 default). Imports: `chromium` from `playwright`, `loadCredentials` from `./credentials`, all const'lar from `./constants`, `formatText`/`formatJson` from `./output`, `ScrapeError`/`formatError` from `./errors`. Define `async function main()` and a global `process.exit()` handler. Implement: (a) Native arg parsing — read `process.argv.slice(2)` and set `{ json, headed, verbose, help }` booleans. (b) `--help` → print help text (per contracts/scrape-cli.md → Help text) to stdout and `process.exit(0)`. (c) Unknown flag → stderr "Bilinmeyen flag: <flag>" + `process.exit(2)`. (d) Call `loadCredentials()` (throws ScrapeError if missing). (e) Launch Chromium with `{ headless: !headed }`, create context, create page. (f) `try`/`catch`/`finally`: catch any `ScrapeError` → call `formatError` → write to stderr → save screenshot if applicable → `process.exit(exitCode)`; finally always close browser. (g) For now `main()` body after browser launch is just `console.error("[scrape] TODO: login + parse")` so script runs end-to-end.
- [X] T010 [US1] In `scripts/scrape/enderyapi.ts`, implement login flow. After browser launch: navigate to `SITE_BASE_URL + LOGIN_PATHS[0]` (start with first candidate, fall through if 404). Wait for page load. Detect login form using role-based selectors first (`page.getByRole('textbox', { name: /email|kullanıcı/i })`, `page.getByRole('textbox', { name: /şifre|password/i })`, `page.getByRole('button', { name: /giriş|login/i })`) with CSS fallback (per research R-008). If form not found after trying both LOGIN_PATHS → throw `ScrapeError({ mode: "unexpected-dom", step: "login-form-find" })`. Fill credentials with `page.fill()`. Click submit. Wait for navigation. Check if still on login URL (= login failed, basic detection) → throw `ScrapeError({ mode: "login-failed", step: "login-submit" })`. Network errors during navigation → throw `ScrapeError({ mode: "network" })`. Verbose log each step to stderr. Depends on T009.
- [X] T011 [US1] In `enderyapi.ts`, implement orders navigation + row parsing. After successful login: try `ORDER_HISTORY_PATHS` in order until one returns a page with order rows; if all 4 fail, look for a navigation link with text matching `/sipariş|orders|hesabım/i` and click it (per research R-007). Once on orders page, locate the order rows using role-based selectors (`page.getByRole('row')` or table CSS). For each row, parse: `product_name` (cell text, trim), `order_date` (cell text), `purchase_unit_price` (call `parseTrPrice` from `./price-parse`). Build an array of `Partial<OrderLine>` objects (without `current_unit_price` yet — that comes in T012). If no rows found → throw `ScrapeError({ mode: "empty-history" })` (US1 ships basic empty-history with success exit; US2 polishes the message). If selectors fail entirely → `ScrapeError({ mode: "unexpected-dom", step: "orders-row-parse" })`. Verbose log each row. Depends on T010.
- [X] T012 [US1] In `enderyapi.ts`, implement per-row current price fetch + OrderLine assembly + output. For each `Partial<OrderLine>` from T011: find the product detail link in that row (`getByRole('link')` within the row), `await link.getAttribute('href')`; if found, `page.goto(productUrl)` (new tab or same — use same), find price element (`getByText(/₺/)` or class), call `parseTrPrice` → `current_unit_price`. If product page 404 or price not found, set `current_unit_price = null` and `notes: "ürün artık listede değil"`. Navigate back to orders page or store URL for `page.goBack()`. After all rows assembled, validate each with `isValidOrderLine()` (from `./data-model` — actually define inline here since data-model.md is doc not code). Build final `OrderLine[]`. Call `formatJson(lines)` if `--json` else `formatText(lines)`. Write to `process.stdout`. `process.exit(0)`. Depends on T011.

**Checkpoint US1**: Happy path çalışır. `npm run scrape:enderyapi` doğru kimlik bilgisi ile → stdout'a en az 1 OrderLine. Quickstart QS-01, QS-02, QS-04, QS-05, QS-10, QS-11 ✅. Spesifik failure detection (CAPTCHA, 2FA mesajları) henüz yok — generic `login-failed` / `unexpected-dom` / `network` mesajları görünür.

---

## Phase 4: User Story 2 — Hata durumlarında geliştirici tam ne olduğunu anlar (Priority: P2)

**Goal**: Her failure mode için **spesifik** TR mesaj + (gerekirse) screenshot. CAPTCHA tipi (reCAPTCHA / hCaptcha / Cloudflare) ayırt edilir. 2FA, login-failed, network, unexpected-dom, timeout, empty-history — hepsi distinct mesaj.

**Independent Test**: `quickstart.md` QS-06 (yanlış şifre → spesifik login-failed mesajı), QS-07 (ağ kesik → spesifik network mesajı), QS-08 (CAPTCHA tetiklerse → tip belirten mesaj), QS-09 (DOM bozuksa → step belirten mesaj). Her birinde screenshot kaydı doğrulanır.

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `scripts/scrape/detection.ts` exporting helper functions: `async function detectCaptcha(page: Page): Promise<{ kind: "recaptcha" | "hcaptcha" | "cloudflare" | "unknown" } | null>` — checks URL keywords (`cdn-cgi/challenge`, `recaptcha`, `hcaptcha`), iframe src patterns, page body text patterns (per research R-009). `async function detect2FA(page: Page): Promise<{ method: "sms" | "otp" | "authenticator" | "unknown" } | null>` — checks for input fields named `code`/`otp`/`token` and text patterns `2FA|iki faktörlü|doğrulama kodu|SMS kodu|Authenticator` (per R-010). `async function detectUnexpectedDom(page: Page, expectedStep: string): Promise<boolean>` — returns true if expected selectors not found. Each function returns null/false when nothing detected, so callers can chain.
- [X] T014 [US2] In `enderyapi.ts`, integrate detection helpers at critical decision points: (a) Immediately after `page.goto(login)` and after login submit → call `detectCaptcha`; if detected throw `ScrapeError({ mode: "captcha", details: \`tip: ${kind}\` })`. (b) After login submit and on landing → call `detect2FA`; if detected throw `ScrapeError({ mode: "2fa-required", details: \`alan: ${method}\` })`. (c) Replace the basic "still on login URL" check in T010 with: if still on login, FIRST check `detectCaptcha`/`detect2FA`; if neither, then `login-failed`. (d) On orders page parse failure (T011), check `detectCaptcha` before throwing `unexpected-dom` (CAPTCHA might come after login too). Each throw includes screenshot path (set by T015). Depends on T013 + T010-T012.
- [X] T015 [US2] In `enderyapi.ts`, implement screenshot capture wrapper. Create helper `async function saveErrorScreenshot(page: Page, mode: FailureMode): Promise<string>` — generates path `scrape-debug/${isoTimestamp}-${mode}.png` (replace `:` with `-` in timestamp), creates dir if missing (`fs.mkdir(..., { recursive: true })`), calls `await page.screenshot({ path, fullPage: false })`, returns path. Inside main `catch` block, when `ScrapeError` caught, call `saveErrorScreenshot` for modes that have a page (i.e., not `missing-credentials` or `network` pre-navigation). Attach path to error and include in `formatError` output (per contracts/scrape-cli.md). Update `formatError` in `errors.ts` to print "Screenshot: <path>" line below the main error message.
- [X] T016 [US2] In `enderyapi.ts`, add global 60s timeout wrapper around entire flow. Use `Promise.race([main(), new Promise((_, reject) => setTimeout(() => reject(new ScrapeError({ mode: "timeout", details: \`Son aktivite: ${lastStep}\` })), GLOBAL_TIMEOUT_MS))])`. Maintain `let lastStep = "init"` updated at each major phase (`"login"`, `"navigate-orders"`, `"parse-row-3"`, etc.). On timeout fire → screenshot captured + appropriate exit. Also polish `empty-history` handling: when 0 rows found and no error, output to stdout `"(Sipariş geçmişi boş — parse edilecek satır yok)"` (or JSON `[]`) and exit 0; stderr gets a single warning line.

**Checkpoint US2**: Tüm failure mode'lar spesifik mesaj veriyor. Quickstart QS-06, QS-07, QS-08 (tetiklenirse), QS-09 (manuel tetik zor — kod review yeterli) ✅. PoC ana sorusu cevap bulunmuş — başarı veya net failure mode'lardan biri.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T017 [P] Update `.docs/CHANGES.md` with new entry `CR-002 — 002-enderyapi-scraper-poc completed (2026-05-16)`. Etkilenen dosyalar: `package.json`, `.env.example`, `.gitignore`, `scripts/scrape/*` (yeni klasör). Etki analizi: yeni devDeps (playwright + tsx + dotenv), Next.js runtime'ına etkisi yok. Durum: PoC tamamlandı — sonuçlara göre 003 (Supabase schema) veya rota değişikliği.
- [X] T018 [P] Update `.docs/dev-gotchas.md` with any learnings from implementation. Tipik adaylar: "Playwright Chromium binary cache konumu", "TR fiyat parse edge case'leri", "site DOM özellikleri ve selector pattern'ları", "ENDERYAPI login form'unun gerçek yapısı". Implementer çalışırken not alır.
- [X] T019 [P] Create `scripts/scrape/README.md` for developers. İçerik: nasıl çalıştırılır (`npm run scrape:enderyapi`), env vars hangisi, flag'ler, çıktı formatları, hata mesajları tablosu (kısaltılmış data-model.md → ScrapeError tablosu), troubleshooting (ilk Playwright kurulumu, headed mode kullanımı, screenshot inceleme).
- [X] T020 Run `npm run type-check` from repo root. Fix any TypeScript errors. Expected: 0 hata. `noUncheckedIndexedAccess` strict mode'a uyumlu yazılmış olmalı (özellikle `LOGIN_PATHS[0]` gibi index erişimlerinde guard).
- [X] T021 Run `npm run lint`. ESLint flat config Next.js plugin'leri kullanır; `scripts/scrape/*.ts` Next.js-spesifik kural ihlali yapmamalı (no React, no `useClient`). Eğer no-console gibi kural uyarı verirse, `console.error`/`console.log`'ları `process.stderr.write`/`process.stdout.write`'a çevir veya `eslint.config.mjs`'a `scripts/**` için `no-console: off` override ekle. Expected: 0 hata, 0 warning.
- [X] T022 Manual regression — `quickstart.md` QS-01 → QS-11 sırayla çalıştır, sonuç tablosunu doldur. Senaryo A/B/C'den hangisi tetiklendiyse `.docs/CHANGES.md`'deki CR-002 entry'sine ekle.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1):** Bağımsız; T001 önce, T002+T003 paralel.
- **Foundational (Phase 2):** Setup tamamlandıktan sonra. 5 task hepsi [P], paralel.
- **US1 (Phase 3):** Foundational'a bağımlı. T009 → T010 → T011 → T012 sıralı (hepsi aynı `enderyapi.ts` dosyasını modifiye eder).
- **US2 (Phase 4):** Foundational'a bağımlı + US1'in `enderyapi.ts`'i mevcut olmalı. T013 (detection.ts) bağımsız [P]; T014/T015/T016 enderyapi.ts'i modifiye eder, US1 tamamlandıktan sonra.
- **Polish (Phase 5):** Tüm story'ler bittikten sonra.

### Detaylı task dependency'leri

```
T001 ──┐
T002 ──┤ (paralel; T001 npm install gerektirir, T002/T003 değil)
T003 ──┘
   │
   ▼
[Phase 2 — Foundational, hepsi paralel]
T004 (constants) ──┐
T005 (credentials) ┤  hepsi farklı dosya
T006 (price-parse) ┤  paralel yazılabilir
T007 (output)      ┤
T008 (errors)      ┘
   │
   ▼
[Phase 3 — US1, hepsi enderyapi.ts'i modifiye, sıralı]
T009 (skeleton) ─── kullanır → T005, T008, T007, T004
T010 (login)    ─── kullanır → T009'un dosyası
T011 (orders)   ─── kullanır → T010
T012 (price+output) ─── kullanır → T011, T006, T007
   │
   ▼
[Phase 4 — US2]
T013 (detection.ts)   ─── bağımsız [P] (yeni dosya), T008'e bağımlı
T014 (integrate)      ─── kullanır → T013, T012 (enderyapi.ts modify)
T015 (screenshot)     ─── kullanır → T014 + T008 update
T016 (timeout+empty)  ─── kullanır → T015
   │
   ▼
[Phase 5 — Polish]
T017 [P], T018 [P], T019 [P] — paralel
T020 (type-check) ─── T013-T016 sonrası
T021 (lint)       ─── T020 sonrası
T022 (regression) ─── T021 sonrası
```

### Parallel Opportunities

- **Phase 1:** T002 + T003 paralel (T001 sonrası veya eşzamanlı, T001 npm install bağımsız çalışır).
- **Phase 2:** 5 task ([P]) tamamen paralel — 5 farklı dosya.
- **Phase 3 (US1):** Sıralı; tek dosya inşası.
- **Phase 4 (US2):** T013 (yeni dosya) US1'den bağımsız [P] — US1 devam ederken yazılabilir.
- **Phase 5:** T017, T018, T019 paralel; T020 → T021 → T022 sıralı.

---

## Parallel Example: Phase 2 kickoff

Setup tamamlandıktan sonra 5 dosya aynı anda yazılabilir:

```text
# Foundational paralel başlangıç:
Task: "Create scripts/scrape/constants.ts (URL'ler, selector pattern'ları, hata mesajları)"
Task: "Create scripts/scrape/credentials.ts (dotenv + zod schema)"
Task: "Create scripts/scrape/price-parse.ts (parseTrPrice helper)"
Task: "Create scripts/scrape/output.ts (formatText, formatJson)"
Task: "Create scripts/scrape/errors.ts (ScrapeError class + formatError)"
```

---

## Implementation Strategy

### MVP First (Sadece US1)

1. Phase 1 → Phase 2 → Phase 3 (US1) = 12 task
2. **Checkpoint:** Happy path çalışıyor mu? Quickstart QS-01 + QS-10 yeterli MVP doğrulaması
3. Eğer happy path başarısız → US2 detection helper'larını eklemeden önce **root cause** anla (DOM mismatch mi, bot block mi?)

### Incremental Delivery

1. **Yol 1 (mutlu):** Setup + Foundational + US1 → MVP doğrulandı → US2 ile failure mode'ları zenginleştir → Polish
2. **Yol 2 (DOM mismatch):** Setup + Foundational + US1 → QS-01 patlar → DOM'u incele → T010-T012'yi düzelt → tekrar → US2 → Polish
3. **Yol 3 (bot block):** Setup + Foundational + US1 → QS-01 CAPTCHA tetikler → US2'yi öne al (T013 bot detection) → senaryo C'ye düştüğümüzü onayla → rota değiştir (Browser extension feature spec'i)

### Solo strategy (tek geliştirici — sen)

```
T001 → (T002 + T003) → T004-T008 (toplu yaz, hepsi küçük) → T009 → T010 → T011 → T012
  → US1 Checkpoint (gerçek hesapla QS-01 dene)
  → T013 → T014 → T015 → T016
  → US2 Checkpoint (QS-06, QS-07 dene)
  → T017-T019 (polish docs)
  → T020 → T021 → T022 (regression)
```

---

## Format Validation

| Task ID(s) | Has `- [ ]` | Has Task ID | Has [Story] (US fazlarında) | Has file path |
|---|:-:|:-:|:-:|:-:|
| T001-T003 | ✅ | ✅ | N/A (Setup) | ✅ |
| T004-T008 | ✅ | ✅ | N/A (Foundational) | ✅ |
| T009-T012 | ✅ | ✅ | ✅ [US1] | ✅ |
| T013-T016 | ✅ | ✅ | ✅ [US2] | ✅ |
| T017-T022 | ✅ | ✅ | N/A (Polish) | ✅ |

**Toplam: 22 task. Hepsi format-compliant.**

---

## Notes

- **PoC karakteri:** Bu feature'ın asıl başarısı kodun çalışıp çalışmaması, kodun "güzelliği" değil. Quickstart'tan sonraki gözlem 003+ feature'ları yön verir.
- **`enderyapi.ts` tek dosya:** Plan'da küçük 5 utility dosyasıyla ayrıştık ama orchestration tek dosyada — okuması/debugging'i kolay. 004'te `lib/scraper/adapters/`'a taşınırken parçalanır.
- **Site keşfi iterasyonu beklentisi:** T010-T012 ilk yazımda büyük ihtimal birden fazla deneme alır (selector ayarlama). `--headed --verbose` debugging için gerçek dostu.
- **Şifre güvenliği:** Her commit öncesi `git diff | grep -i "ENDERYAPI_PASSWORD=<gerçek-şifre-pattern>"` ile sağlama (dummy değer olmadıklarından emin ol). FR-019 sözleşmesi.

---

## Özet sayım

- **Toplam task:** 22
- **Phase 1 (Setup):** 3 task (1 ana + 2 [P])
- **Phase 2 (Foundational):** 5 task (hepsi [P])
- **Phase 3 (US1, MVP):** 4 task — Bağımsız test edilebilir, MVP buradan demo
- **Phase 4 (US2):** 4 task (1 [P] yeni dosya, 3 enderyapi.ts modify)
- **Phase 5 (Polish):** 6 task (3 [P] docs + 3 quality)
- **Suggested MVP scope:** Phase 1+2+3 = **12 task.** Bu noktada PoC ana sorusu cevaplanmış olur.
