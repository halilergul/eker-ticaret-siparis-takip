"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { saveSchedule } from "@/app/actions/save-schedule";
import { Button } from "@/components/ui/button";

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
  if (!iso) return "Otomatik yenileme kapalı.";
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
  return `Sonraki otomatik yenileme: ${formatter.format(new Date(iso))} (Türkiye saati)`;
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

  const watchedEnabled = watch("enabled");
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

  const switchId = `auto-${supplierSlug}`;
  const hourId = `hour-${supplierSlug}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Toggle switch */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <label
            htmlFor={switchId}
            className="block text-sm font-medium text-slate-900"
          >
            Otomatik yenileme
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Belirlenen saatte GitHub Actions tetiklenir.
          </p>
        </div>
        <label htmlFor={switchId} className="inline-flex cursor-pointer items-center">
          <input
            id={switchId}
            type="checkbox"
            {...register("enabled")}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative inline-block h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-slate-900/30 peer-focus-visible:ring-offset-2"
          >
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      {/* Hour select — disabled if auto is off */}
      <div className="space-y-1">
        <label htmlFor={hourId} className="block text-[13px] font-medium text-slate-700">
          Günlük saat (Türkiye)
        </label>
        <select
          id={hourId}
          {...register("dailyHourIst", { valueAsNumber: true })}
          disabled={!watchedEnabled}
          className="block w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none et-focus disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {pad(h)}:00
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 tnum">
          {pad(watchedIstHour)}:00 İstanbul = {pad(utcHourPreview)}:00 UTC
        </p>
      </div>

      {/* Save + status */}
      <div className="flex items-center gap-3">
        <Button kind="primary" size="md" type="submit" disabled={!isDirty || isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {message ? (
          <p
            role="status"
            className={
              message.kind === "success"
                ? "text-[13px] text-emerald-600"
                : "text-[13px] text-rose-600"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
