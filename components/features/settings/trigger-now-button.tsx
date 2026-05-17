"use client";

import { useState, useTransition } from "react";

import { triggerScrape } from "@/app/actions/trigger-scrape";

type Props = {
  supplierSlug: string;
};

type Message =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

export function TriggerNowButton({ supplierSlug }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerScrape({ supplierSlug });
      if (result.ok) {
        setMessage({ kind: "success", text: result.message });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
        aria-busy={isPending}
      >
        {isPending ? "Tetikleniyor..." : "Şimdi tetikle"}
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
