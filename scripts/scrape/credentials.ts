import * as dotenv from "dotenv";
import { z } from "zod";
import { ScrapeError } from "./errors";

const credentialsSchema = z.object({
  ENDERYAPI_USERNAME: z.string().min(1, "ENDERYAPI_USERNAME boş olamaz"),
  ENDERYAPI_PASSWORD: z.string().min(1, "ENDERYAPI_PASSWORD boş olamaz"),
});

export type Credentials = {
  username: string;
  password: string;
};

/**
 * `.env.local`'dan ENDERYAPI_USERNAME ve ENDERYAPI_PASSWORD okur.
 * Eksikse `ScrapeError({ mode: "missing-credentials" })` fırlatır.
 * Değerleri hiçbir yere log'lamaz.
 */
export function loadCredentials(): Credentials {
  dotenv.config({ path: ".env.local" });

  const result = credentialsSchema.safeParse({
    ENDERYAPI_USERNAME: process.env.ENDERYAPI_USERNAME,
    ENDERYAPI_PASSWORD: process.env.ENDERYAPI_PASSWORD,
  });

  if (!result.success) {
    throw new ScrapeError({
      mode: "missing-credentials",
      step: "env-load",
    });
  }

  return {
    username: result.data.ENDERYAPI_USERNAME,
    password: result.data.ENDERYAPI_PASSWORD,
  };
}
