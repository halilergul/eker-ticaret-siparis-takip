export type SparklinePoint = {
  capturedAt: string;
  price: number;
};

type Props = {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  className?: string;
};

export function Sparkline({
  points,
  width = 280,
  height = 48,
  className,
}: Props) {
  if (points.length < 2) {
    return (
      <span className="text-xs text-slate-400">— yeterli veri yok</span>
    );
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const prices = sorted.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const stepX = sorted.length > 1 ? width / (sorted.length - 1) : 0;
  const padY = 4;
  const innerHeight = height - padY * 2;

  const coords = sorted.map((p, i) => {
    const x = i * stepX;
    const y = padY + innerHeight - ((p.price - min) / range) * innerHeight;
    return [x, y] as const;
  });

  const polyline = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const lastPrice = prices[prices.length - 1] ?? 0;
  const firstPrice = prices[0] ?? 0;
  const isUp = lastPrice > firstPrice;
  const stroke = isUp ? "#be123c" : "#047857"; // rose-700 / emerald-700

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Fiyat tarihçesi mini grafik"
      className={className}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={polyline}
      />
      {coords.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="2"
          fill={stroke}
        />
      ))}
    </svg>
  );
}
