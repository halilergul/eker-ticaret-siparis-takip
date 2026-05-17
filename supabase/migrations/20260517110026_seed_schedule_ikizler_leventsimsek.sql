-- Migration: seed scrape_schedule for ikizler + leventsimsek (feature 008)
-- Applied via mcp__supabase__apply_migration({ name: "seed_schedule_ikizler_leventsimsek" })
-- Date: 2026-05-17
-- Default: disabled, daily_hour_utc=9 (kullanıcı settings'ten aktive eder)
-- Idempotent via ON CONFLICT (supplier_id unique)

INSERT INTO public.scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 9
FROM public.suppliers
WHERE slug IN ('ikizler', 'leventsimsek')
ON CONFLICT (supplier_id) DO NOTHING;
