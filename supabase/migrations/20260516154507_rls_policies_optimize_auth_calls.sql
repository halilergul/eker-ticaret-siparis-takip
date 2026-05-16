-- Fix: auth_rls_initplan — re-evaluate auth.uid() per row (lint 0003)
-- Pattern: wrap auth.uid() in (select ...) so Postgres caches it once per query.
-- Drop and recreate 20 policies (Postgres has no ALTER POLICY ... USING).
-- Applied via mcp__supabase__apply_migration({ name: "rls_policies_optimize_auth_calls" })
-- Date: 2026-05-16

-- suppliers
DROP POLICY suppliers_authenticated_read   ON public.suppliers;
DROP POLICY suppliers_authenticated_insert ON public.suppliers;
DROP POLICY suppliers_authenticated_update ON public.suppliers;
DROP POLICY suppliers_authenticated_delete ON public.suppliers;
CREATE POLICY suppliers_authenticated_read   ON public.suppliers FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY suppliers_authenticated_insert ON public.suppliers FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY suppliers_authenticated_update ON public.suppliers FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY suppliers_authenticated_delete ON public.suppliers FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- supplier_orders
DROP POLICY supplier_orders_authenticated_read   ON public.supplier_orders;
DROP POLICY supplier_orders_authenticated_insert ON public.supplier_orders;
DROP POLICY supplier_orders_authenticated_update ON public.supplier_orders;
DROP POLICY supplier_orders_authenticated_delete ON public.supplier_orders;
CREATE POLICY supplier_orders_authenticated_read   ON public.supplier_orders FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_insert ON public.supplier_orders FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_update ON public.supplier_orders FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_delete ON public.supplier_orders FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- order_items
DROP POLICY order_items_authenticated_read   ON public.order_items;
DROP POLICY order_items_authenticated_insert ON public.order_items;
DROP POLICY order_items_authenticated_update ON public.order_items;
DROP POLICY order_items_authenticated_delete ON public.order_items;
CREATE POLICY order_items_authenticated_read   ON public.order_items FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY order_items_authenticated_insert ON public.order_items FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY order_items_authenticated_update ON public.order_items FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY order_items_authenticated_delete ON public.order_items FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- products
DROP POLICY products_authenticated_read   ON public.products;
DROP POLICY products_authenticated_insert ON public.products;
DROP POLICY products_authenticated_update ON public.products;
DROP POLICY products_authenticated_delete ON public.products;
CREATE POLICY products_authenticated_read   ON public.products FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY products_authenticated_insert ON public.products FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY products_authenticated_update ON public.products FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY products_authenticated_delete ON public.products FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- price_snapshots
DROP POLICY price_snapshots_authenticated_read   ON public.price_snapshots;
DROP POLICY price_snapshots_authenticated_insert ON public.price_snapshots;
DROP POLICY price_snapshots_authenticated_update ON public.price_snapshots;
DROP POLICY price_snapshots_authenticated_delete ON public.price_snapshots;
CREATE POLICY price_snapshots_authenticated_read   ON public.price_snapshots FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_insert ON public.price_snapshots FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_update ON public.price_snapshots FOR UPDATE USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_delete ON public.price_snapshots FOR DELETE USING ((select auth.uid()) IS NOT NULL);
