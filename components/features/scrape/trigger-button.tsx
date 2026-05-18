"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { triggerScrape } from "@/app/actions/trigger-scrape";
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
   * En son scrape_run satırı (auto + manual karışık). `null` → henüz hiç scrape
   * yapılmamış. `status === "running"` ise component mount olduktan sonra polling
   * otomatik başlar (sayfa yenilenince devam ediyor durumunu kullanıcıya gösterir).
   */
  initialLastRun: LastRunSnapshot;
};

type Message =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 12 * 60 * 1000; // ~12 dk; outer timeout ~9 dk + buffer

export function TriggerButton({ supplierSlug, initialLastRun }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);
  const [currentRun, setCurrentRun] = useState<LastRunSnapshot>(initialLastRun);
  const pollStartedAtRef = useRef<number | null>(null);

  const isRunning = currentRun?.status === "running";

  // Polling: currentRun.status === "running" olduğu sürece 5sn'de bir last-run
  // endpoint'ini sorgula. Status değişince durdur ve sayfayı yenile.
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
        // Güvenlik valfı: 12 dk sonra polling'i durdur; kullanıcı manuel
        // yenilemek isteyebilir. Status'u olduğu gibi bırak.
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
        // Status running'den çıktıysa: sayfa server data'sını yenile
        if (next.status !== "running" && prevStatus === "running") {
          router.refresh();
        }
      } catch {
        // network hıçkırığı — sessizce devam et, bir sonraki tick tekrar dener
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
        // Optimistic: UI'da hemen "Çalışıyor" göster. Workflow_dispatch'ten
        // DB'ye startRun yazılması birkaç saniye sürebilir; polling sırasında
        // gerçek runId ile değişir.
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

  const buttonLabel = (() => {
    if (isPending) return "Tetikleniyor...";
    if (isRunning) return "Çalışıyor...";
    return "Kontrol et";
  })();

  const buttonDisabled = isPending || isRunning;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={buttonDisabled}
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
        aria-busy={buttonDisabled}
      >
        {isRunning ? (
          <>
            <svg
              className="-ml-0.5 mr-2 h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            {buttonLabel}
          </>
        ) : (
          buttonLabel
        )}
      </button>
      {message ? (
        <p
          role="status"
          className={
            message.kind === "success"
              ? "text-sm text-emerald-700"
              : "text-sm text-rose-700"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
