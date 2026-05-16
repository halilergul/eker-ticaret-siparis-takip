-- Migration 03: Enable RLS + 4 policies (SELECT/INSERT/UPDATE/DELETE) on all 5 tables
-- Policy gate: auth.uid() IS NOT NULL — service_role bypasses automatically
-- Applied via mcp__supabase__apply_migration({ name: "rls_policies" })
-- Date: 2026-05-16

ALTER TABLE public.suppliers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

-- suppliers
CREATE POLICY suppliers_authenticated_read   ON public.suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY suppliers_authenticated_insert ON public.suppliers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY suppliers_authenticated_update ON public.suppliers FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY suppliers_authenticated_delete ON public.suppliers FOR DELETE USING (auth.uid() IS NOT NULL);

-- supplier_orders
CREATE POLICY supplier_orders_authenticated_read   ON public.supplier_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_insert ON public.supplier_orders FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_update ON public.supplier_orders FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY supplier_orders_authenticated_delete ON public.supplier_orders FOR DELETE USING (auth.uid() IS NOT NULL);

-- order_items
CREATE POLICY order_items_authenticated_read   ON public.order_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY order_items_authenticated_insert ON public.order_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY order_items_authenticated_update ON public.order_items FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY order_items_authenticated_delete ON public.order_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- products
CREATE POLICY products_authenticated_read   ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY products_authenticated_insert ON public.products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY products_authenticated_update ON public.products FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY products_authenticated_delete ON public.products FOR DELETE USING (auth.uid() IS NOT NULL);

-- price_snapshots
CREATE POLICY price_snapshots_authenticated_read   ON public.price_snapshots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_insert ON public.price_snapshots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_update ON public.price_snapshots FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY price_snapshots_authenticated_delete ON public.price_snapshots FOR DELETE USING (auth.uid() IS NOT NULL);
