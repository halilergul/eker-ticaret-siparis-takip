# Contract: `public.scrape_schedule` tablosu

**Migration file**: `supabase/migrations/<timestamp>_scrape_schedule_table.sql`
**Applied via**: `mcp__supabase__apply_migration({ name: "scrape_schedule_table", query: <SQL> })`

## SQL kontratı

```sql
-- Migration: scrape_schedule table — per-supplier auto-scrape settings
-- Applied via mcp__supabase__apply_migration({ name: "scrape_schedule_table" })

CREATE TABLE public.scrape_schedule (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  enabled               boolean NOT NULL DEFAULT false,
  daily_hour_utc        smallint NOT NULL DEFAULT 9,
  last_auto_run_at      timestamptz,
  last_auto_run_status  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrape_schedule_supplier_unique UNIQUE (supplier_id),
  CONSTRAINT scrape_schedule_hour_range CHECK (daily_hour_utc >= 0 AND daily_hour_utc <= 23),
  CONSTRAINT scrape_schedule_status_valid CHECK (
    last_auto_run_status IS NULL OR last_auto_run_status IN ('success','partial','failed','aborted')
  )
);

-- Trigger: updated_at otomatik
CREATE TRIGGER scrape_schedule_set_updated_at
  BEFORE UPDATE ON public.scrape_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.scrape_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_schedule_authenticated_read
  ON public.scrape_schedule FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY scrape_schedule_authenticated_update
  ON public.scrape_schedule FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Grants
GRANT SELECT, UPDATE ON public.scrape_schedule TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_schedule TO service_role;

-- Seed: Enderyapı için disabled default satır
INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 9 FROM public.suppliers WHERE slug = 'enderyapi'
ON CONFLICT (supplier_id) DO NOTHING;
```

## `scrape_runs.trigger_type` migration (ayrı)

```sql
-- Migration: scrape_runs.trigger_type kolon ekle
-- Applied via mcp__supabase__apply_migration({ name: "scrape_runs_trigger_type" })

ALTER TABLE public.scrape_runs
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.scrape_runs
  ADD CONSTRAINT scrape_runs_trigger_type_valid
  CHECK (trigger_type IN ('auto','manual','unknown'));
```

## Doğrulama (migration sonrası)

```sql
-- Tablo var mı + satır oluştu mu?
SELECT count(*) FROM public.scrape_schedule;  -- beklenen: 1 (Enderyapı seed)

-- RLS aktif mi?
SELECT relrowsecurity FROM pg_class WHERE relname = 'scrape_schedule';  -- beklenen: t

-- Policy'ler var mı?
SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scrape_schedule';
-- beklenen: 2 (read + update)

-- trigger_type kolonu eklendi mi?
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scrape_runs' AND column_name = 'trigger_type';
-- beklenen: text, 'unknown'::text
```
