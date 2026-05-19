"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { triggerScrape } from "@/app/actions/trigger-scrape";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type {
  ScrapeRunStatus,
  ScrapeRunTriggerType,
} from "@/lib/queries/scrape-runs";

type LastRunSnapshot = {
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

type Props = {
  supplierSlug: string;
  /**
   * En son scrape_run satırı. `status === "running"` ise component mount'tan
   * sonra polling otomatik başlar (sayfa yenilenince devam ediyor durumunu
   * kullanıcıya gösterir).
   */
  initialLastRun: LastRunSnapshot;
};

type Message =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 12 * 60 * 1000;

export function TriggerButton({ supplierSlug, initialLastRun }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);
  const [currentRun, setCurrentRun] = useState<LastRunSnapshot>(initialLastRun);
  const pollStartedAtRef = useRef<number | null>(null);

  const isRunning = currentRun?.status === "running";

  useEffect(() => {
    if (!isRunning) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current === null) {
      pollStartedAtRef.current = Date.now();
    }

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      const startedAt = pollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(
          `/api/suppliers/${encodeURIComponent(supplierSlug)}/last-run`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const next = (await res.json()) as LastRunSnapshot;
        if (cancelled) return;
        if (!next) return;
        const prevStatus = currentRun?.status;
        setCurrentRun(next);
        if (next.status !== "running" && prevStatus === "running") {
          router.refresh();
        }
      } catch {
        // ağ hıçkırığı — bir sonraki tick tekrar dener
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRunning, supplierSlug, currentRun?.status, router]);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerScrape({ supplierSlug });
      if (result.ok) {
        setMessage({ kind: "success", text: result.message });
        setCurrentRun({
          runId: "pending",
          status: "running",
          triggerType: "manual",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          ordersInserted: 0,
          itemsInserted: 0,
          snapshotsAdded: 0,
          errorsCount: 0,
        });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  // Running state: progress strip + running label per design brief §3.2 "Running" variant
  if (isRunning) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-medium text-sky-600">
            <Spinner />
            Çalışıyor…
          </div>
          <div className="text-xs text-slate-500 tnum">tarama sürüyor</div>
        </div>
        <ProgressBar indeterminate intent="info" />
        {message ? <StatusMessage message={message} /> : null}
      </div>
    );
  }

  // Idle / success / failed: primary CTA pill + optional inline message
  return (
    <div className="space-y-2">
      <Button
        kind="primary"
        size="md"
        full
        iconRight="chevR"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? "Tetikleniyor…" : "Kontrol et"}
      </Button>
      {message ? <StatusMessage message={message} /> : null}
    </div>
  );
}

function StatusMessage({ message }: { message: Message }) {
  return (
    <p
      role="status"
      className={
        message.kind === "success"
          ? "mt-2 text-[13px] text-emerald-600"
          : "mt-2 text-[13px] text-rose-600"
      }
    >
      {message.text}
    </p>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-full border-2 border-sky-500 border-t-transparent et-spin"
    />
  );
}
