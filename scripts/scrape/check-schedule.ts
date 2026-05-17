#!/usr/bin/env tsx
/**
 * Cron hour-gating script (feature 007).
 *
 * Kullanım:
 *   tsx scripts/scrape/check-schedule.ts --supplier <slug>
 *
 * Exit codes:
 *   0  → continue (scrape can run)
 *   78 → skip (toggle off OR hour mismatch)
 *   1  → error (env missing, db error)
 *
 * GitHub Actions workflow ilk step olarak çağırır. Sonraki step'ler
 * `if: steps.check.outcome == 'success'` gate'lenir.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import type { Database } from "@/lib/supabase/database.types";

dotenv.config({ path: ".env.local" });

const EXIT_CONTINUE = 0;
const EXIT_ERROR = 1;
const EXIT_SKIP = 78;

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
    console.error("[check-schedule] --supplier zorunlu");
    process.exit(EXIT_ERROR);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[check-schedule] NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik",
    );
    process.exit(EXIT_ERROR);
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("scrape_schedule")
    .select("enabled, daily_hour_utc, suppliers!inner(slug)")
    .eq("suppliers.slug", args.supplier)
    .maybeSingle();

  if (error) {
    console.error(`[check-schedule] db error: ${error.message}`);
    process.exit(EXIT_ERROR);
  }

  if (!data) {
    console.error(
      `[check-schedule] supplier='${args.supplier}' için scrape_schedule satırı yok`,
    );
    process.exit(EXIT_SKIP);
  }

  if (!data.enabled) {
    console.log(`[check-schedule] supplier=${args.supplier} disabled → skip`);
    process.exit(EXIT_SKIP);
  }

  const currentUtcHour = new Date().getUTCHours();
  if (data.daily_hour_utc !== currentUtcHour) {
    console.log(
      `[check-schedule] supplier=${args.supplier} hour=${data.daily_hour_utc} != current=${currentUtcHour} → skip`,
    );
    process.exit(EXIT_SKIP);
  }

  console.log(
    `[check-schedule] supplier=${args.supplier} hour matches (UTC=${currentUtcHour}) → continue`,
  );
  process.exit(EXIT_CONTINUE);
}

main().catch((err) => {
  console.error("[check-schedule] unexpected error", err);
  process.exit(EXIT_ERROR);
});
