-- Feature 010: Yedekler İnşaat tedarikçi eklemesi
-- 4. tedarikçi olarak Yedekler İnşaat'ı suppliers tablosuna seed eder ve
-- scrape_schedule tablosuna otomatik scrape için bir satır ekler.
-- Idempotent: ON CONFLICT DO NOTHING — migration tekrar koşulsa hata vermez.

INSERT INTO suppliers (slug, name, base_url) VALUES
  ('yedekler', 'Yedekler İnşaat', 'https://bayi.yedekler.com.tr')
ON CONFLICT (slug) DO NOTHING;

-- enabled=false default (diğer 3 tedarikçi ile tutarlı); kullanıcı settings'ten açar.
-- daily_hour_utc=3 (~TR 06:00) cron tetiklendiğinde kullanılacak saat — açıldığında.
INSERT INTO scrape_schedule (supplier_id, enabled, daily_hour_utc)
SELECT id, false, 3 FROM suppliers WHERE slug = 'yedekler'
ON CONFLICT (supplier_id) DO NOTHING;
