-- Feature 012: Zamlanan Ürünler — son sipariş bazlı birikimli zam takibi.
--
-- Eski `get_price_changes(integer, boolean)` snapshot pencere bazlıydı. 1 yıl
-- rafta kalan + tedarikçide birden fazla zam gören ürünleri yakalayamıyordu.
-- Yeni v2: her ürün için son `order_items.unit_price_at_order` ile en güncel
-- `price_snapshots.unit_price` karşılaştırılır. Hem KDV hariç olduğundan
-- normalize gerekmez (006/009 KDV modeli).
--
-- Pencere kaldırıldı. include_drops kaldırıldı (V1 anti-goal). Yeni input:
-- filter_supplier_slug + filter_min_change_pct + sort_by.

DROP FUNCTION IF EXISTS public.get_price_changes(integer, boolean);

CREATE OR REPLACE FUNCTION public.get_price_changes_v2(
  filter_supplier_slug text DEFAULT NULL,
  filter_min_change_pct numeric DEFAULT 0,
  sort_by text DEFAULT 'change_pct'
)
RETURNS TABLE(
  product_id uuid,
  supplier_slug text,
  supplier_name text,
  product_code text,
  product_name text,
  brand text,
  last_order_price_excl_vat numeric,
  last_ordered_at timestamptz,
  last_order_no text,
  days_since_last_order integer,
  current_price_excl_vat numeric,
  current_price_captured_at timestamptz,
  change_pct numeric,
  change_amount numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH last_orders AS (
    SELECT DISTINCT ON (oi.product_id)
      oi.product_id,
      oi.unit_price_at_order AS last_price,
      so.ordered_at AS last_ordered_at,
      so.order_no AS last_order_no
    FROM public.order_items oi
    JOIN public.supplier_orders so ON so.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    ORDER BY oi.product_id, so.ordered_at DESC
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (ps.product_id)
      ps.product_id,
      ps.unit_price AS current_price,
      ps.captured_at AS current_captured_at
    FROM public.price_snapshots ps
    WHERE ps.unit_price IS NOT NULL
    ORDER BY ps.product_id, ps.captured_at DESC
  ),
  combined AS (
    SELECT
      p.id AS product_id,
      s.slug AS supplier_slug,
      s.name AS supplier_name,
      p.code AS product_code,
      p.name AS product_name,
      p.brand,
      lo.last_price,
      lo.last_ordered_at,
      lo.last_order_no,
      EXTRACT(DAY FROM (now() - lo.last_ordered_at))::integer AS days_since_last_order,
      -- Snapshot son alıştan ÖNCE ise kullanılmaz (R-004 edge case)
      CASE
        WHEN ls.current_captured_at IS NULL OR ls.current_captured_at < lo.last_ordered_at THEN NULL
        ELSE ls.current_price
      END AS current_price,
      CASE
        WHEN ls.current_captured_at IS NULL OR ls.current_captured_at < lo.last_ordered_at THEN NULL
        ELSE ls.current_captured_at
      END AS current_captured_at
    FROM public.products p
    JOIN public.suppliers s ON s.id = p.supplier_id
    JOIN last_orders lo ON lo.product_id = p.id
    LEFT JOIN latest_snapshots ls ON ls.product_id = p.id
  )
  SELECT
    c.product_id,
    c.supplier_slug,
    c.supplier_name,
    c.product_code,
    c.product_name,
    c.brand,
    c.last_price AS last_order_price_excl_vat,
    c.last_ordered_at,
    c.last_order_no,
    c.days_since_last_order,
    c.current_price AS current_price_excl_vat,
    c.current_captured_at AS current_price_captured_at,
    CASE
      WHEN c.current_price IS NULL OR c.last_price <= 0 THEN NULL
      ELSE round(((c.current_price - c.last_price) / c.last_price)::numeric, 4)
    END AS change_pct,
    CASE
      WHEN c.current_price IS NULL THEN NULL
      ELSE round((c.current_price - c.last_price)::numeric, 2)
    END AS change_amount
  FROM combined c
  WHERE
    (filter_supplier_slug IS NULL OR c.supplier_slug = filter_supplier_slug)
    AND (
      -- Sadece zamlananlar: snapshot var ve current > last
      (c.current_price IS NOT NULL AND c.current_price > c.last_price)
      -- Veya snapshot eksik durumdaki ürünler (min filter yoksa göster)
      OR (c.current_price IS NULL AND filter_min_change_pct = 0)
    )
    AND (
      -- Min change filter (snapshot eksik durumda hariç tut)
      filter_min_change_pct = 0
      OR (
        c.current_price IS NOT NULL
        AND c.last_price > 0
        AND ((c.current_price - c.last_price) / c.last_price) >= filter_min_change_pct
      )
    )
  ORDER BY
    CASE WHEN sort_by = 'change_pct' AND c.current_price IS NOT NULL AND c.last_price > 0
      THEN (c.current_price - c.last_price) / c.last_price
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'change_amount' AND c.current_price IS NOT NULL
      THEN c.current_price - c.last_price
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'days_since' THEN now() - c.last_ordered_at END DESC,
    CASE WHEN sort_by = 'last_ordered_at' THEN c.last_ordered_at END ASC NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.get_price_changes_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_changes_v2 TO anon;

COMMENT ON FUNCTION public.get_price_changes_v2 IS
  '012: Her ürün için en son sipariş anındaki birim fiyat (KDV hariç) ile en güncel catalog snapshot (KDV hariç) arasındaki delta. Pencere yok; ürün ne zaman alındıysa o tarih baz. Snapshot eksikse satır yine döner (UI rozet gösterir). filter_min_change_pct > 0 ise eksik snapshot satırları hariç tutulur.';
