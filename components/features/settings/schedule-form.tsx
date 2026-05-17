"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { saveSchedule } from "@/app/actions/save-schedule";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const ISTANBUL_OFFSET_HOURS = 3;

type Props = {
  supplierSlug: string;
  initialEnabled: boolean;
  initialDailyHourUtc: number;
};

type FormValues = {
  enabled: boolean;
  dailyHourIst: number;
};

type Message =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

function istToUtc(istHour: number): number {
  return (istHour - ISTANBUL_OFFSET_HOURS + 24) % 24;
}

function utcToIst(utcHour: number): number {
  return (utcHour + ISTANBUL_OFFSET_HOURS) % 24;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatNextRun(iso: string | null): string {
  if (!iso) return "Otomatik scrape kapalı.";
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
  return `Sonraki otomatik scrape: ${formatter.format(new Date(iso))} (Türkiye saati)`;
}

export function ScheduleForm({
  supplierSlug,
  initialEnabled,
  initialDailyHourUtc,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isDirty },
    reset,
  } = useForm<FormValues>({
    defaultValues: {
      enabled: initialEnabled,
      dailyHourIst: utcToIst(initialDailyHourUtc),
    },
  });

  const watchedIstHour = Number(watch("dailyHourIst")) || 0;
  const utcHourPreview = istToUtc(watchedIstHour);

  function onSubmit(values: FormValues) {
    setMessage(null);
    const istHour = Number(values.dailyHourIst);
    const utcHour = istToUtc(istHour);
    startTransition(async () => {
      const result = await saveSchedule({
        supplierSlug,
        enabled: values.enabled,
        dailyHourUtc: utcHour,
      });
      if (result.ok) {
        setMessage({
          kind: "success",
          text: `Ayar kaydedildi. ${formatNextRun(result.nextRunAt)}`,
        });
        reset({ enabled: values.enabled, dailyHourIst: istHour });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <label className="flex items-center gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          {...register("enabled")}
          className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>Otomatik scrape aktif</span>
      </label>

      <div className="space-y-1">
        <label
          htmlFor={`hour-${supplierSlug}`}
          className="block text-sm font-medium text-stone-700"
        >
          Günlük saat (Türkiye)
        </label>
        <select
          id={`hour-${supplierSlug}`}
          {...register("dailyHourIst", { valueAsNumber: true })}
          className="block w-32 rounded-md border-stone-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {pad(h)}:00
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500">
          {pad(watchedIstHour)}:00 İstanbul = {pad(utcHourPreview)}:00 UTC
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!isDirty || isPending}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isPending ? "Kaydediliyor..." : "Kaydet"}
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
    </form>
  );
}
