import type { Json } from "@/lib/supabase/database.types";
import { ScrapeError } from "./errors";
import { getServiceClient } from "./supabase-writer";
import type { ScrapeSummary } from "./types";

export type ScrapeRunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "aborted";

export type ScrapeRunTriggerType = "auto" | "manual" | "unknown";

/**
 * Pickup-or-create pattern:
 *
 * Manuel tetiklemelerde UI'da "Çalışıyor" göstergesinin sayfa yenileme sonrası
 * da kalıcı olması için triggerScrape Server Action `scrape_runs` satırını
 * **pre-insert** ediyor (summary.pending_dispatch=true flag'iyle). Workflow
 * dispatch'i kabul edip runner ayağa kalktığında — typik olarak 15-40 sn
 * sonra — bu fonksiyon o pending satırı **bulup pickup** eder, böylece DB'de
 * yetim "pending" satır kalmaz ve UI tek satır gösterir.
 *
 * Sadece son 5 dakikadaki aynı supplier+manuel+running+pending_dispatch=true
 * satırı pickup edilir. Bulunmazsa yeni satır insert edilir (auto/cron için
 * de davranış böyle).
 */
export async function startRun(
  supplierId: string,
  triggerType: ScrapeRunTriggerType = "unknown",
): Promise<string> {
  const supabase = getServiceClient();

  if (triggerType === "manual") {
    const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: pending } = await supabase
      .from("scrape_runs")
      .select("id, summary")
      .eq("supplier_id", supplierId)
      .eq("trigger_type", "manual")
      .eq("status", "running")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const flag =
      pending?.summary &&
      typeof pending.summary === "object" &&
      !Array.isArray(pending.summary) &&
      (pending.summary as Record<string, unknown>).pending_dispatch === true;

    if (pending && flag) {
      // Pickup: pending_dispatch flag'ini temizle (summary'i sıfırla — script
      // bundan sonra normal akışta dolduracak).
      const { error } = await supabase
        .from("scrape_runs")
        .update({ summary: {} as unknown as Json })
        .eq("id", pending.id);
      if (error) {
        console.error(
          `[run-logger] pickup pending dispatch failed (${pending.id}): ${error.message}`,
        );
      }
      return pending.id;
    }
  }

  // Yeni satır: auto/cron veya manuel pickup'sız fallback
  const { data, error } = await supabase
    .from("scrape_runs")
    .insert({
      supplier_id: supplierId,
      status: "running",
      summary: {},
      trigger_type: triggerType,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ScrapeError({
      mode: "db-write-failed",
      step: "start-run",
      details: error?.message ?? "scrape_runs INSERT failed",
    });
  }
  return data.id;
}

async function finalizeRun(
  runId: string,
  status: Exclude<ScrapeRunStatus, "running">,
  summary: ScrapeSummary,
  errorMessage?: string,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("scrape_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      summary: summary as unknown as Json,
      error_message: errorMessage ?? null,
    })
    .eq("id", runId);

  if (error) {
    // Log but don't throw — orchestrator çıkışta zaten exit code'u set ediyor
    console.error(`[run-logger] scrape_runs UPDATE failed: ${error.message}`);
  }
}

export function succeedRun(
  runId: string,
  summary: ScrapeSummary,
): Promise<void> {
  return finalizeRun(runId, "success", summary);
}

export function partialRun(
  runId: string,
  summary: ScrapeSummary,
): Promise<void> {
  return finalizeRun(runId, "partial", summary);
}

export function failRun(
  runId: string,
  errorMessage: string,
  summary: ScrapeSummary,
): Promise<void> {
  return finalizeRun(runId, "failed", summary, errorMessage);
}

export function abortRun(
  runId: string,
  summary: ScrapeSummary,
  errorMessage?: string,
): Promise<void> {
  return finalizeRun(
    runId,
    "aborted",
    summary,
    errorMessage ?? "Global timeout (5dk) aşıldı",
  );
}

/**
 * Otomatik koşum sonucunu scrape_schedule cache satırına yazar.
 * Sadece trigger_type='auto' olduğunda çağrılır. Hata fırlatmaz.
 */
export async function updateScheduleCache(
  supplierId: string,
  status: Exclude<ScrapeRunStatus, "running">,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("scrape_schedule")
    .update({
      last_auto_run_at: new Date().toISOString(),
      last_auto_run_status: status,
    })
    .eq("supplier_id", supplierId);
  if (error) {
    console.error(
      `[run-logger] scrape_schedule cache update failed: ${error.message}`,
    );
  }
}
