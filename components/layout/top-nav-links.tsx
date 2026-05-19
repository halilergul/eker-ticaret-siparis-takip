"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/lib/routes";

/**
 * Center nav links for the floating TopNav.
 *
 * Active item renders as a white pill with a soft shadow over the glass bar.
 * Inactive items are slate-600 text on transparent.
 */

const ITEMS = [
  { href: ROUTES.DASHBOARD, label: "Ana Sayfa", matchExact: true },
  { href: ROUTES.PRICE_CHANGES, label: "Zamlanan Ürünler", matchExact: false },
  { href: ROUTES.SETTINGS, label: "Ayarlar", matchExact: false },
] as const;

export function TopNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 items-center justify-center gap-1.5">
      {ITEMS.map((item) => {
        const isActive = item.matchExact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={
              "inline-flex h-10 items-center rounded-full px-4 text-[13.5px] transition-colors et-focus " +
              (isActive
                ? "bg-white text-slate-900 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_rgba(15,23,42,0.06)]"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
