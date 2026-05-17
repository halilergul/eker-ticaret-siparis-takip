# Contract — `scrape_runs` Migration SQL

**Feature**: 004-enderyapi-scraper-prod | **Tarih**: 2026-05-16

Tek migration: `<ts>_scrape_runs.sql`. MCP `apply_migration` + repo dosyası.

```sql
-- 1) Tablo
CREATE TABLE public.scrape_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrape_runs_status_valid CHECK (status IN ('running','success','partial','failed','aborted')),
  CONSTRAINT scrape_runs_finished_after_started CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX scrape_runs_supplier_started_idx ON public.scrape_runs (supplier_id, started_at DESC);
CREATE INDEX scrape_runs_started_idx ON public.scrape_runs (started_at DESC);

-- 2) RLS
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_runs_authenticated_read   ON public.scrape_runs FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_insert ON public.scrape_runs FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_update ON public.scrape_runs FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_delete ON public.scrape_runs FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- 3) Authenticated role privileges (003 gotcha — RLS yetmiyor, GRANT da lazım)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs TO authenticated;
```

## TS types için regenerate

Migration sonrası `mcp__supabase__generate_typescript_types` çağrılır, `lib/supabase/database.types.ts` overwrite edilir. `Database['public']['Tables']` içine `scrape_runs` eklenir; TypeScript build clean kalır.

## Constraint tests

| Test | Beklenen |
|------|----------|
| `INSERT` `status='blah'` | 23514 (check_violation) |
| `INSERT` finished_at < started_at | 23514 |
| `DELETE supplier` with active scrape_runs | 23503 (FK RESTRICT) |
| Anon role SELECT | 42501 permission denied |
| Authenticated no-session SELECT | 0 rows (RLS) |
| service_role SELECT | tüm satırlar |

## Volume tahmini

V1 (manuel): ~100 satır/yıl; V2 (Actions saatlik): ~9000 satır/yıl. <30 MB toplam.
