-- Migration: products.barcode kolonu (009 catalog scrape)
-- Applied via mcp__supabase__apply_migration({ name: "add_products_barcode" })
-- Date: 2026-05-18
--
-- Sebep: Levent Şimşek site search muhasebe kodlarıyla (S001 gibi) substring match
-- yapıyor → 4+ ürün döndürüyor → ilk sonuç yanlış ürün olabiliyor. Modal'daki barkod
-- numarası (212102590) unique → search exact match döndürüyor. Barkod scrape sırasında
-- parse edilip burada saklanır; catalog scrape barkod öncelikli search yapar.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT NULL;

CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode) WHERE barcode IS NOT NULL;

COMMENT ON COLUMN public.products.barcode IS 'Tedarikçi sitesindeki barkod numarası (Levent Şimşek için catalog search-key; diğer tedarikçilerde null).';
