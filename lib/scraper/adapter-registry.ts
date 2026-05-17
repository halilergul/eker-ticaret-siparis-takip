import { ScrapeError } from "./errors";
import type { Adapter } from "./types";
import { enderyapiAdapter } from "./adapters/enderyapi";
import { ikizlerAdapter } from "./adapters/ikizler";
import { leventsimsekAdapter } from "./adapters/leventsimsek";

export const adapters: Record<string, Adapter> = {
  enderyapi: enderyapiAdapter,
  ikizler: ikizlerAdapter,
  leventsimsek: leventsimsekAdapter,
};

export function getAdapter(slug: string): Adapter {
  const adapter = adapters[slug];
  if (!adapter) {
    throw new ScrapeError({
      mode: "supplier-not-found",
      step: "bootstrap",
      details: `Bilinmeyen tedarikçi slug: "${slug}". Kayıtlı: ${Object.keys(adapters).join(", ")}`,
    });
  }
  return adapter;
}

export function listRegisteredAdapters(): Array<{
  slug: string;
  displayName: string;
}> {
  return Object.values(adapters).map((a) => ({
    slug: a.slug,
    displayName: a.displayName,
  }));
}
