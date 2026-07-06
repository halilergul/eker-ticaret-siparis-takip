#!/usr/bin/env tsx
/**
 * Cron hour-gating script (feature 007, refactored 009).
 *
 * Kullanım:
 *   tsx scripts/scrape/check-schedule.ts --supplier <slug>
 *
 * Exit code:
 *   0 → her zaman (true skip ya da true continue). GitHub Actions Step failure'ını önlemek için.
 *
 * Output (GITHUB_OUTPUT):
 *   skip=true   → workflow sonraki step'leri atlamalı (toggle off, hour mismatch, schedule missing)
 *   skip=false  → workflow scrape'i çalıştırmalı (enabled + hour match)
 *
 * NEDEN: Eski sürüm exit 78 (skip) dönerdi; GitHub Actions 2020 sonrası 78'i "neutral skip"
 * olarak değil "failure" olarak yorumluyor → workflow Failed → saatlik mail spam. Şimdi her
 * zaman 0 ile çıkıp output ile gate ediyoruz; saatlik cron'lar başarısız görünmez.
 *
 * Workflow YAML şu pattern'i kullanmalı:
 *   if: github.event_name == 'workflow_dispatch' || steps.check.outputs.skip == 'false'
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { appendFileSync } from "node:fs";

import type { Database } from "@/lib/supabase/database.types";

dotenv.config({ path: ".env.local" });

/**
 * GITHUB_OUTPUT'a key=value yazar. Lokal çalıştırıldığında no-op.
 */
function writeOutput(key: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  try {
    appendFileSync(file, `${key}=${value}\n`);
  } catch (err) {
    console.error(`[check-schedule] GITHUB_OUTPUT yazılamadı: ${String(err)}`);
  }
}

function emitSkip(reason: string): never {
  console.log(`[check-schedule] SKIP: ${reason}`);
  writeOutput("skip", "true");
  process.exit(0);
}

function emitContinue(reason: string): never {
  console.log(`[check-schedule] CONTINUE: ${reason}`);
  writeOutput("skip", "false");
  process.exit(0);
}

function emitError(reason: string): never {
  console.error(`[check-schedule] ERROR: ${reason}`);
  // Hata durumunda skip=true → workflow run'ı bozmayalım, scrape'i atlayalım
  writeOutput("skip", "true");
  process.exit(0);
}

function parseArgs(argv: string[]): { supplier?: string } {
  const out: { supplier?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--supplier") out.supplier = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.supplier) {
    emitError("--supplier zorunlu");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    emitError("NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik");
  }

  const supabase = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("scrape_schedule")
    .select("enabled, daily_hour_utc, last_auto_run_at, suppliers!inner(slug)")
    .eq("suppliers.slug", args.supplier!)
    .maybeSingle();

  if (error) {
    emitError(`db error: ${error.message}`);
  }

  if (!data) {
    emitSkip(`supplier='${args.supplier}' için scrape_schedule satırı yok`);
  }

  if (!data.enabled) {
    emitSkip(`supplier=${args.supplier} disabled`);
  }

  // 016: hour-window fix — GH Actions cron gecikirse (5-60 dk normal) currentUtcHour
  // scheduled saatten büyük olabilir. Eskiden exact match arıyordu → gecikince skip.
  // Yeni: bugün henüz auto koşmadıysa ve scheduled saat geçmişse çalıştır.
  const currentUtcHour = new Date().getUTCHours();
  if (currentUtcHour < data.daily_hour_utc) {
    emitSkip(
      `supplier=${args.supplier} too early: current UTC=${currentUtcHour} < scheduled=${data.daily_hour_utc}`,
    );
  }

  const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastRunDay = data.last_auto_run_at
    ? new Date(data.last_auto_run_at).toISOString().slice(0, 10)
    : null;
  if (lastRunDay === todayUtc) {
    emitSkip(
      `supplier=${args.supplier} already ran today (${lastRunDay})`,
    );
  }

  emitContinue(
    `supplier=${args.supplier} ready (UTC=${currentUtcHour}, scheduled=${data.daily_hour_utc}, last_auto=${lastRunDay ?? "never"})`,
  );
}

main().catch((err) => {
  console.error("[check-schedule] unexpected error", err);
  // Catch-all: skip ile çık, workflow bozulmasın
  writeOutput("skip", "true");
  process.exit(0);
});
