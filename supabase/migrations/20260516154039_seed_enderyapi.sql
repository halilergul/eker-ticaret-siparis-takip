-- Migration 05: seed enderyapi supplier
-- Idempotent via ON CONFLICT
-- Applied via mcp__supabase__apply_migration({ name: "seed_enderyapi" })
-- Date: 2026-05-16

INSERT INTO public.suppliers (slug, name, base_url)
VALUES ('enderyapi', 'Enderyapi B2B', 'https://b2b.enderyapi.com.tr')
ON CONFLICT (slug) DO NOTHING;
