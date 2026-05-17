-- Migration: scrape_runs.trigger_type column add (feature 007)
-- Applied via mcp__supabase__apply_migration({ name: "scrape_runs_trigger_type" })
-- Date: 2026-05-17

ALTER TABLE public.scrape_runs
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.scrape_runs
  ADD CONSTRAINT scrape_runs_trigger_type_valid
  CHECK (trigger_type IN ('auto','manual','unknown'));
