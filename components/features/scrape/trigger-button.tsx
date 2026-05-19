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

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 12 * 60 * 1000;

export function TriggerButton({ supplierSlug, initialLastRun }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    const fetchAndUpdate = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/suppliers/${encodeURIComponent(supplierSlug)}/last-run`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const next = (await res.json()) as LastRunSnapshot;
        if (cancelled || !next) return;

        // **Yarış durumu koruması**: polling sadece "newer" run'ı kabul etsin.
        // Optimistic running state'i daha eski (önceki tamamlanmış) bir run
        // ezmesin — pre-insert pattern + workflow_dispatch async olduğundan
        // /last-run kısa süreliğine eski success satırı dönebilir.
        const prev = currentRun;
        if (prev) {
          const nextTs = new Date(next.startedAt).getTime();
          const prevTs = new Date(prev.startedAt).getTime();
          if (Number.isFinite(nextTs) && Number.isFinite(prevTs)) {
            if (
              prev.status === "running" &&
              next.status !== "running" &&
              nextTs < prevTs
            ) {
              return;
            }
          }
        }

        const prevStatus = prev?.status;
        setCurrentRun(next);
        if (next.status !== "running" && prevStatus === "running") {
          router.refresh();
        }
      } catch {
        // ağ hıçkırığı — bir sonraki tick tekrar dener
      }
    };

    const interval = setInterval(() => {
      const startedAt = pollStartedAtRef.current ?? Date.now();
      // 12dk timeout: interval'ı durdurmuyoruz, sadece bu tick'i atlıyoruz.
      // Kullanıcı sekmeye döndüğünde visibilitychange handler 12dk'yi sıfırlar
      // ve polling kaldığı yerden devam eder (background tab throttle / uzun
      // bekleme sonrası self-heal).
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) return;
      void fetchAndUpdate();
    }, POLL_INTERVAL_MS);

    // Tab visibility / focus: kullanıcı sekmeye döndüğünde anında bir fetch
    // tetikle ve 12dk penceresini sıfırla. Chrome arka plan sekmeleri
    // setInterval'ı agresif throttle ettiğinden, görünür hale gelindiğinde
    // **mutlaka** bir kez DB durumu çekilmeli — aksi halde iş bitti ama kart
    // "Çalışıyor" donar.
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      pollStartedAtRef.current = Date.now();
      void fetchAndUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isRunning, supplierSlug, currentRun, router]);

  function handleClick() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await triggerScrape({ supplierSlug });
      if (result.ok) {
        // Success path'te inline mesaj YOK — buton zaten "Çalışıyor…"a dönüyor
        // ve animasyonlu progress bar var; ek "Tetiklendi" satırı kart
        // yüksekliğini sıçratıyordu.
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
        setErrorMessage(result.message);
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
      </div>
    );
  }

  // Idle / success / failed: primary CTA pill + (optional) error inline
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
      {errorMessage ? (
        <p role="alert" className="mt-2 text-[13px] text-rose-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
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
