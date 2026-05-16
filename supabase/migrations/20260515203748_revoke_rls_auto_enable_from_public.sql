-- Supabase'in "Enable automatic RLS" özelliği public.rls_auto_enable() fonksiyonu kurar.
-- Bu fonksiyon SECURITY DEFINER çalışır ve Data API üzerinden /rest/v1/rpc ile
-- dışarıdan çağrılabilir durumda. Event trigger'ın çalışması için bu yetki gerekli değil;
-- sadece harici çağrıyı kapatıyoruz.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
