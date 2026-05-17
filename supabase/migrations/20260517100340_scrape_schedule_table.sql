-- Migration: scrape_schedule table — per-supplier auto-scrape settings (feature 007)
-- Applied via mcp__supabase__apply_migration({ name: "scrape_schedule_table" })
-- Date: 2026-05-17

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

CREATE TRIGGER scrape_schedule_set_updated_at
  BEFORE UPDATE ON public.scrape_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scrape_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_schedule_authenticated_read
  ON public.scrape_schedule FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY scrape_schedule_authenticated_update
  ON public.scrape_schedule FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

GRANT SELECT, UPDATE ON public.scrape_schedule TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_schedule TO service_role;

INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 9 FROM public.suppliers WHERE slug = 'enderyapi'
ON CONFLICT (supplier_id) DO NOTHING;
