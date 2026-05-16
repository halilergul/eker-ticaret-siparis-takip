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

export async function startRun(supplierId: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("scrape_runs")
    .insert({
      supplier_id: supplierId,
      status: "running",
      summary: {},
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
