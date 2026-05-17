"use server";

import { revalidatePath } from "next/cache";

import { dispatchScrapeWorkflow } from "@/lib/github/workflow-dispatch";
import { createClient } from "@/lib/supabase/server";
import { triggerInputSchema } from "@/lib/validations/schedule-form";

export type TriggerErrorCode =
  | "UNAUTHENTICATED"
  | "SUPPLIER_NOT_FOUND"
  | "ALREADY_RUNNING"
  | "GITHUB_API_FAILED"
  | "INTERNAL_ERROR";

export type TriggerScrapeResult =
  | { ok: true; message: string }
  | { ok: false; code: TriggerErrorCode; message: string };

const ERROR_MESSAGES: Record<TriggerErrorCode, string> = {
  UNAUTHENTICATED: "Oturum süreniz dolmuş. Lütfen yeniden giriş yapın.",
  SUPPLIER_NOT_FOUND:
    "Tedarikçi bulunamadı. Sistem yöneticisi ile irtibata geçin.",
  ALREADY_RUNNING:
    "Önceki tetikleme henüz tamamlanmadı. Birkaç dakika bekleyin.",
  GITHUB_API_FAILED:
    "Tetikleme başlatılamadı. Sistem yöneticisi ile irtibata geçin.",
  INTERNAL_ERROR: "Beklenmeyen bir hata oluştu. Tekrar deneyin.",
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function triggerScrape(
  input: unknown,
): Promise<TriggerScrapeResult> {
  const parsed = triggerInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail("INTERNAL_ERROR");
  }
  const { supplierSlug } = parsed.data;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return fail("UNAUTHENTICATED");
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("slug", supplierSlug)
    .maybeSingle();

  if (supplierError) {
    console.error("[trigger-scrape] supplier lookup error", supplierError.message);
    return fail("INTERNAL_ERROR");
  }
  if (!supplier) {
    return fail("SUPPLIER_NOT_FOUND");
  }

  const sinceIso = new Date(Date.now() - TEN_MINUTES_MS).toISOString();
  const { data: running, error: runningError } = await supabase
    .from("scrape_runs")
    .select("id")
    .eq("supplier_id", supplier.id)
    .eq("status", "running")
    .gte("started_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (runningError) {
    console.error("[trigger-scrape] concurrency check error", runningError.message);
    return fail("INTERNAL_ERROR");
  }
  if (running) {
    return fail("ALREADY_RUNNING");
  }

  const dispatch = await dispatchScrapeWorkflow({
    supplierSlug,
    triggerType: "manual",
  });
  if (!dispatch.ok) {
    return fail("GITHUB_API_FAILED");
  }

  revalidatePath("/dashboard/settings");

  return {
    ok: true,
    message: "Tetiklendi — sonuç birkaç dakika içinde görünür.",
  };
}

function fail(code: TriggerErrorCode): TriggerScrapeResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}
