# Contract — Schema SQL

**Feature**: 003-supabase-schema | **Tarih**: 2026-05-16

Bu doküman 5 migration dosyasının üretilecek SQL'lerinin **kontratlarıdır** — son uygulama biraz farklı olabilir (örn. timestamp), ama yapı/isim/kısıt aynı kalmalı.

Migration dosya adlandırması: `supabase/migrations/<YYYYMMDDHHMMSS>_<short_name>.sql`. Uygulama sırasında **hem** MCP `apply_migration` ile remote'a uygulanır **hem** repo'ya dosya olarak kaydedilir (R-010).

---

## Migration 01 — `core_tables`

5 tabloyu sırayla oluşturur. FK sırası önemli (suppliers → supplier_orders, products → price_snapshots).

```sql
-- 1) suppliers
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

-- 2) supplier_orders
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

-- 3) order_items
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

-- 4) products
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

-- 5) price_snapshots
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
```

---

## Migration 02 — `updated_at_trigger`

Tek trigger fonksiyonu, 4 tabloya `BEFORE UPDATE` trigger. `price_snapshots` immutable, trigger almıyor.

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER supplier_orders_set_updated_at
  BEFORE UPDATE ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## Migration 03 — `rls_policies`

Tüm tablolarda RLS aktif. Her tablo için 4 policy (SELECT/INSERT/UPDATE/DELETE), tümü `auth.uid() IS NOT NULL`.

```sql
ALTER TABLE public.suppliers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

-- Pattern, 5 tabloya da uygulanır.
-- Aşağıda yalnızca `suppliers` için örnek; migration'da hepsi.

CREATE POLICY "authenticated_read"   ON public.suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_insert" ON public.suppliers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_update" ON public.suppliers FOR UPDATE
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_delete" ON public.suppliers FOR DELETE USING (auth.uid() IS NOT NULL);

-- ... (supplier_orders, order_items, products, price_snapshots için tekrarlanır)
```

---

## Migration 04 — `record_price_observation`

RPC fonksiyon. Scraper bunu çağırır. SECURITY INVOKER.

```sql
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
    -- Fiyat değiştiyse snapshot ekle + current_unit_price'i güncelle
    IF v_current IS DISTINCT FROM p_unit_price THEN
      INSERT INTO public.price_snapshots (product_id, captured_at, unit_price)
      VALUES (v_product_id, p_captured_at, p_unit_price);

      UPDATE public.products
        SET current_unit_price = p_unit_price,
            name               = p_product_name,
            last_seen_at       = p_captured_at
        WHERE id = v_product_id;
    ELSE
      -- Aynı fiyat: sadece adı ve last_seen_at güncelle
      UPDATE public.products
        SET name         = p_product_name,
            last_seen_at = p_captured_at
        WHERE id = v_product_id;
    END IF;
  ELSE
    -- Fiyat NULL: sadece ad ve last_seen_at güncelle (price snapshot YOK)
    UPDATE public.products
      SET name         = p_product_name,
          last_seen_at = p_captured_at
      WHERE id = v_product_id;
  END IF;

  RETURN v_product_id;
END;
$$;
```

**Type contract (TypeScript)**:

```ts
// supabase-js call:
const { data, error } = await supabase.rpc('record_price_observation', {
  p_supplier_id: '<uuid>',
  p_product_code: 'VDA-M8-PSL',
  p_product_name: 'Vida M8 paslanmaz',
  p_unit_price: 110.50,   // number | null
  // p_captured_at?: string (ISO) — opsiyonel, default now()
});
// data: string (uuid) | null; error: PostgrestError | null
```

---

## Migration 05 — `seed_enderyapi`

Enderyapi supplier kaydını ekler. Idempotent (`ON CONFLICT DO NOTHING`).

```sql
INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('enderyapi', 'Enderyapi B2B', 'https://b2b.enderyapi.com.tr')
ON CONFLICT (slug) DO NOTHING;
```

---

## Type Contract — `lib/supabase/database.types.ts`

MCP `generate_typescript_types` çıktısı tam dosya olarak `lib/supabase/database.types.ts`'e yazılır. Kontrat:

```ts
export type Database = {
  public: {
    Tables: {
      suppliers:        { Row: {...}; Insert: {...}; Update: {...}; Relationships: [] }
      supplier_orders:  { Row: {...}; Insert: {...}; Update: {...}; Relationships: [FK to suppliers] }
      order_items:      { Row: {...}; Insert: {...}; Update: {...}; Relationships: [FK to supplier_orders] }
      products:         { Row: {...}; Insert: {...}; Update: {...}; Relationships: [FK to suppliers] }
      price_snapshots:  { Row: {...}; Insert: {...}; Update: {...}; Relationships: [FK to products] }
    }
    Functions: {
      record_price_observation: {
        Args: {
          p_supplier_id: string
          p_product_code: string
          p_product_name: string
          p_unit_price: number | null
          p_captured_at?: string
        }
        Returns: string
      }
    }
    // ...
  }
}
```

**Client değişiklikleri** (mevcut dosyalar, type generic ekleme):

```ts
// lib/supabase/client.ts
import type { Database } from "./database.types";
export const createClient = () => createBrowserClient<Database>(/* ... */);

// lib/supabase/server.ts
import type { Database } from "./database.types";
export const createClient = async () => createServerClient<Database>(/* ... */);
```

---

## Constraint test matrix (özet — quickstart.md detay)

| Constraint | Test |
|------------|------|
| `suppliers.slug` unique | İki kez `INSERT slug='enderyapi'` → ikincisi `23505` |
| `suppliers.slug` format | `INSERT slug='Enderyapi B2B'` → `23514` (büyük harf, boşluk) |
| `supplier_orders (supplier_id, order_no)` unique | Aynı order_no iki kez → `23505` |
| `supplier_orders.total_amount >= 0` | `total_amount=-1` → `23514` |
| `order_items (order_id, product_code)` unique | Aynı kod iki kez → `23505` |
| `order_items.quantity > 0` | `quantity=0` → `23514` |
| `products (supplier_id, code)` unique | Aynı code iki kez → `23505` |
| `products.current_unit_price >= 0` | `current_unit_price=-1` → `23514` |
| `price_snapshots.unit_price >= 0` | `unit_price=-1` → `23514` |
| CASCADE: order silinince items silinir | `DELETE supplier_orders.id` → ilgili `order_items` 0 |
| RESTRICT: supplier silinemez orders varsa | `DELETE suppliers.id` → `23503` |

---

## Notlar

- **Migration sırası**: 01 → 02 → 03 → 04 → 05. Bağımlılık: 02 tablolara, 03 tablolara, 04 fonksiyona (her sıra için DDL'in tabloyu görmesi yeterli).
- **Rollback**: bu feature için rollback migration'ları gerekmiyor (feature yeni schema; gerekirse `DROP TABLE` ile temizlenir). 005+ değişikliklerinde her yeni migration kendi rollback notunu içersin.
- **Multi-currency** (gelecek): `CHECK currency IN ('TRY')` → `('TRY','EUR',...)` — 5 tabloyu da `ALTER TABLE` ile güncelle.
