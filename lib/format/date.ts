const TR_TIMEZONE = "Europe/Istanbul";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TR_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TR_TIMEZONE,
});

const relativeFormatter = new Intl.RelativeTimeFormat("tr-TR", {
  numeric: "auto",
});

export function formatTrDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0 || diffDays > 6) return dateFormatter.format(date);
  if (diffDays === 0) return relativeFormatter.format(0, "day");
  return relativeFormatter.format(-diffDays, "day");
}

export function formatTrDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
