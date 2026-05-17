# Contract: Server Action `triggerScrape`

**File**: `app/actions/trigger-scrape.ts`
**Type**: Next.js Server Action (`"use server"`)
**Caller**: Client Component (`<TriggerNowButton />`)

## Signature

```ts
export async function triggerScrape(
  input: { supplierSlug: string }
): Promise<
  | { ok: true; runId: string; message: string }
  | { ok: false; code: TriggerErrorCode; message: string }
>;

type TriggerErrorCode =
  | 'UNAUTHENTICATED'
  | 'SUPPLIER_NOT_FOUND'
  | 'ALREADY_RUNNING'
  | 'GITHUB_API_FAILED'
  | 'INTERNAL_ERROR';
```

## Input Validation

```ts
const triggerInputSchema = z.object({
  supplierSlug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
});
```

## Flow

1. **Auth check**: `await createServerClient()` → `auth.getUser()`. Yoksa `{ ok: false, code: 'UNAUTHENTICATED' }`.
2. **Supplier lookup**: `suppliers.id` ile `supplier_slug` eşle. Yoksa `'SUPPLIER_NOT_FOUND'`.
3. **Concurrency check**: Son 10 dakika içinde `scrape_runs` for this supplier with `status='running'` var mı? Varsa `'ALREADY_RUNNING'`.
4. **GitHub API çağrısı**:
   ```
   POST https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/scrape.yml/dispatches
   Headers:
     Authorization: Bearer ${GITHUB_PAT}
     Accept: application/vnd.github+json
     X-GitHub-Api-Version: 2022-11-28
   Body:
     { ref: "master", inputs: { supplier: supplierSlug, trigger_type: "manual" } }
   ```
   Expected: `204 No Content`. Diğer durumlarda `'GITHUB_API_FAILED'` (response.status + body kullanıcıya gösterilmez, sadece log'lanır).
5. **Optimistic DB insert**: `scrape_runs` INSERT (`status: 'running'`, `trigger_type: 'manual'`, `supplier_id`). Yeni `runId` dön.
6. **revalidatePath**: `revalidatePath("/dashboard/settings")` → server-rendered son koşumlar listesi tazelenir.
7. Return `{ ok: true, runId, message: "Tetiklendi — sonuç birkaç dakika içinde görünür" }`.

## Security

- `GITHUB_PAT` **yalnızca server runtime**'da okunur (`process.env.GITHUB_PAT`); Client'a sızmaz.
- Hata mesajlarında **token, repo URL'i tam path, response body** kullanıcıya **dönmez** — sadece kategori (`code`) + Türkçe açıklama.
- Server Action `"use server"` directive ile bind; Next.js otomatik POST-only endpoint olarak expose eder, GET/manuel curl ile tetiklenemez (CSRF token koruması Next.js native).

## Error UX (Türkçe)

| Code | Kullanıcıya gösterilecek mesaj |
|------|--------------------------------|
| UNAUTHENTICATED | "Oturum süreniz dolmuş. Lütfen yeniden giriş yapın." |
| SUPPLIER_NOT_FOUND | "Tedarikçi bulunamadı. Sistem yöneticisi ile irtibata geçin." |
| ALREADY_RUNNING | "Önceki tetikleme henüz tamamlanmadı. Birkaç dakika bekleyin." |
| GITHUB_API_FAILED | "Tetikleme başlatılamadı. Sistem yöneticisi ile irtibata geçin." |
| INTERNAL_ERROR | "Beklenmeyen bir hata oluştu. Tekrar deneyin." |

## Test örnekleri (manuel, V1)

- ✓ Authenticated kullanıcı + valid slug → `{ ok: true, runId: <uuid> }` + 5 sn içinde `scrape_runs`'a yeni satır
- ✓ Logged-out kullanıcı → middleware tarafından `/login`'e yönlendirilir; Server Action zaten çalışmaz
- ✓ Aynı saniye içinde 2 tıklama → ikincisi `'ALREADY_RUNNING'`
- ✓ Geçersiz PAT → `'GITHUB_API_FAILED'` (response 401)
