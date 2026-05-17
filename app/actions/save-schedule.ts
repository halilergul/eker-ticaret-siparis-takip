"use server";

import { revalidatePath } from "next/cache";

import { calculateNextRunAt } from "@/lib/queries/scrape-schedule";
import { createClient } from "@/lib/supabase/server";
import { saveScheduleSchema } from "@/lib/validations/schedule-form";

export type SaveScheduleErrorCode =
  | "UNAUTHENTICATED"
  | "SUPPLIER_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "INTERNAL_ERROR";

export type SaveScheduleResult =
  | { ok: true; nextRunAt: string | null }
  | { ok: false; code: SaveScheduleErrorCode; message: string };

const ERROR_MESSAGES: Record<SaveScheduleErrorCode, string> = {
  UNAUTHENTICATED: "Oturum süreniz dolmuş. Lütfen yeniden giriş yapın.",
  SUPPLIER_NOT_FOUND: "Tedarikçi bulunamadı.",
  VALIDATION_FAILED: "Saat 0-23 arasında bir tam sayı olmalı.",
  INTERNAL_ERROR: "Ayar kaydedilemedi. Tekrar deneyin.",
};

export async function saveSchedule(
  input: unknown,
): Promise<SaveScheduleResult> {
  const parsed = saveScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const { supplierSlug, enabled, dailyHourUtc } = parsed.data;

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
    console.error("[save-schedule] supplier lookup error", supplierError.message);
    return fail("INTERNAL_ERROR");
  }
  if (!supplier) {
    return fail("SUPPLIER_NOT_FOUND");
  }

  const { error: updateError, count } = await supabase
    .from("scrape_schedule")
    .update({ enabled, daily_hour_utc: dailyHourUtc }, { count: "exact" })
    .eq("supplier_id", supplier.id);

  if (updateError) {
    console.error("[save-schedule] update error", updateError.message);
    return fail("INTERNAL_ERROR");
  }

  if ((count ?? 0) === 0) {
    const { error: insertError } = await supabase
      .from("scrape_schedule")
      .insert({
        supplier_id: supplier.id,
        enabled,
        daily_hour_utc: dailyHourUtc,
      });
    if (insertError) {
      console.error("[save-schedule] insert error", insertError.message);
      return fail("INTERNAL_ERROR");
    }
  }

  revalidatePath("/dashboard/settings");

  const nextRunDate = calculateNextRunAt(enabled, dailyHourUtc);
  return {
    ok: true,
    nextRunAt: nextRunDate ? nextRunDate.toISOString() : null,
  };
}

function fail(code: SaveScheduleErrorCode): SaveScheduleResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}
