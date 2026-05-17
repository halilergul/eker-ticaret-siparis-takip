import { createClient } from "@/lib/supabase/server";

export type ScheduleRow = {
  supplierId: string;
  supplierSlug: string;
  supplierName: string;
  enabled: boolean;
  dailyHourUtc: number;
  lastAutoRunAt: string | null;
  lastAutoRunStatus: "success" | "partial" | "failed" | "aborted" | null;
};

type ScheduleQueryRow = {
  supplier_id: string;
  enabled: boolean;
  daily_hour_utc: number;
  last_auto_run_at: string | null;
  last_auto_run_status: string | null;
  suppliers: { slug: string; name: string } | null;
};

export async function listSchedules(): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scrape_schedule")
    .select(
      "supplier_id, enabled, daily_hour_utc, last_auto_run_at, last_auto_run_status, suppliers!inner(slug, name)",
    )
    .order("created_at", { ascending: true })
    .returns<ScheduleQueryRow[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    supplierId: row.supplier_id,
    supplierSlug: row.suppliers?.slug ?? "",
    supplierName: row.suppliers?.name ?? "",
    enabled: row.enabled,
    dailyHourUtc: row.daily_hour_utc,
    lastAutoRunAt: row.last_auto_run_at,
    lastAutoRunStatus: row.last_auto_run_status as ScheduleRow["lastAutoRunStatus"],
  }));
}

export async function getScheduleBySupplierSlug(
  slug: string,
): Promise<ScheduleRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scrape_schedule")
    .select(
      "supplier_id, enabled, daily_hour_utc, last_auto_run_at, last_auto_run_status, suppliers!inner(slug, name)",
    )
    .eq("suppliers.slug", slug)
    .maybeSingle<ScheduleQueryRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    supplierId: data.supplier_id,
    supplierSlug: data.suppliers?.slug ?? "",
    supplierName: data.suppliers?.name ?? "",
    enabled: data.enabled,
    dailyHourUtc: data.daily_hour_utc,
    lastAutoRunAt: data.last_auto_run_at,
    lastAutoRunStatus: data.last_auto_run_status as ScheduleRow["lastAutoRunStatus"],
  };
}

export function calculateNextRunAt(
  enabled: boolean,
  dailyHourUtc: number,
  now: Date = new Date(),
): Date | null {
  if (!enabled) return null;

  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      dailyHourUtc,
      0,
      0,
      0,
    ),
  );

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
