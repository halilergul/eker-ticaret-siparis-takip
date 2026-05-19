/**
 * Image placeholder (monogram) per design brief §3.9.
 * slate-100 bg, slate-400 fg, first letter (uppercase), weight-600.
 *
 * Used as the fallback for product images that haven't been scraped yet.
 * Identity is conveyed by the visible product name/code nearby, so the
 * monogram itself is aria-hidden.
 */

type Props = {
  /** Source text (usually product name); first character is used as the letter. */
  name?: string | null;
  /** Visual scale variant. `card` = 24px font (~80-160px tile), `thumb` = 14px (40px). */
  size?: "card" | "thumb";
  className?: string;
};

export function Monogram({ name, size = "card", className = "" }: Props) {
  const letter = (name?.trim().charAt(0) ?? "•").toUpperCase();
  const fontSize = size === "card" ? "text-2xl" : "text-sm";
  return (
    <div
      aria-hidden="true"
      className={[
        "w-full h-full inline-flex items-center justify-center bg-slate-100 text-slate-400 font-semibold",
        fontSize,
        className,
      ].join(" ")}
    >
      {letter}
    </div>
  );
}
