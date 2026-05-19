-- Migration: products.image_url kolonu (Faz B — UI ürün kartlarında görsel)
-- Applied via mcp__supabase__apply_migration({ name: "add_products_image_url" })
-- Date: 2026-05-20
--
-- Sebep: /dashboard sipariş accordion'unda ItemCard'larda gerçek ürün görseli
-- gösterilmek isteniyor. Hotlink testi (önce yapılmış): Enderyapı CDN
-- (images.bayipro.com) ve Levent (liste.leventsimsekarmatur.com/images_buyuk)
-- domain-cross referer ile 200 dönüyor — login arkasında değil, public.
-- Scrape sırasında catalog detail sayfasından <img> src parse edilip
-- products.image_url'e yazılır; frontend `imageUrl ?? Monogram` fallback'i
-- zaten kullanıyor.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

CREATE INDEX IF NOT EXISTS products_image_url_present_idx
  ON public.products (supplier_id) WHERE image_url IS NOT NULL;

COMMENT ON COLUMN public.products.image_url IS 'Tedarikçi sitesinden hotlink edilen public ürün görsel URL''si. Login arkasında değil, supplier CDN/uploads üzerinden direkt erişilebilir.';
