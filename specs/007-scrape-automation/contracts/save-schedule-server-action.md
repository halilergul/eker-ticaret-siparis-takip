# Contract: Server Action `saveSchedule`

**File**: `app/actions/save-schedule.ts`
**Type**: Next.js Server Action (`"use server"`)
**Caller**: Client Component (`<ScheduleForm />`) — form submit

## Signature

```ts
export async function saveSchedule(
  input: { supplierSlug: string; enabled: boolean; dailyHourUtc: number }
): Promise<
  | { ok: true; nextRunAt: string | null }
  | { ok: false; code: SaveScheduleErrorCode; message: string }
>;

type SaveScheduleErrorCode =
  | 'UNAUTHENTICATED'
  | 'SUPPLIER_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';
```

## Input Validation

```ts
const saveScheduleSchema = z.object({
  supplierSlug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  enabled: z.boolean(),
  dailyHourUtc: z.number().int().min(0).max(23),
});
```

## Flow

1. **Auth check**: server client + `auth.getUser()` → `'UNAUTHENTICATED'` yoksa.
2. **Supplier lookup**: `supplierSlug` → `suppliers.id`. Yoksa `'SUPPLIER_NOT_FOUND'`.
3. **DB UPDATE** (UPSERT — seed migration zaten 1 satır oluşturdu):
   ```sql
   UPDATE scrape_schedule
     SET enabled = $1, daily_hour_utc = $2, updated_at = now()
     WHERE supplier_id = $3;
   ```
   `select count` 0 dönerse fallback INSERT (yeni tedarikçi eklendi senaryosu için):
   ```sql
   INSERT INTO scrape_schedule (supplier_id, enabled, daily_hour_utc)
     VALUES ($1, $2, $3) ON CONFLICT (supplier_id) DO UPDATE SET enabled = EXCLUDED.enabled, daily_hour_utc = EXCLUDED.daily_hour_utc, updated_at = now();
   ```
4. **`nextRunAt` hesapla**:
   - `enabled = false` → `null`
   - `enabled = true` → bir sonraki UTC günü `daily_hour_utc:00:00` saatine kadar JS tarafında hesapla (`new Date(... )` ileri sar). Eğer **bugün** o saate erişilmemişse bugünü dön, eriştiyse yarını dön.
5. **revalidatePath**: `revalidatePath("/dashboard/settings")`.
6. Return `{ ok: true, nextRunAt }`.

## Error UX (Türkçe)

| Code | Mesaj |
|------|-------|
| UNAUTHENTICATED | "Oturum süreniz dolmuş. Lütfen yeniden giriş yapın." |
| SUPPLIER_NOT_FOUND | "Tedarikçi bulunamadı." |
| VALIDATION_FAILED | "Saat 0-23 arasında bir tam sayı olmalı." |
| INTERNAL_ERROR | "Ayar kaydedilemedi. Tekrar deneyin." |

## UI binding

Form: `react-hook-form` + `zodResolver(saveScheduleSchema)` → submit'te Server Action çağrılır.

Başarılı kayıtta: toast/inline message "Ayar kaydedildi. Sonraki otomatik scrape: <tr-TR formatlı nextRunAt> UTC" (veya `enabled=false` ise "Otomatik scrape kapalı.").
