-- Grant CRUD privileges to authenticated role; RLS filters at row level.
-- Without these, even logged-in users get "42501 permission denied" before RLS evaluates.
-- service_role and supabase_admin already have full access (bypass RLS).
-- Applied via mcp__supabase__apply_migration({ name: "grant_table_privileges_to_authenticated" })
-- Date: 2026-05-16

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_snapshots TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_price_observation(uuid, text, text, numeric, timestamptz) TO authenticated;
