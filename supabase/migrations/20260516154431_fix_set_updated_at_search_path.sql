-- Fix: function_search_path_mutable on public.set_updated_at
-- SET search_path makes the function deterministic and prevents privilege escalation
-- via search_path manipulation. Advisor lint 0011.
-- Applied via mcp__supabase__apply_migration({ name: "fix_set_updated_at_search_path" })
-- Date: 2026-05-16

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
