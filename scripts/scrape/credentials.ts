import * as dotenv from "dotenv";
import { z } from "zod";
import { ScrapeError } from "./errors";

const credentialsSchema = z.object({
  username: z.string().min(1, "username boş olamaz"),
  password: z.string().min(1, "password boş olamaz"),
});

const yedeklerCredentialsSchema = z.object({
  customerCode: z.string().min(1, "customer code boş olamaz"),
  userCode: z.string().min(1, "user code boş olamaz"),
  password: z.string().min(1, "password boş olamaz"),
});

export type Credentials = {
  username: string;
  password: string;
};

export type YedeklerCredentials = z.infer<typeof yedeklerCredentialsSchema>;

/**
 * `.env.local`'dan `<SLUG_UPPER>_USERNAME` ve `<SLUG_UPPER>_PASSWORD` okur.
 * Örn slug="enderyapi" → ENDERYAPI_USERNAME / ENDERYAPI_PASSWORD.
 * No-arg çağrı default `enderyapi` slug'ını kullanır (geri uyumluluk).
 *
 * Eksikse `ScrapeError({ mode: "missing-credentials" })` fırlatır.
 * Değerleri hiçbir yere log'lamaz.
 */
export function loadCredentials(slug: string = "enderyapi"): Credentials {
  dotenv.config({ path: ".env.local" });

  const upper = slug.toUpperCase().replace(/-/g, "_");
  const userKey = `${upper}_USERNAME`;
  const passKey = `${upper}_PASSWORD`;

  const result = credentialsSchema.safeParse({
    username: process.env[userKey],
    password: process.env[passKey],
  });

  if (!result.success) {
    throw new ScrapeError({
      mode: "missing-credentials",
      step: "env-load",
      details: `Eksik env değişkenleri: ${userKey}, ${passKey}`,
    });
  }

  return result.data;
}

/**
 * Yedekler özel — 3-alanlı login form (010 feature).
 * `.env.local`'dan YEDEKLER_CUSTOMER_CODE / YEDEKLER_USER_CODE / YEDEKLER_PASSWORD okur.
 *
 * Diğer tedarikçilerin 2-alanlı pattern'i (`loadCredentials`) korunur; generic'leştirme
 * yapılmadı çünkü sadece bu tedarikçi 3-alanlı.
 *
 * Eksikse `ScrapeError({ mode: "missing-credentials" })` fırlatır.
 * Değerleri hiçbir yere log'lamaz.
 */
export function loadYedeklerCredentials(): YedeklerCredentials {
  dotenv.config({ path: ".env.local" });

  const result = yedeklerCredentialsSchema.safeParse({
    customerCode: process.env.YEDEKLER_CUSTOMER_CODE,
    userCode: process.env.YEDEKLER_USER_CODE,
    password: process.env.YEDEKLER_PASSWORD,
  });

  if (!result.success) {
    throw new ScrapeError({
      mode: "missing-credentials",
      step: "env-load",
      details:
        "Eksik env değişkenleri: YEDEKLER_CUSTOMER_CODE, YEDEKLER_USER_CODE, YEDEKLER_PASSWORD",
    });
  }

  return result.data;
}
