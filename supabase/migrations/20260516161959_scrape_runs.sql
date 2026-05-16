-- Migration: scrape_runs audit table
-- Each scrape invocation appends/updates one row.
-- Applied via mcp__supabase__apply_migration({ name: "scrape_runs" })
-- Date: 2026-05-16

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

ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_runs_authenticated_read   ON public.scrape_runs FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_insert ON public.scrape_runs FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_update ON public.scrape_runs FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY scrape_runs_authenticated_delete ON public.scrape_runs FOR DELETE USING ((select auth.uid()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs TO authenticated;
