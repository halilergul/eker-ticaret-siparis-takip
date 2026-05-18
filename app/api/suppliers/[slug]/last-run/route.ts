import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ScrapeRunStatus, ScrapeRunTriggerType } from "@/lib/queries/scrape-runs";

export const dynamic = "force-dynamic";

type LastRunResponse = {
  runId: string;
  status: ScrapeRunStatus;
  triggerType: ScrapeRunTriggerType;
  startedAt: string;
  finishedAt: string | null;
  ordersInserted: number;
  itemsInserted: number;
  snapshotsAdded: number;
  errorsCount: number;
} | null;

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (supplierError) {
    return NextResponse.json({ error: "supplier_lookup_failed" }, { status: 500 });
  }
  if (!supplier) {
    return NextResponse.json({ error: "supplier_not_found" }, { status: 404 });
  }

  const { data: run, error: runError } = await supabase
    .from("scrape_runs")
    .select(
      "id, status, trigger_type, started_at, finished_at, summary",
    )
    .eq("supplier_id", supplier.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return NextResponse.json({ error: "run_lookup_failed" }, { status: 500 });
  }

  let body: LastRunResponse = null;
  if (run) {
    const summary = (run.summary ?? {}) as {
      orders_inserted?: number;
      items_inserted?: number;
      snapshots_added?: number;
      errors?: unknown[];
    };
    body = {
      runId: run.id,
      status: run.status as ScrapeRunStatus,
      triggerType: run.trigger_type as ScrapeRunTriggerType,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      ordersInserted: Number(summary.orders_inserted ?? 0),
      itemsInserted: Number(summary.items_inserted ?? 0),
      snapshotsAdded: Number(summary.snapshots_added ?? 0),
      errorsCount: Array.isArray(summary.errors) ? summary.errors.length : 0,
    };
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
