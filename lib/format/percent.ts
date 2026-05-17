/**
 * Türkçe locale yüzde formatı, işaretli.
 *  0.125  → "+%12,5"
 * -0.0825 → "-%8,25"
 *  0      → "%0"
 *  null   → "—"
 */
export function formatTrPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "%0";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "-";
  const abs = Math.abs(pct);
  const formatted = abs.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${sign}%${formatted}`;
}
