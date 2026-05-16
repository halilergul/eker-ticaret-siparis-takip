-- Migration 01: core tables (suppliers, supplier_orders, order_items, products, price_snapshots)
-- Applied via mcp__supabase__apply_migration({ name: "core_tables" })
-- Date: 2026-05-16

CREATE TABLE public.suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  base_url    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT suppliers_base_url_protocol CHECK (base_url LIKE 'http%')
);

CREATE TABLE public.supplier_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_no      text NOT NULL,
  status        text NOT NULL,
  ordered_at    timestamptz NOT NULL,
  total_amount  numeric(14,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'TRY',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_orders_unique_order_no UNIQUE (supplier_id, order_no),
  CONSTRAINT supplier_orders_total_nonneg CHECK (total_amount >= 0),
  CONSTRAINT supplier_orders_currency_supported CHECK (currency IN ('TRY')),
  CONSTRAINT supplier_orders_order_no_nonempty CHECK (length(order_no) > 0)
);
CREATE INDEX supplier_orders_supplier_idx ON public.supplier_orders (supplier_id);
CREATE INDEX supplier_orders_ordered_at_idx ON public.supplier_orders (ordered_at DESC);

CREATE TABLE public.order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  product_code          text NOT NULL,
  product_name          text NOT NULL,
  quantity              numeric(12,3) NOT NULL,
  unit_price_at_order   numeric(14,2) NOT NULL,
  currency              text NOT NULL DEFAULT 'TRY',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_unique_code_per_order UNIQUE (order_id, product_code),
  CONSTRAINT order_items_qty_pos CHECK (quantity > 0),
  CONSTRAINT order_items_price_nonneg CHECK (unit_price_at_order >= 0),
  CONSTRAINT order_items_currency_supported CHECK (currency IN ('TRY')),
  CONSTRAINT order_items_code_nonempty CHECK (length(product_code) > 0)
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);
CREATE INDEX order_items_product_code_idx ON public.order_items (product_code);

CREATE TABLE public.products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  code                text NOT NULL,
  name                text NOT NULL,
  current_unit_price  numeric(14,2),
  last_seen_at        timestamptz,
  currency            text NOT NULL DEFAULT 'TRY',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_unique_code_per_supplier UNIQUE (supplier_id, code),
  CONSTRAINT products_price_nonneg CHECK (current_unit_price IS NULL OR current_unit_price >= 0),
  CONSTRAINT products_currency_supported CHECK (currency IN ('TRY')),
  CONSTRAINT products_code_nonempty CHECK (length(code) > 0)
);
CREATE INDEX products_supplier_idx ON public.products (supplier_id);

CREATE TABLE public.price_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  unit_price   numeric(14,2) NOT NULL,
  currency     text NOT NULL DEFAULT 'TRY',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_snapshots_unit_price_nonneg CHECK (unit_price >= 0),
  CONSTRAINT price_snapshots_currency_supported CHECK (currency IN ('TRY'))
);
CREATE INDEX price_snapshots_product_captured_idx ON public.price_snapshots (product_id, captured_at DESC);
