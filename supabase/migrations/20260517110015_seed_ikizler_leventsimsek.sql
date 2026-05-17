-- Migration: seed ikizler + leventsimsek suppliers (feature 008)
-- Applied via mcp__supabase__apply_migration({ name: "seed_ikizler_leventsimsek" })
-- Date: 2026-05-17
-- Idempotent via ON CONFLICT (slug unique)

INSERT INTO public.suppliers (slug, name, base_url)
VALUES
  ('ikizler', 'İkizler Hırdavat', 'http://bayi.ikizlerhirdavat.com'),
  ('leventsimsek', 'Levent Şimşek Armatür', 'https://liste.leventsimsekarmatur.com')
ON CONFLICT (slug) DO NOTHING;
