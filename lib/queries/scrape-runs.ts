import { createClient } from "@/lib/supabase/server";

export type ScrapeRunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "aborted";

export type ScrapeRunTriggerType = "auto" | "manual" | "unknown";

export type ScrapeRunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: ScrapeRunStatus;
  triggerType: ScrapeRunTriggerType;
  errorMessage: string | null;
  ordersInserted: number;
  ordersSkipped: number;
  itemsInserted: number;
  itemsSkipped: number;
  snapshotsAdded: number;
  errorsCount: number;
  /** 015: tracking_enabled=true ürünlerin hata sayısı (status'u etkileyen). */
  effectiveErrors: number;
  /** 015: tracking_enabled=false ürünlerin hata sayısı (devre dışı). */
  staleErrors: number;
  /** 015: bu run'da yeni disable edilen ürün sayısı. */
  newlyDisabled: number;
  errorDetails: Array<{
    step: string;
    mode: string;
    detail: string;
    timestamp: string;
  }>;
};

type SummaryShape = {
  orders_inserted?: number;
  orders_skipped?: number;
  items_inserted?: number;
  items_skipped?: number;
  snapshots_added?: number;
  effective_errors?: number;
  stale_errors?: number;
  newly_disabled?: number;
  errors?: Array<{
    step?: string;
    mode?: string;
    detail?: string;
    timestamp?: string;
  }>;
};

export async function listRecentRuns(
  supplierId: string,
  limit = 10,
): Promise<ScrapeRunRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scrape_runs")
    .select(
      "id, started_at, finished_at, status, trigger_type, error_message, summary",
    )
    .eq("supplier_id", supplierId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const summary = (row.summary ?? {}) as SummaryShape;
    const errors = Array.isArray(summary.errors) ? summary.errors : [];
    return {
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status as ScrapeRunStatus,
      triggerType: row.trigger_type as ScrapeRunTriggerType,
      errorMessage: row.error_message,
      ordersInserted: Number(summary.orders_inserted ?? 0),
      ordersSkipped: Number(summary.orders_skipped ?? 0),
      itemsInserted: Number(summary.items_inserted ?? 0),
      itemsSkipped: Number(summary.items_skipped ?? 0),
      snapshotsAdded: Number(summary.snapshots_added ?? 0),
      errorsCount: errors.length,
      effectiveErrors: Number(summary.effective_errors ?? 0),
      staleErrors: Number(summary.stale_errors ?? 0),
      newlyDisabled: Number(summary.newly_disabled ?? 0),
      errorDetails: errors.map((e) => ({
        step: String(e?.step ?? ""),
        mode: String(e?.mode ?? ""),
        detail: redactSecrets(String(e?.detail ?? "")),
        timestamp: String(e?.timestamp ?? ""),
      })),
    };
  });
}

export async function getLatestRunBySupplier(
  supplierId: string,
): Promise<ScrapeRunRow | null> {
  const runs = await listRecentRuns(supplierId, 1);
  return runs[0] ?? null;
}

const SECRET_REGEX = /\b(password|token|bearer|api[-_]?key|secret|username)[^\s,;]*/gi;

function redactSecrets(text: string): string {
  return text.replace(SECRET_REGEX, "[REDACTED]");
}
