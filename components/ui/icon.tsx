import { createElement, type CSSProperties } from "react";

/**
 * Minimal inline SVG icon system. Each entry in {@link Icons} is either:
 * - a string (a single `d` path)
 * - an array of strings (multi-path)
 * - an array of tuples `[tag, attrs]` for non-path shapes (circle, rect)
 *
 * Pulled from the Claude Design handoff (test/project/lib.jsx).
 * Stroke: 1.6, currentColor — recolor via parent `color`.
 */

type SvgTag = "circle" | "rect" | "path" | "line" | "polyline" | "polygon";

type IconShape =
  | string
  | Array<string | [SvgTag, Record<string, string | number>]>;

export const Icons: Record<string, IconShape> = {
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  chevL: "M15 6l-9 6 9 6",
  chevU: "M6 15l6-6 6 6",
  bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  alert:
    "M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  info: "M12 16v-4M12 8h.01M12 22a10 10 0 110-20 10 10 0 010 20z",
  warning:
    "M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  refresh: "M3 12a9 9 0 1015.49-6.36L21 8M21 3v5h-5",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  settings: [
    ["circle", { cx: 12, cy: 12, r: 3 }],
    "M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09A1.7 1.7 0 0015 4.6a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9c.16.38.5.71 1 .9.2.07.41.1.62.1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z",
  ],
  trash: [
    "M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6",
    "M10 11v6M14 11v6",
  ],
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDn: "M12 5v14M19 12l-7 7-7-7",
  caretUp: "M6 14l6-6 6 6",
  caretDn: "M6 10l6 6 6-6",
  box: ["M21 8l-9-5-9 5 9 5 9-5z", "M3 8v8l9 5 9-5V8", "M3 8l9 5 9-5"],
  tool: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", ["circle", { cx: 12, cy: 12, r: 3 }]],
  eyeOff:
    "M1 1l22 22M9.88 4.24A11.83 11.83 0 0112 4c7 0 11 8 11 8a17.7 17.7 0 01-3.06 4.19M6.61 6.61A17.7 17.7 0 001 12s4 8 11 8c1.66 0 3.18-.27 4.55-.74",
  link: [
    "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  ],
  cal: [
    ["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    "M16 2v4M8 2v4M3 10h18",
  ],
  clock: [["circle", { cx: 12, cy: 12, r: 9 }], "M12 7v5l3 2"],
  back: "M19 12H5M12 19l-7-7 7-7",
  menu: "M3 6h18M3 12h18M3 18h18",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  truck: [
    "M1 3h15v13H1zM16 8h4l3 3v5h-7z",
    ["circle", { cx: 5.5, cy: 18.5, r: 2.5 }],
    ["circle", { cx: 18.5, cy: 18.5, r: 2.5 }],
  ],
  user: [
    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2",
    ["circle", { cx: 12, cy: 7, r: 4 }],
  ],
  power: ["M18.36 6.64a9 9 0 11-12.73 0", "M12 2v10"],
};

export type IconName = keyof typeof Icons;

type IconProps = {
  name: IconName;
  size?: number;
  stroke?: string;
  fill?: string;
  /** stroke-width */
  sw?: number;
  style?: CSSProperties;
  className?: string;
};

function renderShapes(d: IconShape) {
  if (typeof d === "string") return <path d={d} />;
  return d.map((entry, i) => {
    if (typeof entry === "string") return <path key={i} d={entry} />;
    const [tag, attrs] = entry;
    // Use createElement to bypass TS's strict per-element-tag attr typing
    // for dynamic SVG primitives (path | circle | rect | ...).
    return createElement(tag, { key: i, ...attrs });
  });
}

export function Icon({
  name,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  sw = 1.6,
  style,
  className,
}: IconProps) {
  const d = Icons[name];
  if (!d) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Icon] unknown icon name: ${String(name)}`);
    }
    return null;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {renderShapes(d)}
    </svg>
  );
}
