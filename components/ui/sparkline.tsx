import { useId } from "react";

/**
 * Tiny SVG sparkline used inside KPI cards and price-change rows.
 * Amber stroke with soft gradient fill — per design brief §3.15.
 *
 * Pure SVG, no chart library. Server-renderable.
 */

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Whether to fill the area under the line. */
  fill?: boolean;
  className?: string;
};

export function Sparkline({
  data,
  width = 120,
  height = 40,
  color = "#F59E0B",
  fill = true,
  className = "",
}: Props) {
  const id = useId();
  const pad = 2;
  if (data.length === 0) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1e-6, max - min);

  const points = data.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, data.length - 1);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${width - pad},${height} L${pad},${height} Z`;
  const gradId = `spark-grad-${id}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
