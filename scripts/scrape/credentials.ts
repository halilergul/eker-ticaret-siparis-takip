import * as dotenv from "dotenv";
import { z } from "zod";
import { ScrapeError } from "./errors";

const credentialsSchema = z.object({
  username: z.string().min(1, "username boş olamaz"),
  password: z.string().min(1, "password boş olamaz"),
});

export type Credentials = {
  username: string;
  password: string;
};

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
