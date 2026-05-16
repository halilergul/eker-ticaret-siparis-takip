-- Migration 04: record_price_observation RPC
-- Scraper bunu çağırır; idempotent fiyat snapshot davranışı
-- SECURITY INVOKER; service_role bypasses RLS
-- Applied via mcp__supabase__apply_migration({ name: "record_price_observation" })
-- Date: 2026-05-16

CREATE OR REPLACE FUNCTION public.record_price_observation(
  p_supplier_id  uuid,
  p_product_code text,
  p_product_name text,
  p_unit_price   numeric,
  p_captured_at  timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id  uuid;
  v_current     numeric;
BEGIN
  -- 1) Ürünü ara veya yarat
  SELECT id, current_unit_price
    INTO v_product_id, v_current
    FROM public.products
    WHERE supplier_id = p_supplier_id AND code = p_product_code
    FOR UPDATE;

  IF v_product_id IS NULL THEN
    INSERT INTO public.products (supplier_id, code, name, current_unit_price, last_seen_at)
    VALUES (
      p_supplier_id,
      p_product_code,
      p_product_name,
      p_unit_price,
      p_captured_at
    )
    RETURNING id INTO v_product_id;

    -- İlk gözlem: snapshot da yaz (ancak fiyat NULL değilse)
    IF p_unit_price IS NOT NULL THEN
      INSERT INTO public.price_snapshots (product_id, captured_at, unit_price)
      VALUES (v_product_id, p_captured_at, p_unit_price);
    END IF;

    RETURN v_product_id;
  END IF;

  -- 2) Mevcut ürün: fiyat geldiyse karşılaştır
  IF p_unit_price IS NOT NULL THEN
    IF v_current IS DISTINCT FROM p_unit_price THEN
      INSERT INTO public.price_snapshots (product_id, captured_at, unit_price)
      VALUES (v_product_id, p_captured_at, p_unit_price);

      UPDATE public.products
        SET current_unit_price = p_unit_price,
            name               = p_product_name,
            last_seen_at       = p_captured_at
        WHERE id = v_product_id;
    ELSE
      UPDATE public.products
        SET name         = p_product_name,
            last_seen_at = p_captured_at
        WHERE id = v_product_id;
    END IF;
  ELSE
    UPDATE public.products
      SET name         = p_product_name,
          last_seen_at = p_captured_at
      WHERE id = v_product_id;
  END IF;

  RETURN v_product_id;
END;
$$;
