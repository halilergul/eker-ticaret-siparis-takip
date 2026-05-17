-- service_role tüm public tablolarda CRUD + RPC EXECUTE
-- 001'deki revoke_rls_auto_enable_from_public bunu çekmişti; 003 GRANT'leri sadece
-- authenticated'a verdi. Scraper (004) service_role ile bağlanır → bu eksik.
-- Hint mesajı: "GRANT SELECT ON public.suppliers TO service_role".
-- Applied via mcp__supabase__apply_migration({ name: "grant_table_privileges_to_service_role" })
-- Date: 2026-05-16

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs     TO service_role;

GRANT EXECUTE ON FUNCTION public.record_price_observation(uuid, text, text, numeric, timestamptz) TO service_role;
